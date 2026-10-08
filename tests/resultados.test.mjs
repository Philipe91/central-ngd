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

import { resumoResultados, paginaResultados, recortar, variacao } from '../public/resultados.js';

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

// "agora" fixo: as publicações de exemplo (01 a 03/10) caem dentro dos últimos 30 dias.
const ui = { networks: { youtube: { name: 'YouTube' }, facebook: { name: 'Facebook' }, instagram: { name: 'Instagram' }, tiktok: { name: 'TikTok' }, linkedin: { name: 'LinkedIn' } }, date: v => String(v), agora: '2026-10-08T12:00:00Z' };

test('página usa cartões, gráficos e ícones do kit, sem style inline', () => {
  const html = paginaResultados(conteudos, ui);
  for (const trecho of ['r-kpi-hero', 'r-kpi', 'k-chart-slot', 'k-hbars-track', 'k-table', 'r-table', 'id="collect"', 'viewBox="0 0 20 20"', 'data-r-filtro="dias"', 'data-r-filtro="rede"']) assert.ok(html.includes(trecho), trecho);
  assert.ok(!/style="/.test(html));
  assert.ok(html.includes('Carrossel'));
  assert.ok(!html.includes('k-donut'), 'a rosca saiu; o painel por rede ocupa o lugar');
});

test('sem publicação mostra o estado vazio; sem métricas não desenha gráfico', () => {
  assert.match(paginaResultados([], ui), /Seus resultados vão aparecer aqui/);
  const semMetrica = paginaResultados([conteudos[1]], ui);
  assert.ok(!semMetrica.includes('k-chart-slot'));
  assert.match(semMetrica, /aguardando a coleta/);
});

test('conteúdo da aba fica dentro do k-scope, que isola o kit dos estilos antigos do painel', () => {
  const html = paginaResultados(conteudos, ui);
  assert.ok(html.startsWith('<div class="k-scope r-page"><header class="r-head"><div><h1>Resultados</h1>'), html.slice(0, 90));
  assert.ok(html.trimEnd().endsWith('</div>'));
  assert.match(html, /class="k-card-title with-icon"/);
});

test('totais e participação por rede saem só dos dados, sem variação inventada', () => {
  const html = paginaResultados(conteudos, ui);
  assert.match(html, /<strong class="k-num">150<\/strong>/);
  // YouTube 100 de 150 visualizações; Facebook 50; TikTok sem publicação aparece zerado.
  assert.match(html, /YouTube<\/span><b class="k-num">100<\/b><span class="r-rede-pct">66,7%/);
  assert.match(html, /TikTok<\/span><b class="k-num">0<\/b><span class="r-rede-pct">0%/);
  assert.match(html, /sem publicações/);
  // Janela anterior vazia: nenhum selo de variação.
  assert.ok(!html.includes('r-delta'));
  // Taxa de conclusão não existe nas redes; mostra engajamento real (18 interações / 150 = 12%).
  assert.ok(!/conclus[aã]o m[eé]dia/.test(html));
  assert.match(html, />12%<\/strong><small>taxa de engajamento/);
});

test('recorte por período e rede e variação só com base anterior', () => {
  const t = Date.parse('2026-10-02T00:00:00Z');
  const so = recortar(conteudos, { rede: 'youtube' });
  assert.deepEqual(Object.keys(so[0].posts), ['youtube']);
  const janela = resumoResultados(recortar(conteudos, { inicio: t, fim: t + 7 * 86400000 }));
  assert.deepEqual(janela.rows.map(r => r.network), ['instagram']);
  assert.equal(variacao(150, 0), null);
  assert.equal(variacao(150, 100), 50);
});

test('engajamento compara cada indicador entre redes sem ocultar valores menores', () => {
  const html = paginaResultados(conteudos, ui);
  // YouTube tem 10/15 curtidas, 2/2 comentários e 1/1 compartilhamentos.
  const youtube = html.split('data-rede="youtube"')[1].split('</section>')[0];
  assert.match(youtube, /Curtidas<\/span><b>10<\/b>/);
  assert.match(youtube, /Comentários<\/span><b>2<\/b>/);
  assert.equal((youtube.match(/data-w="100.0"/g) || []).length, 3);
  const facebook = html.split('data-rede="facebook"')[1].split('</section>')[0];
  assert.match(facebook, /data-w="50.0"/);
  assert.equal((facebook.match(/data-w="0.0"/g) || []).length, 2);
});

test('resultados explicam a série real, escapam títulos e preservam a ação de coleta única', () => {
  const unsafe = structuredClone(conteudos);
  unsafe[0].title = '<img src=x onerror=alert(1)>';
  const html = paginaResultados(unsafe, ui);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal((html.match(/id="collect"/g) || []).length, 1);
  assert.match(html, /Não representa as visualizações recebidas no dia/);
  assert.match(html, /01\/10\/2026/);
  assert.ok(!/style\s*=/.test(html));
});
