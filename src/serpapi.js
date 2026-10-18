// Cliente mínimo do SerpApi (engine google_flights) e parsers puros.

const ENDPOINT = 'https://serpapi.com/search.json';

const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Nome completo por código IATA, usado como reforço quando o número do voo
// (codeshare) não traz o prefixo da companhia operadora.
const AIRLINE_NAMES = { QR: 'qatar airways' };

export function buildParams(route, apiKey, extra = {}) {
  return {
    engine: 'google_flights',
    departure_id: route.from,
    arrival_id: route.to,
    outbound_date: route.outbound,
    return_date: route.inbound,
    type: '1', // ida e volta
    currency: route.currency,
    hl: 'pt-br',
    gl: 'br',
    adults: String(route.adults),
    include_airlines: route.airline,
    api_key: apiKey,
    ...extra,
  };
}

// true quando a resposta (HTTP ou corpo) indica cota/limite de busca esgotado,
// pra diferenciar isso de uma falha de rede comum no log e no e-mail de saúde.
function isQuotaError(status, message = '') {
  if (status === 429) return true;
  return /run out of searches|quota|limit exceeded|monthly.*search/i.test(message);
}

export async function serpSearch(params, fetchImpl = fetch) {
  const res = await fetchImpl(`${ENDPOINT}?${new URLSearchParams(params)}`);
  if (!res.ok) {
    // nunca inclui a URL no erro (tem a chave)
    const quota = isQuotaError(res.status);
    throw new Error(`SerpApi HTTP ${res.status}${quota ? ' (cota de buscas provavelmente esgotada)' : ''}`);
  }
  const json = await res.json();
  if (json.error) {
    const quota = isQuotaError(res.status, json.error);
    throw new Error(`SerpApi: ${json.error}${quota ? ' (cota de buscas provavelmente esgotada)' : ''}`);
  }
  return json;
}

export function flightOptions(json) {
  return [...(json.best_flights || []), ...(json.other_flights || [])];
}

export function operatedBy(option, airline) {
  const code = String(airline).toUpperCase();
  const name = AIRLINE_NAMES[code];
  return (option.flights || []).some((l) => {
    if (String(l.flight_number || '').toUpperCase().startsWith(code)) return true;
    return name ? String(l.airline || '').toLowerCase() === name : false;
  });
}

export function cheapestOption(json, airline) {
  const opts = flightOptions(json).filter((o) => isPrice(o.price) && operatedBy(o, airline));
  if (!opts.length) return null;
  return opts.reduce((a, b) => (b.price < a.price ? b : a));
}

// Menor preço entre todas as companhias (sem filtro), só pra contexto no e-mail.
export function cheapestOverall(json) {
  const opts = flightOptions(json).filter((o) => isPrice(o.price));
  if (!opts.length) return null;
  const best = opts.reduce((a, b) => (b.price < a.price ? b : a));
  const leg = (best.flights || [])[0];
  return { price: best.price, airline: leg?.airline || null, flightNumber: leg?.flight_number || null };
}

export function describe(option) {
  const legs = option.flights || [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  return {
    price: option.price,
    from: first?.departure_airport?.id ?? null,
    to: last?.arrival_airport?.id ?? null,
    departs: first?.departure_airport?.time ?? null,
    arrives: last?.arrival_airport?.time ?? null,
    stops: Math.max(legs.length - 1, 0),
    layovers: (option.layovers || []).map((l) => l.id || l.name).filter(Boolean),
    totalMinutes: option.total_duration ?? null,
    flightNumbers: legs.map((l) => l.flight_number).filter(Boolean),
  };
}

// Vendedores que ofertam o voo (tela "Opções de reserva" do Google Flights).
export function sellersFrom(json) {
  const byName = new Map();
  const add = (name, price) => {
    if (!isPrice(price)) return;
    const key = String(name || '?').trim();
    if (!byName.has(key) || price < byName.get(key)) byName.set(key, price);
  };
  for (const o of json.booking_options || []) {
    if (o.together) add(o.together.book_with, o.together.price);
    if (o.departing && o.returning && isPrice(o.departing.price) && isPrice(o.returning.price)) {
      add(`${o.departing.book_with} + ${o.returning.book_with}`, o.departing.price + o.returning.price);
    }
  }
  return [...byName].map(([name, price]) => ({ name, price })).sort((a, b) => a.price - b.price);
}
