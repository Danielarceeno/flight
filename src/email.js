import { googleFlightsUrl } from './config.js';
import { brl, esc } from './util.js';

const PERIOD = { morning: 'manhã', afternoon: 'tarde', night: 'noite', manual: 'manual' };

function duration(min) {
  if (!Number.isFinite(min)) return '—';
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

export function isDecolar(name) {
  return /decolar/i.test(name);
}

function headline(decision, entry, route) {
  const price = brl(entry.best.price, route.currency);
  switch (decision.kind) {
    case 'new-low':
      return { subject: `✈️ Menor preço até agora: ${price} — ${route.from}→${route.to}`, title: 'Novo menor preço!' };
    case 'drop':
      return { subject: `✈️ Preço caiu ${decision.pct.toFixed(1)}%: ${price} — ${route.from}→${route.to}`, title: 'O preço caiu' };
    case 'first':
      return { subject: `✅ Monitor ativo — ${route.from}→${route.to} a partir de ${price}`, title: 'Monitor ativado' };
    case 'digest':
      return { subject: `📋 Resumo diário ${route.from}→${route.to}: ${price}`, title: 'Resumo do dia' };
    default:
      return { subject: `✈️ ${route.from}→${route.to}: ${price}`, title: 'Atualização de preço' };
  }
}

export function buildEmail({ decision, entry, history = [], stats, route }) {
  if (decision.kind === 'health') {
    const last = history.filter((e) => e.error).slice(-2).concat(entry).map((e) => e.error);
    return {
      subject: '⚠️ Monitor de passagens com falha (3 coletas seguidas)',
      text: `As últimas 3 coletas falharam.\nÚltimos erros:\n- ${last.join('\n- ')}\n\nVerifique a chave SERPAPI_KEY e a cota do plano.`,
      html: `<p>As últimas 3 coletas falharam.</p><ul>${last.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><p>Verifique a chave <code>SERPAPI_KEY</code> e a cota do plano.</p>`,
    };
  }

  const { subject, title } = headline(decision, entry, route);
  const q = entry.qatar;
  const sellers = entry.sellers || [];
  const decolar = sellers.find((s) => isDecolar(s.name));
  const cur = route.currency;
  const when = PERIOD[entry.period] || entry.period;
  const lines = [];

  lines.push(`${title}`);
  lines.push(`Melhor preço agora: ${brl(entry.best.price, cur)} (${entry.best.source})`);
  if (decision.pct > 0 && decision.prev) lines.push(`Antes: ${brl(decision.prev, cur)} (queda de ${decision.pct.toFixed(1)}%)`);
  if (stats?.min != null) lines.push(`Menor preço registrado: ${brl(Math.min(stats.min, entry.best.price), cur)}`);
  if (q) {
    lines.push(`Qatar Airways: ${brl(q.price, cur)} · ${q.stops} parada(s)${q.layovers.length ? ' em ' + q.layovers.join(', ') : ''} · ida ${duration(q.totalMinutes)}`);
  }
  if (sellers.length) {
    lines.push('Quem vende:');
    for (const s of sellers.slice(0, 6)) lines.push(`  - ${s.name}: ${brl(s.price, cur)}`);
  }
  const overall = entry.overall;
  if (overall && overall.price < entry.best.price) {
    lines.push(`Preço mais barato na busca (qualquer companhia): ${brl(overall.price, cur)}${overall.airline ? ' (' + overall.airline + ')' : ''}`);
  }
  if (decolar) lines.push(`Decolar: ${brl(decolar.price, cur)}`);
  else if (entry.deep) lines.push('Decolar: não apareceu entre os vendedores desta busca.');
  lines.push(`Google Flights: ${googleFlightsUrl(route)}`);
  lines.push('Qatar Airways: https://www.qatarairways.com/pt-br/homepage.html');
  lines.push('Decolar: https://www.decolar.com/');
  lines.push(`Coleta ${when}, ${entry.ts}`);

  const sellerRows = sellers
    .slice(0, 6)
    .map(
      (s) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(s.name)}${isDecolar(s.name) ? ' ⭐' : ''}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right"><b>${brl(s.price, cur)}</b></td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1c2333">
<div style="max-width:560px;margin:0 auto;padding:16px">
  <div style="background:#1A73E8;color:#fff;border-radius:12px 12px 0 0;padding:18px 20px">
    <div style="font-size:13px;opacity:.9">${esc(route.from)} → ${esc(route.to)} · ${esc(route.outbound)} a ${esc(route.inbound)}</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">${esc(title)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:20px">
    <div style="font-size:34px;font-weight:bold;color:#FF7A1A">${brl(entry.best.price, cur)}</div>
    <div style="color:#5b6577;margin-bottom:12px">via ${esc(entry.best.source)}${decision.pct > 0 && decision.prev ? ` · antes ${brl(decision.prev, cur)} (−${decision.pct.toFixed(1)}%)` : ''}</div>
    ${stats?.min != null ? `<p style="margin:6px 0">Menor preço registrado: <b>${brl(Math.min(stats.min, entry.best.price), cur)}</b></p>` : ''}
    ${q ? `<p style="margin:6px 0">Qatar Airways: <b>${brl(q.price, cur)}</b> · ${q.stops} parada(s)${q.layovers.length ? ' em ' + esc(q.layovers.join(', ')) : ''} · ida ${duration(q.totalMinutes)}</p>` : ''}
    ${sellerRows ? `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">${sellerRows}</table>` : ''}
    ${entry.overall && entry.overall.price < entry.best.price ? `<p style="margin:6px 0;color:#5b6577">Preço mais barato na busca (qualquer companhia): <b>${brl(entry.overall.price, cur)}</b>${entry.overall.airline ? ` (${esc(entry.overall.airline)})` : ''}</p>` : ''}
    ${decolar ? `<p style="margin:6px 0">Decolar: <b>${brl(decolar.price, cur)}</b></p>` : entry.deep ? '<p style="margin:6px 0;color:#5b6577">Decolar não apareceu entre os vendedores desta busca.</p>' : ''}
    <p style="margin:18px 0 6px">
      <a href="${esc(googleFlightsUrl(route))}" style="background:#1A73E8;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;margin:0 6px 6px 0">Google Flights</a>
      <a href="https://www.qatarairways.com/pt-br/homepage.html" style="background:#5a0a3a;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;margin:0 6px 6px 0">Qatar Airways</a>
      <a href="https://www.decolar.com/" style="background:#ff7a1a;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;margin:0 6px 6px 0">Decolar</a>
    </p>
    <p style="font-size:12px;color:#8a93a5;margin-top:14px">Coleta da ${esc(when)} · ${esc(entry.ts)}. Preços podem mudar até a compra.</p>
  </div>
</div></body></html>`;

  return { subject, html, text: lines.join('\n') };
}

export async function sendEmail(message, env = process.env) {
  const need = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_TO'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variáveis de e-mail ausentes: ${missing.join(', ')}`);
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({
    from: env.EMAIL_FROM || env.SMTP_USER,
    to: env.EMAIL_TO,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
