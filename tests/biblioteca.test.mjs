import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarStatus, filtrarOrdenar, cardBiblioteca, listaBiblioteca, paginaBiblioteca, duracao } from '../public/biblioteca.js';

// Mesmos mapas do app.js (a biblioteca recebe tudo por parâmetro).
const ui = {
  STATUS: { draft: ['Rascunho', ''], planned: ['Planejado', 'blue'], published: ['Publicado', 'green'], attention: ['Atenção', 'red'] },
  POST: { pending: ['Pendente', 'amber'], queued: ['Publicando…', 'blue'], published: ['Publicado', 'green'], failed: ['Falhou', 'red'], manual: ['Manual', 'green'] },
  MEDIA: { importing: ['Importando…', 'blue'], preparing: ['Preparando…', 'blue'], pending: ['Aguardando preparo', 'amber'], ready: ['Pronto para publicar', 'green'], error: ['Erro na mídia', 'red'] },
  networks: { youtube: { name: 'YouTube' }, facebook: { name: 'Facebook' }, instagram: { name: 'Instagram' }, tiktok: { name: 'TikTok' }, linkedin: { name: 'LinkedIn' } },
  AUTOMATED: ['youtube', 'facebook', 'instagram', 'tiktok'],
  date: v => 'data:' + v, heading: (t, d) => `<h1>${t}</h1><p>${d}</p>`, filtro: 'all', busca: '',
};
const media = (extra = {}) => ({ state: 'ready', thumb: 'a.jpg', duration: 67, ...extra });
const publicado = { id: 'p', title: 'Publicado', status: 'published', channels: ['youtube'], posts: { youtube: { status: 'published', url: 'https://youtu.be/x' } }, media: media(), createdAt: '2026-10-01T10:00:00Z', scheduledAt: '2026-10-02T21:00:00Z', bytes: 1048576 };
const planejado = { id: 'q', title: 'Banner', status: 'planned', channels: ['youtube', 'facebook'], posts: { youtube: { status: 'pending' }, facebook: { status: 'published', url: 'https://fb.com/r/1' } }, media: media({ duration: 95 }), createdAt: '2026-10-03T10:00:00Z', scheduledAt: '2026-10-09T21:00:00Z' };
const comErro = { id: 'r', title: 'Arquivo ruim', status: 'draft', channels: ['instagram', 'linkedin'], posts: { instagram: { status: 'failed', error: 'Meta recusou o vídeo' }, linkedin: { status: 'pending' } }, media: { state: 'error', error: 'ffmpeg falhou' }, file: 'r.mp4', createdAt: '2026-09-20T10:00:00Z' };
const todos = [publicado, planejado, comErro];

test('contagem por status e filtro/ordem respeitam os dados', () => {
  assert.deepEqual(contarStatus(todos), { all: 3, draft: 1, planned: 1, published: 1, attention: 0 });
  assert.deepEqual(filtrarOrdenar(todos).map(c => c.id), ['q', 'p', 'r']);
  assert.deepEqual(filtrarOrdenar(todos, { ordem: 'antigos' }).map(c => c.id), ['r', 'p', 'q']);
  assert.deepEqual(filtrarOrdenar(todos, { ordem: 'agenda' }).map(c => c.id), ['p', 'q', 'r']);
  assert.deepEqual(filtrarOrdenar(todos, { filtro: 'planned' }).map(c => c.id), ['q']);
  assert.deepEqual(filtrarOrdenar(todos, { busca: 'bann' }).map(c => c.id), ['q']);
  assert.equal(duracao(67), '1:07');
});

test('publicado não ganha botão de publicar; planejado com rede pendente ganha', () => {
  assert.ok(!cardBiblioteca(publicado, ui).includes('data-publish'));
  const html = cardBiblioteca(planejado, ui);
  assert.equal((html.match(/data-publish="q"/g) || []).length, 1);
  // Status geral e de cada rede continuam separados.
  assert.match(html, /Planejado/);
  assert.match(html, /YouTube<\/span><em class="amber">Pendente/);
  assert.match(html, /Facebook<\/span><em class="green">Publicado/);
});

test('mídia com erro oferece preparar de novo e mostra o erro; falha da rede fica visível; manual segue disponível', () => {
  const html = cardBiblioteca(comErro, ui);
  assert.ok(!html.includes('data-publish'), 'mídia com erro não publica');
  assert.match(html, /data-prepare="r"/);
  assert.match(html, /data-manual="r" data-network="linkedin"/);
  assert.match(html, /ffmpeg falhou/);
  assert.match(html, /<b>Instagram:<\/b> Meta recusou o vídeo/);
  assert.match(html, /data-edit="r"/);
  assert.match(html, /data-delete="r"/);
});

test('avisos de duração e direitos autorais nunca somem', () => {
  const html = cardBiblioteca(planejado, ui);
  assert.match(html, /acima de 90 s: Facebook Reels pode recusar/);
  assert.match(html, /acima de 60 s: no YouTube, música com direitos autorais bloqueia o Short/);
  assert.ok(!cardBiblioteca({ ...planejado, channels: ['facebook'] }, ui).includes('acima de 60 s'));
});

test('página tem abas com contagem, busca, ordem e grade/lista; sem style inline e com título escapado', () => {
  const html = paginaBiblioteca([{ ...publicado, title: '<img src=x onerror=1>' }, planejado, comErro], ui);
  for (const t of ['data-filter="all"', 'Todos<span>3</span>', 'id="search"', 'data-lib-ordem', 'data-lib-vista="lista"']) assert.ok(html.includes(t), t);
  assert.ok(!/style\s*=/.test(html));
  assert.ok(!html.includes('<img src=x'));
});

test('estados vazios: biblioteca vazia e busca sem resultado', () => {
  assert.match(listaBiblioteca([], ui), /Sua biblioteca começa com um vídeo/);
  const nada = listaBiblioteca(todos, { ...ui, busca: 'zzz' });
  assert.match(nada, /Nenhum conteúdo encontrado/);
  assert.match(nada, /data-lib-limpar/);
});
