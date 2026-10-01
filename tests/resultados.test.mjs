import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icon, ICON_NAMES } from '../public/ui/icons.js';

test('ícones de gráfico existem na grade 20×20 do kit, em currentColor', () => {
  for (const nome of ['heart', 'share', 'trend', 'trophy', 'pie']) {
    assert.ok(ICON_NAMES.includes(nome), nome);
    const svg = icon(nome);
    assert.match(svg, /viewBox="0 0 20 20"/);
    assert.match(svg, /currentColor/);
    assert.match(svg, /stroke-width="1.4"/);
  }
});
