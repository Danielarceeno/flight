import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParams, cheapestOption, cheapestOverall, describe, sellersFrom, operatedBy, serpSearch } from '../src/serpapi.js';
import { fetchPrices } from '../src/fetchPrices.js';
import { loadRoute } from '../src/config.js';
import { search, booking, fakeFetch } from './helpers.js';

const route = loadRoute({});

test('rota padrão: GRU→BKK, 11/04/2027 a 02/05/2027, Qatar', () => {
  assert.deepEqual(
    [route.from, route.to, route.outbound, route.inbound, route.airline, route.currency],
    ['GRU', 'BKK', '2027-04-11', '2027-05-02', 'QR', 'BRL'],
  );
});

test('buildParams filtra Qatar e é ida e volta', () => {
  const p = buildParams(route, 'KEY');
  assert.equal(p.engine, 'google_flights');
  assert.equal(p.include_airlines, 'QR');
  assert.equal(p.type, '1');
  assert.equal(p.return_date, '2027-05-02');
});

test('cheapestOption ignora outras companhias mesmo que mais baratas', () => {
  const best = cheapestOption(search, 'QR');
  assert.equal(best.price, 7890);
  assert.equal(operatedBy({ flights: [{ flight_number: 'TK 16' }] }, 'QR'), false);
});

test('cheapestOption devolve null sem voo da companhia', () => {
  assert.equal(cheapestOption({ best_flights: [], other_flights: [] }, 'QR'), null);
  assert.equal(cheapestOption({}, 'QR'), null);
});

test('operatedBy reconhece codeshare pelo nome da companhia quando o número do voo não tem o prefixo', () => {
  // número de voo sem prefixo QR (codeshare), mas campo airline confirma a operadora
  const codeshare = { flights: [{ flight_number: '5Z 9012', airline: 'Qatar Airways' }] };
  assert.equal(operatedBy(codeshare, 'QR'), true);
  // nem prefixo nem nome batem: não é Qatar
  const outro = { flights: [{ flight_number: '5Z 9012', airline: 'LATAM' }] };
  assert.equal(operatedBy(outro, 'QR'), false);
});

test('cheapestOverall acha o menor preço entre todas as companhias, mesmo fora do filtro', () => {
  const overall = cheapestOverall(search);
  assert.equal(overall.price, 6100); // Turkish Airlines, mais barata que a Qatar (7890) na fixture
  assert.equal(overall.flightNumber, 'TK 16');
});

test('describe resume paradas, conexão e voos', () => {
  const d = describe(cheapestOption(search, 'QR'));
  assert.equal(d.from, 'GRU');
  assert.equal(d.to, 'BKK');
  assert.equal(d.stops, 1);
  assert.deepEqual(d.layovers, ['DOH']);
  assert.deepEqual(d.flightNumbers, ['QR 774', 'QR 836']);
});

test('sellersFrom deduplica por vendedor, soma trechos separados e ordena', () => {
  const s = sellersFrom(booking);
  assert.deepEqual(s.map((x) => x.name), ['Decolar', 'Qatar Airways + Qatar Airways', 'Qatar Airways', 'Kiwi.com']);
  assert.equal(s[0].price, 7650); // menor preço da Decolar
  assert.equal(s[1].price, 7850); // trechos separados somados
});

test('serpSearch não vaza a chave no erro HTTP', async () => {
  await assert.rejects(
    () => serpSearch(buildParams(route, 'SEGREDO123'), fakeFetch({ failWith: 429 })),
    (e) => /429/.test(e.message) && !/SEGREDO123/.test(e.message),
  );
});

test('serpSearch sinaliza esgotamento de cota em HTTP 429', async () => {
  await assert.rejects(
    () => serpSearch(buildParams(route, 'K'), fakeFetch({ failWith: 429 })),
    /cota de buscas provavelmente esgotada/,
  );
});

test('serpSearch sinaliza esgotamento de cota quando o corpo reporta o erro', async () => {
  const f = async () => ({ ok: true, status: 200, json: async () => ({ error: 'You have run out of searches for this month.' }) });
  await assert.rejects(() => serpSearch(buildParams(route, 'K'), f), /cota de buscas provavelmente esgotada/);
});

test('serpSearch não confunde erro comum com esgotamento de cota', async () => {
  await assert.rejects(
    () => serpSearch(buildParams(route, 'K'), fakeFetch({ failWith: 500 })),
    (e) => /HTTP 500/.test(e.message) && !/cota/.test(e.message),
  );
});

test('fetchPrices rápido: 1 chamada; profundo: 3 chamadas e acha a Decolar', async () => {
  const f1 = fakeFetch();
  const quick = await fetchPrices(route, 'K', { fetchImpl: f1 });
  assert.equal(f1.calls.length, 1);
  assert.equal(quick.qatar.price, 7890);
  assert.deepEqual(quick.sellers, []);

  const f2 = fakeFetch();
  const deep = await fetchPrices(route, 'K', { deep: true, fetchImpl: f2 });
  assert.equal(f2.calls.length, 3);
  assert.ok(f2.calls[1].includes('departure_token=DEP_TOKEN_QR_7890'));
  assert.ok(f2.calls[2].includes('booking_token=BOOK_TOKEN_1')); // retorno mais barato
  assert.equal(deep.sellers[0].name, 'Decolar');
});

test('fetchPrices expõe o menor preço geral (overall) sem busca extra', async () => {
  const r = await fetchPrices(route, 'K', { fetchImpl: fakeFetch() });
  assert.equal(r.overall.price, 6100);
  assert.equal(r.overall.flightNumber, 'TK 16');
});

test('falha na busca de vendedores não derruba o preço da Qatar', async () => {
  let n = 0;
  const flaky = async (url) => {
    n++;
    if (n === 2) throw new Error('rede caiu');
    return fakeFetch()(url);
  };
  const r = await fetchPrices(route, 'K', { deep: true, fetchImpl: flaky });
  assert.equal(r.qatar.price, 7890);
  assert.equal(r.deepError, 'rede caiu');
});
