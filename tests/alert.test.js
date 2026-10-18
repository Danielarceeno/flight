import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/alert.js';
import { entry } from './helpers.js';

const S = { dropPct: 5, minAbsDrop: 50, digest: true };

test('primeira leitura envia e-mail de confirmação', () => {
  assert.equal(decide([], entry(8000), S).kind, 'first');
});

test('novo mínimo histórico alerta', () => {
  const d = decide([entry(8000), entry(8200)], entry(7900), S);
  assert.equal(d.kind, 'new-low');
  assert.equal(d.alert, true);
});

test('queda grande sem ser mínimo alerta (drop)', () => {
  const d = decide([entry(7000), entry(9000)], entry(8400), S); // −6,7%, mas > mínimo 7000
  assert.equal(d.kind, 'drop');
});

test('queda pequena em % ou em R$ não alerta', () => {
  assert.equal(decide([entry(7000), entry(9000)], entry(8800), S).alert, false); // −2,2%
  assert.equal(decide([entry(300), entry(400)], entry(370), { ...S, digest: false }).kind, 'none'); // −7,5% mas só R$30
});

test('preço igual ou maior não alerta', () => {
  assert.equal(decide([entry(8000)], entry(8000), { ...S, digest: false }).alert, false);
  assert.equal(decide([entry(8000)], entry(8300), { ...S, digest: false }).alert, false);
});

test('resumo diário só no período da manhã', () => {
  const h = [entry(8000)];
  assert.equal(decide(h, entry(8100, { period: 'morning' }), S).kind, 'digest');
  assert.equal(decide(h, entry(8100, { period: 'night' }), S).alert, false);
  assert.equal(decide(h, entry(8100, { period: 'morning' }), { ...S, digest: false }).alert, false);
});

test('erro nunca gera alerta de preço; 3 erros seguidos geram aviso uma vez', () => {
  const err = { ts: 'x', period: 'night', error: 'boom' };
  assert.equal(decide([entry(8000)], err, S).alert, false);
  assert.equal(decide([entry(8000), err], err, S).alert, false);
  assert.equal(decide([entry(8000), err, err], err, S).kind, 'health');
  assert.equal(decide([entry(8000), err, err, err], err, S).alert, false);
});

test('leitura cujo e-mail falhou não vira base: alerta de novo', () => {
  const h = [entry(8000), entry(7000, { sendError: 'smtp' })];
  assert.equal(decide(h, entry(7000), S).kind, 'new-low');
});

test('sem preço e sem erro: não alerta', () => {
  assert.equal(decide([entry(8000)], { ts: 'x', period: 'night' }, S).kind, 'no-price');
});
