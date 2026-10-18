import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOnce, periodNow } from '../src/run.js';
import { buildEmail } from '../src/email.js';
import { loadRoute } from '../src/config.js';
import { fakeFetch, entry } from './helpers.js';

const tmpHistory = async () => join(await mkdtemp(join(tmpdir(), 'fm-')), 'h.json');
const ENV = { SERPAPI_KEY: 'K' };
const at = (iso) => new Date(iso);

test('periodNow usa horário de Brasília (08h, 14h, 20h)', () => {
  assert.equal(periodNow(at('2026-10-18T11:00:00Z')), 'morning');
  assert.equal(periodNow(at('2026-10-18T17:00:00Z')), 'afternoon');
  assert.equal(periodNow(at('2026-10-18T23:00:00Z')), 'night');
  assert.equal(periodNow(at('2026-10-18T03:30:00Z')), 'night'); // 00h30 BRT
});

test('primeira execução (manhã): busca profunda, e-mail de ativação com Decolar', async () => {
  const historyPath = await tmpHistory();
  const sent = [];
  const f = fakeFetch();
  const r = await runOnce({ env: ENV, now: at('2026-10-18T11:00:00Z'), fetchImpl: f, sender: async (m) => sent.push(m), historyPath });
  assert.equal(r.decision.kind, 'first');
  assert.equal(f.calls.length, 3);
  assert.equal(r.entry.best.price, 7650);
  assert.equal(r.entry.best.source, 'Decolar');
  assert.equal(r.entry.decolar, 7650);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Monitor ativo/);
  assert.match(sent[0].text, /Decolar: .*7\.650/);
  const saved = JSON.parse(await readFile(historyPath, 'utf8'));
  assert.equal(saved.entries.length, 1);
});

test('tarde, preço igual: 1 chamada, sem e-mail', async () => {
  const historyPath = await tmpHistory();
  const sent = [];
  const opts = { env: ENV, fetchImpl: undefined, sender: async (m) => sent.push(m), historyPath };
  await runOnce({ ...opts, now: at('2026-10-18T11:00:00Z'), fetchImpl: fakeFetch() });
  sent.length = 0;
  const f = fakeFetch();
  const r = await runOnce({ ...opts, now: at('2026-10-18T17:00:00Z'), fetchImpl: f });
  assert.equal(f.calls.length, 1);
  assert.equal(r.decision.alert, false);
  assert.equal(sent.length, 0);
});

test('erro de API grava no histórico e não envia alerta de preço', async () => {
  const historyPath = await tmpHistory();
  const sent = [];
  const r = await runOnce({ env: ENV, now: at('2026-10-18T17:00:00Z'), fetchImpl: fakeFetch({ failWith: 500 }), sender: async (m) => sent.push(m), historyPath });
  assert.match(r.entry.error, /500/);
  assert.equal(sent.length, 0);
});

test('sem SERPAPI_KEY vira erro claro', async () => {
  const r = await runOnce({ env: {}, now: new Date(), fetchImpl: fakeFetch(), sender: async () => {}, historyPath: await tmpHistory() });
  assert.match(r.entry.error, /SERPAPI_KEY/);
});

test('falha no envio é registrada e o alerta é reavaliado na próxima', async () => {
  const historyPath = await tmpHistory();
  const bad = async () => { throw new Error('smtp recusou'); };
  const r1 = await runOnce({ env: ENV, now: at('2026-10-18T17:00:00Z'), fetchImpl: fakeFetch(), sender: bad, historyPath });
  assert.equal(r1.sent, false);
  assert.equal(r1.sendError, 'smtp recusou');
  const sent = [];
  const r2 = await runOnce({ env: ENV, now: at('2026-10-18T23:00:00Z'), fetchImpl: fakeFetch(), sender: async (m) => sent.push(m), historyPath });
  assert.equal(r2.decision.kind, 'first');
  assert.equal(sent.length, 1);
});

test('e-mail: assunto, preços e links; escapa HTML', () => {
  const route = loadRoute({});
  const e = {
    ...entry(7650, { period: 'morning', deep: true }),
    best: { source: 'Decolar <b>', price: 7650 },
    qatar: { price: 7890, stops: 1, layovers: ['DOH'], totalMinutes: 1255 },
    sellers: [{ name: 'Decolar', price: 7650 }, { name: 'Qatar Airways', price: 7890 }],
  };
  const m = buildEmail({ decision: { kind: 'drop', alert: true, pct: 6.2, prev: 8160 }, entry: e, stats: { min: 7800 }, route });
  assert.match(m.subject, /caiu 6,?\.?2%|caiu 6\.2%/);
  assert.match(m.subject, /7\.650/);
  assert.match(m.html, /google\.com\/travel\/flights/);
  assert.match(m.html, /qatarairways\.com/);
  assert.match(m.html, /decolar\.com/);
  assert.ok(!m.html.includes('Decolar <b>'));
  assert.match(m.html, /Decolar &lt;b&gt;/);
});

test('e-mail mostra o menor preço geral só quando mais barato que o melhor canal', () => {
  const route = loadRoute({});
  const base = { ...entry(7890, { period: 'morning', deep: true }), best: { source: 'Qatar Airways', price: 7890 }, sellers: [] };

  const comOutraCompanhia = { ...base, overall: { price: 6100, airline: 'Turkish Airlines' } };
  const m1 = buildEmail({ decision: { kind: 'first', alert: true }, entry: comOutraCompanhia, stats: {}, route });
  assert.match(m1.text, /Preço mais barato na busca.*Turkish Airlines/);
  assert.match(m1.html, /Preço mais barato na busca.*Turkish Airlines/);

  const semDiferenca = { ...base, overall: { price: 7890, airline: 'Qatar Airways' } };
  const m2 = buildEmail({ decision: { kind: 'first', alert: true }, entry: semDiferenca, stats: {}, route });
  assert.ok(!m2.text.includes('Preço mais barato na busca'));
  assert.ok(!m2.html.includes('Preço mais barato na busca'));
});
