import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadRoute, HISTORY_PATH } from './config.js';
import { loadHistory, validEntries } from './history.js';
import { brl, esc } from './util.js';

export const CHART_PATH = 'docs/index.html';

// Página estática (sem dependências externas) com o histórico de preços.
// Pensada para ser publicada via GitHub Pages a partir da pasta docs/.
export function buildChartHtml(entries, route, { generatedAt = new Date() } = {}) {
  const valid = validEntries(entries);
  const points = valid.map((e) => ({ t: e.ts, p: e.best.price, source: e.best.source }));
  const min = points.length ? Math.min(...points.map((p) => p.p)) : null;
  const last = points.length ? points[points.length - 1] : null;
  const dataJson = JSON.stringify(points);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Histórico de preços ${esc(route.from)} → ${esc(route.to)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: Arial, Helvetica, sans-serif; background: #f4f6fb; color: #1c2333; margin: 0; padding: 24px; }
  .card { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #5b6577; font-size: 13px; margin-bottom: 16px; }
  .stats { display: flex; gap: 24px; margin-bottom: 8px; }
  .stat b { font-size: 22px; display: block; color: #FF7A1A; }
  .stat span { font-size: 12px; color: #5b6577; }
  svg { width: 100%; height: 280px; margin-top: 12px; display: block; }
  .empty { color: #8a93a5; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  td, th { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1117; color: #e6e9f0; }
    .card { background: #181b24; box-shadow: none; }
    .sub, .stat span { color: #9aa3b5; }
    td, th { border-bottom-color: #2a2e3a; }
  }
</style>
</head>
<body>
<div class="card">
  <h1>${esc(route.from)} → ${esc(route.to)} · ${esc(route.outbound)} a ${esc(route.inbound)}</h1>
  <div class="sub">Gerado em ${esc(generatedAt.toISOString())} · ${points.length} leitura(s) válida(s)</div>
  ${
    points.length
      ? `
  <div class="stats">
    <div class="stat"><b>${esc(brl(min, route.currency))}</b><span>Menor preço registrado</span></div>
    <div class="stat"><b>${esc(brl(last.p, route.currency))}</b><span>Último preço (${esc(last.source)})</span></div>
  </div>
  <svg id="chart" viewBox="0 0 760 280" preserveAspectRatio="none" role="img" aria-label="Gráfico de preço ao longo do tempo"></svg>
  <table>
    <thead><tr><th>Data</th><th>Preço</th><th>Fonte</th></tr></thead>
    <tbody>
      ${points
        .slice(-15)
        .reverse()
        .map((p) => `<tr><td>${esc(new Date(p.t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</td><td>${esc(brl(p.p, route.currency))}</td><td>${esc(p.source)}</td></tr>`)
        .join('')}
    </tbody>
  </table>`
      : '<p class="empty">Ainda sem leituras registradas.</p>'
  }
</div>
<script>
const points = ${dataJson};
if (points.length > 1) {
  const svg = document.getElementById('chart');
  const W = 760, H = 280, PAD = 32;
  const prices = points.map((p) => p.p);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = (max - min) || 1;
  const x = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(p.p).toFixed(1)).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };
  svg.appendChild(mk('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: '#cfd5e3' }));
  svg.appendChild(mk('path', { d: path, fill: 'none', stroke: '#1A73E8', 'stroke-width': '2' }));
  points.forEach((p, i) => svg.appendChild(mk('circle', { cx: x(i), cy: y(p.p), r: 2.5, fill: '#1A73E8' })));
}
</script>
</body>
</html>
`;
}

async function main() {
  const route = loadRoute(process.env);
  const history = await loadHistory(process.env.HISTORY_PATH || HISTORY_PATH);
  const html = buildChartHtml(history, route);
  const out = process.env.CHART_OUT || CHART_PATH;
  await mkdir(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  await writeFile(out, html);
  console.log(`Gráfico gerado em ${out} (${validEntries(history).length} leituras válidas).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
