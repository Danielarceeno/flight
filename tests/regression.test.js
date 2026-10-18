// Testes de regressão: fixam o comportamento ponta a ponta (fixtures → entrada
// de histórico → decisão → e-mail) pra pegar qualquer mudança não intencional
// nesse caminho crítico, mesmo que os testes unitários de cada módulo passem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOnce } from '../src/run.js';
import { buildChartHtml } from '../src/chart.js';
import { loadRoute } from '../src/config.js';
import { fakeFetch } from './helpers.js';

const tmpHistory = async () => join(await mkdtemp(join(tmpdir(), 'fm-regress-')), 'h.json');
const ENV = { SERPAPI_KEY: 'K' };

test('regressão: coleta profunda com as fixtures atuais produz sempre o mesmo resultado', async () => {
  const historyPath = await tmpHistory();
  const sent = [];
  const r = await runOnce({
    env: ENV,
    now: new Date('2026-10-18T11:00:00Z'), // manhã em Brasília
    fetchImpl: fakeFetch(),
    sender: async (m) => sent.push(m),
    historyPath,
  });

  // Se algum desses valores mudar, uma das fixtures ou a lógica de parsing mudou.
  assert.deepEqual(
    {
      period: r.entry.period,
      deep: r.entry.deep,
      qatarPrice: r.entry.qatar.price,
      overallPrice: r.entry.overall.price,
      overallFlight: r.entry.overall.flightNumber,
      bestPrice: r.entry.best.price,
      bestSource: r.entry.best.source,
      decolarPrice: r.entry.decolar,
      decisionKind: r.decision.kind,
      sent: r.sent,
    },
    {
      period: 'morning',
      deep: true,
      qatarPrice: 7890,
      overallPrice: 6100,
      overallFlight: 'TK 16',
      bestPrice: 7650,
      bestSource: 'Decolar',
      decolarPrice: 7650,
      decisionKind: 'first',
      sent: true,
    },
  );

  assert.match(sent[0].subject, /Monitor ativo/);
  assert.match(sent[0].html, /Decolar/);
  assert.match(sent[0].html, /Turkish Airlines|6\.100/); // contexto do preço geral

  const saved = JSON.parse(await readFile(historyPath, 'utf8'));
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.entries[0].best.price, 7650);
});

test('regressão: sequência manhã → tarde → noite com preço caindo gera o fluxo de alertas esperado', async () => {
  const historyPath = await tmpHistory();
  const kinds = [];
  const opts = { env: ENV, sender: async () => {}, historyPath };

  // 3 coletas simulando preços decrescentes (reaproveita a fixture "search" só pra tarde/noite,
  // então fixamos o preço via um fetch que devolve preços diferentes a cada chamada).
  let call = 0;
  const pricesPerCall = [7890, 7890, 7890, 7890, 6500]; // manhã usa 3 chamadas (preço estável); tarde repete o preço; noite cai
  const stub = async (url) => {
    const price = pricesPerCall[Math.min(call++, pricesPerCall.length - 1)];
    const u = new URL(url);
    if (u.searchParams.get('departure_token')) {
      return { ok: true, status: 200, json: async () => ({ best_flights: [{ flights: [], price, booking_token: 'BOOK_TOKEN_1' }] }) };
    }
    if (u.searchParams.get('booking_token')) {
      return { ok: true, status: 200, json: async () => ({ booking_options: [{ together: { book_with: 'Qatar Airways', price } }] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        best_flights: [{ flights: [{ flight_number: 'QR 774' }], price, departure_token: 'DEP' }],
        other_flights: [],
      }),
    };
  };

  const r1 = await runOnce({ ...opts, now: new Date('2026-10-18T11:00:00Z'), fetchImpl: stub });
  kinds.push(r1.decision.kind);
  const r2 = await runOnce({ ...opts, now: new Date('2026-10-18T17:00:00Z'), fetchImpl: stub });
  kinds.push(r2.decision.kind);
  const r3 = await runOnce({ ...opts, now: new Date('2026-10-18T23:00:00Z'), fetchImpl: stub });
  kinds.push(r3.decision.kind);

  assert.deepEqual(kinds, ['first', 'none', 'new-low']);
  assert.equal(r3.entry.best.price, 6500);
});

test('regressão: gráfico gerado a partir de um histórico fixo contém os valores esperados', () => {
  const route = loadRoute({});
  const history = [
    { ts: '2026-10-01T11:00:00.000Z', period: 'morning', best: { source: 'Decolar', price: 8200 } },
    { ts: '2026-10-02T11:00:00.000Z', period: 'morning', best: { source: 'Qatar Airways', price: 7650 } },
  ];
  const html = buildChartHtml(history, route, { generatedAt: new Date('2026-10-18T12:00:00Z') });
  assert.match(html, /2 leitura/);
  assert.match(html, /7\.650/);
  assert.match(html, /"p":8200/);
  assert.match(html, /"p":7650/);
});
