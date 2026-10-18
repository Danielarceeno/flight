import { readFileSync } from 'node:fs';

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
export const search = load('search');
export const departure = load('departure');
export const booking = load('booking');

// fetch falso que roteia pelas chaves da URL e registra as chamadas
export function fakeFetch({ failWith } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (failWith) return { ok: false, status: failWith, json: async () => ({}) };
    const u = new URL(url);
    let body = search;
    if (u.searchParams.get('departure_token')) body = departure;
    if (u.searchParams.get('booking_token')) body = booking;
    return { ok: true, status: 200, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

export function entry(price, extra = {}) {
  return { ts: '2026-10-18T11:00:00.000Z', period: 'afternoon', best: { source: 'Qatar Airways (Google Flights)', price }, ...extra };
}
