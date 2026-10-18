// Configuração da rota. Tudo pode ser sobrescrito por variáveis de ambiente
// (no GitHub: Settings → Secrets and variables → Actions → Variables).

export function loadRoute(env = process.env) {
  return {
    from: env.ORIGIN || 'GRU',
    to: env.DESTINATION || 'BKK',
    outbound: env.OUTBOUND_DATE || '2027-04-11',
    inbound: env.RETURN_DATE || '2027-05-02',
    currency: env.CURRENCY || 'BRL',
    adults: Number(env.ADULTS || 1),
    airline: (env.AIRLINE || 'QR').toUpperCase(), // Qatar Airways
  };
}

export function loadSettings(env = process.env) {
  return {
    dropPct: Number(env.ALERT_DROP_PCT || 5), // queda mínima (%) vs. leitura anterior
    minAbsDrop: Number(env.ALERT_MIN_DROP || 50), // e queda mínima em R$
    digest: env.SEND_DAILY_DIGEST !== 'false', // resumo diário no período da manhã
    deepMorningOnly: env.DEEP_CHECK_ALWAYS !== 'true', // busca vendedores (Decolar etc.) só de manhã
    timezone: env.TZ_NAME || 'America/Sao_Paulo',
  };
}

export const HISTORY_PATH = 'data/history.json';
export const HISTORY_LIMIT = 1000;

export function googleFlightsUrl(route) {
  const q = `Flights to ${route.to} from ${route.from} on ${route.outbound} through ${route.inbound}`;
  return `https://www.google.com/travel/flights?hl=pt-BR&curr=${route.currency}&q=${encodeURIComponent(q)}`;
}
