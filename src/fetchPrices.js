import { buildParams, serpSearch, cheapestOption, cheapestOverall, describe, flightOptions, sellersFrom } from './serpapi.js';

// 1 chamada (preço mínimo Qatar). Com deep=true faz mais 2 para descobrir
// os vendedores (Qatar Airways, Decolar, etc.) e seus preços.
export async function fetchPrices(route, apiKey, { deep = false, fetchImpl = fetch } = {}) {
  const first = await serpSearch(buildParams(route, apiKey), fetchImpl);
  const best = cheapestOption(first, route.airline);
  const overall = cheapestOverall(first);
  const insights = {
    level: first.price_insights?.price_level ?? null,
    typical: first.price_insights?.typical_price_range ?? null,
  };
  if (!best) return { qatar: null, sellers: [], insights, deepError: null, overall };

  const qatar = describe(best);
  let sellers = [];
  let deepError = null;

  if (deep && best.departure_token) {
    try {
      const second = await serpSearch(buildParams(route, apiKey, { departure_token: best.departure_token }), fetchImpl);
      const ret = flightOptions(second)
        .filter((o) => o.booking_token && Number.isFinite(o.price))
        .sort((a, b) => a.price - b.price)[0];
      if (ret) {
        const third = await serpSearch(buildParams(route, apiKey, { booking_token: ret.booking_token }), fetchImpl);
        sellers = sellersFrom(third);
      }
    } catch (e) {
      deepError = e.message; // a busca de vendedores é "melhor esforço"
    }
  }
  return { qatar, sellers, insights, deepError, overall };
}
