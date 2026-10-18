import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartHtml } from '../src/chart.js';
import { loadRoute } from '../src/config.js';
import { entry } from './helpers.js';

const route = loadRoute({});
const when = new Date('2026-10-18T12:00:00Z');

test('sem histórico: página avisa que não há leituras, sem gráfico', () => {
  const html = buildChartHtml([], route, { generatedAt: when });
  assert.match(html, /Ainda sem leituras registradas/);
  assert.ok(!html.includes('<svg'));
});

test('com histórico: mostra menor preço, último preço e pontos no gráfico', () => {
  const history = [entry(8000), entry(7500), entry(7800)];
  const html = buildChartHtml(history, route, { generatedAt: when });
  assert.match(html, /<svg/);
  assert.match(html, /7\.500/); // menor preço
  assert.match(html, /7\.800/); // último preço
  assert.match(html, /"p":8000/);
  assert.match(html, /"p":7500/);
  assert.match(html, /"p":7800/);
});

test('ignora entradas sem preço (erro de coleta) nas estatísticas', () => {
  const history = [entry(8000), { ts: 'x', period: 'night', error: 'falha' }];
  const html = buildChartHtml(history, route, { generatedAt: when });
  assert.match(html, /1 leitura/);
});

test('escapa nomes de fonte com HTML no texto exibido (stat e tabela)', () => {
  const history = [entry(8000, { best: { source: 'Decolar <b>', price: 8000 } })];
  const html = buildChartHtml(history, route, { generatedAt: when });
  // o texto visível (fora do <script>) precisa estar escapado
  const beforeScript = html.split('<script>')[0];
  assert.ok(!beforeScript.includes('Decolar <b>'));
  assert.match(beforeScript, /Decolar &lt;b&gt;/);
});
