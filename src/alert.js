import { validEntries } from './history.js';

function trailingErrors(history) {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].error; i--) n++;
  return n;
}

// Decide se envia e-mail e por quê. Puro e testável.
// kind: first | new-low | drop | digest | health | error | no-price | none
export function decide(history, entry, { dropPct = 5, minAbsDrop = 50, digest = true } = {}) {
  if (entry.error) {
    // avisa uma única vez quando a coleta falha 3 vezes seguidas
    return trailingErrors(history) + 1 === 3 ? { alert: true, kind: 'health' } : { alert: false, kind: 'error' };
  }
  if (!entry.best) return { alert: false, kind: 'no-price' };

  // leituras cujo e-mail falhou não servem de base: o alerta é reavaliado na próxima coleta
  const valid = validEntries(history).filter((e) => !e.sendError);
  if (!valid.length) return { alert: true, kind: 'first' };

  const cur = entry.best.price;
  const prev = valid[valid.length - 1].best.price;
  const min = Math.min(...valid.map((e) => e.best.price));
  const diff = prev - cur;
  const pct = (diff / prev) * 100;
  const info = { prev, min, diff, pct };

  if (cur < min) return { alert: true, kind: 'new-low', ...info };
  if (pct >= dropPct && diff >= minAbsDrop) return { alert: true, kind: 'drop', ...info };
  if (digest && entry.period === 'morning') return { alert: true, kind: 'digest', ...info };
  return { alert: false, kind: 'none', ...info };
}
