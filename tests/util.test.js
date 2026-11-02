import test from 'node:test';
import assert from 'node:assert/strict';
import { brl, esc } from '../src/util.js';

test('brl formata em reais sem casas decimais', () => {
  assert.match(brl(7650), /7\.650/);
  assert.match(brl(7650), /R\$/);
});

test('brl aceita outra moeda', () => {
  assert.match(brl(100, 'USD'), /US\$|USD|\$/);
});

test('esc escapa os 5 caracteres HTML especiais', () => {
  assert.equal(esc('<b>a & "b" \'c\'</b>'), '&lt;b&gt;a &amp; &quot;b&quot; &#39;c&#39;&lt;/b&gt;');
});

test('esc converte valores não-string', () => {
  assert.equal(esc(7650), '7650');
  assert.equal(esc(null), 'null');
});
