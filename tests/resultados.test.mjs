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

import { resumoResultados, paginaResultados } from '../public/resultados.js';

const pub = (status, metrics, updatedAt = '2026-10-01T21:10:00.000Z') => ({ status, url: 'https://x/1', updatedAt, metrics });
const conteudos = [
  { id: 'a', title: 'Banner', kind: 'video', posts: { youtube: pub('published', { views: 100, likes: 10, comments: 2, shares: 1, at: '2026-10-02T10:00:00Z' }), facebook: pub('published', { views: 50, likes: 5, comments: 0, shares: 0, at: '2026-10-02T10:00:00Z' }) } },
  { id: 'b', title: 'Carrossel', kind: 'carousel', posts: { instagram: pub('published', null, '2026-10-03T02:30:00.000Z'), linkedin: pub('manual', null) } },
  { id: 'c', title: 'Rascunho', posts: { youtube: { status: 'pending' } } },
];

test('resumo soma métricas, agrupa por rede e monta a série por dia de Brasília', () => {
  const r = resumoResultados(conteudos);
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.total, { views: 150, likes: 15, comments: 2, shares: 1 });
  assert.equal(r.medidos, 2);
  assert.equal(r.taxa.toFixed(1), '12.0');
  assert.deepEqual(r.porRede.map(n => n.network), ['youtube', 'facebook', 'instagram', 'linkedin']);
  // 21:10Z de 01/10 ainda é 01/10 em Brasília.
  assert.deepEqual(r.serie, [{ dia: '2026-10-01', views: 150 }]);
  assert.equal(r.ultima, '2026-10-02T10:00:00Z');
});

const ui = { heading: t => `<h1>${t}</h1>`, networks: { youtube: { name: 'YouTube' }, facebook: { name: 'Facebook' }, instagram: { name: 'Instagram' }, linkedin: { name: 'LinkedIn' } }, networkMark: id => `<i>${id}</i>`, date: v => String(v) };

test('página usa cartões, gráficos e ícones do kit, sem style inline', () => {
  const html = paginaResultados(conteudos, ui);
  for (const trecho of ['k-card k-kpis', 'k-kpi', 'k-chart-slot', 'k-hbars', 'k-table', 'id="collect"', 'viewBox="0 0 20 20"']) assert.ok(html.includes(trecho), trecho);
  assert.ok(!/style="/.test(html));
  assert.ok(html.includes('Carrossel'));
});

test('sem publicação mostra o estado vazio; sem métricas não desenha gráfico', () => {
  assert.match(paginaResultados([], ui), /Seus resultados vão aparecer aqui/);
  const semMetrica = paginaResultados([conteudos[1]], ui);
  assert.ok(!semMetrica.includes('k-chart-slot'));
  assert.match(semMetrica, /aguardando a coleta/);
});

test('conteúdo da aba fica dentro do k-scope, que isola o kit dos estilos antigos do painel', () => {
  const html = paginaResultados(conteudos, ui);
  assert.ok(html.startsWith('<h1>Resultados</h1><div class="k-scope">'), html.slice(0, 80));
  assert.ok(html.trimEnd().endsWith('</div>'));
  assert.match(html, /class="k-card-title with-icon"/);
});
