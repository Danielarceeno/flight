import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadRoute, loadSettings, HISTORY_PATH } from './config.js';
import { fetchPrices } from './fetchPrices.js';
import { loadHistory, saveHistory, stats } from './history.js';
import { decide } from './alert.js';
import { buildEmail, sendEmail, isDecolar } from './email.js';

export function periodNow(date = new Date(), tz = 'America/Sao_Paulo') {
  const h =
    Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(date)) % 24;
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'night';
}

export function buildEntry({ prices, period, now }) {
  const entry = { ts: now.toISOString(), period, qatar: prices.qatar, sellers: prices.sellers, insights: prices.insights };
  if (prices.deepError) entry.deepError = prices.deepError;
  if (prices.overall) entry.overall = prices.overall;
  const channels = [];
  if (prices.qatar) channels.push({ source: 'Qatar Airways (Google Flights)', price: prices.qatar.price });
  for (const s of prices.sellers) channels.push({ source: s.name, price: s.price });
  if (channels.length) {
    entry.best = channels.reduce((a, b) => (b.price < a.price ? b : a));
    const dec = prices.sellers.find((s) => isDecolar(s.name));
    if (dec) entry.decolar = dec.price;
  }
  return entry;
}

export async function runOnce({
  env = process.env,
  now = new Date(),
  fetchImpl = fetch,
  sender = (msg) => sendEmail(msg, env),
  historyPath = HISTORY_PATH,
  forcePeriod,
} = {}) {
  const route = loadRoute(env);
  const settings = loadSettings(env);
  const period = forcePeriod || env.PERIOD || periodNow(now, settings.timezone);
  const history = await loadHistory(historyPath);

  let entry;
  try {
    if (!env.SERPAPI_KEY) throw new Error('SERPAPI_KEY não configurada');
    const deep = settings.deepMorningOnly ? period === 'morning' || history.length === 0 : true;
    const prices = await fetchPrices(route, env.SERPAPI_KEY, { deep, fetchImpl });
    entry = buildEntry({ prices, period, now });
    entry.deep = deep;
  } catch (e) {
    entry = { ts: now.toISOString(), period, error: e.message };
  }

  const decision = decide(history, entry, settings);
  let sent = false;
  let sendError = null;
  if (decision.alert) {
    try {
      await sender(buildEmail({ decision, entry, history, stats: stats(history), route }));
      sent = true;
    } catch (e) {
      sendError = e.message;
    }
  }
  // grava sempre o histórico; se o e-mail falhou, a entrada é marcada e o alerta é reavaliado na próxima coleta
  if (sendError) entry.sendError = sendError;
  await saveHistory(historyPath, [...history, entry]);
  return { entry, decision, sent, sendError };
}

async function main() {
  const dry = env_flag(process.env.DRY_RUN);
  const sender = dry
    ? async (msg) => {
        await mkdir('out', { recursive: true });
        await writeFile('out/last-email.html', msg.html);
        console.log(`[dry-run] assunto: ${msg.subject}\n${msg.text}\n(HTML em out/last-email.html)`);
      }
    : undefined;
  const result = await runOnce(sender ? { sender } : {});
  const { entry, decision, sent, sendError } = result;
  console.log(
    entry.error
      ? `Falha na coleta: ${entry.error}`
      : `Melhor preço: ${entry.best ? entry.best.price + ' (' + entry.best.source + ')' : 'nenhum voo encontrado'}`,
  );
  console.log(`Decisão: ${decision.kind}${sent ? ' — e-mail enviado' : ''}`);
  if (sendError) {
    console.error(`Erro ao enviar e-mail: ${sendError}`);
    process.exitCode = 1;
  }
}

function env_flag(v) {
  return v === '1' || v === 'true';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
