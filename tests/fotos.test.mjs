import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, PHOTO_CHANNELS, isPhoto, kindError } from '../lib/kinds.mjs';
import { migrateContent } from '../lib/store.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tools, photoSize, preparePhoto, probe } from '../lib/media.mjs';

test('tipos: fotos só na Meta e no LinkedIn, com 1 ou 2–10 fotos', () => {
  assert.deepEqual(KINDS, ['video', 'image', 'carousel']);
  assert.deepEqual(PHOTO_CHANNELS, ['instagram', 'facebook', 'linkedin']);
  assert.ok(isPhoto('carousel') && isPhoto('image') && !isPhoto('video') && !isPhoto(undefined));
  assert.equal(kindError('video', ['youtube', 'tiktok'], null), '');
  assert.equal(kindError('gif', [], null), 'Tipo de conteúdo inválido.');
  assert.match(kindError('image', ['instagram', 'youtube'], 1), /Instagram, no Facebook e no LinkedIn/);
  assert.equal(kindError('image', ['instagram'], 1), '');
  assert.equal(kindError('image', ['instagram'], 2), 'Envie 1 foto.');
  assert.equal(kindError('carousel', ['facebook'], 1), 'O carrossel precisa de 2 a 10 fotos.');
  assert.equal(kindError('carousel', ['facebook'], 11), 'O carrossel precisa de 2 a 10 fotos.');
  assert.equal(kindError('carousel', ['facebook', 'linkedin'], 10), '');
  assert.equal(kindError('carousel', ['instagram'], null), '');
});

test('migração marca conteúdo antigo como vídeo sem fotos', () => {
  const c = migrateContent({ id: 'x', channels: ['youtube'], scheduledAt: '2026-10-05T21:00:00.000Z', status: 'planned' });
  assert.equal(c.kind, 'video'); assert.deepEqual(c.images, []); assert.equal(c.status, 'planned');
  assert.equal(migrateContent({ id: 'y', kind: 'carousel', images: [{ file: 'a.jpg' }], channels: [] }).kind, 'carousel');
});

test('tamanho: carrossel sempre 1080×1350; imagem mantém de 4:5 a 1.91:1', () => {
  assert.deepEqual(photoSize(1080, 1080, 'carousel'), { width: 1080, height: 1350, fit: 'pad' });
  assert.deepEqual(photoSize(1080, 1080, 'image'), { width: 1080, height: 1080, fit: 'scale' });
  assert.deepEqual(photoSize(4000, 5000, 'image'), { width: 1080, height: 1350, fit: 'scale' });
  assert.deepEqual(photoSize(1910, 1000, 'image'), { width: 1080, height: 566, fit: 'scale' });
  assert.deepEqual(photoSize(1080, 1920, 'image'), { width: 1080, height: 1350, fit: 'pad' });
  assert.deepEqual(photoSize(3000, 1000, 'image'), { width: 1080, height: 1350, fit: 'pad' });
});

test('preparePhoto gera JPG a partir de PNG transparente e de paisagem', { skip: tools().missing.includes('ffmpeg') ? 'ferramentas ausentes' : false }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-foto-'));
  const { ffmpeg } = tools();
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red@0.0:s=800x600,format=rgba', '-frames:v', '1', path.join(dir, 'transp.png')]);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=1600x900', '-frames:v', '1', path.join(dir, 'paisagem.jpg')]);
  const a = await preparePhoto(path.join(dir, 'transp.png'), dir, 'a-1', 'carousel');
  const b = await preparePhoto(path.join(dir, 'paisagem.jpg'), dir, 'b-1', 'image');
  assert.deepEqual([a.rendition, a.width, a.height], ['a-1.jpg', 1080, 1350]);
  assert.deepEqual([b.width, b.height], [1080, 608]);
  assert.deepEqual(await probe(path.join(dir, 'a-1.jpg')).then(i => [i.width, i.height]), [1080, 1350]);
  // Transparência vira branco: o pixel do centro é claro, não preto.
  const px = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', path.join(dir, 'a-1.jpg'), '-vf', 'crop=2:2:540:674', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  assert.ok(px[0] > 200, `pixel ${px[0]}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { claimJobs } from '../lib/queue.mjs';

test('fila: foto leva kind e arquivos, pula YouTube e sai uma por rede por ciclo', () => {
  const foto = id => ({ id, title: id, kind: 'carousel', channels: ['instagram', 'facebook', 'youtube'], scheduledAt: '2026-10-01T00:00:00Z', media: { state: 'ready', rendition: '', thumb: id + '-1.jpg' }, images: [{ rendition: id + '-1.jpg' }, { rendition: id + '-2.jpg' }], posts: {} });
  const video = { id: 'v', title: 'v', kind: 'video', channels: ['instagram'], scheduledAt: '2026-10-01T00:00:00Z', media: { state: 'ready', rendition: 'v.mp4' }, posts: {} };
  const db = { contents: [foto('a'), foto('b'), video] };
  const jobs = claimJobs(db, Date.parse('2026-10-02T00:00:00Z'));
  assert.deepEqual(jobs.map(j => `${j.contentId}:${j.network}`), ['a:instagram', 'a:facebook', 'v:instagram']);
  assert.equal(jobs[0].kind, 'carousel'); assert.deepEqual(jobs[0].images, ['a-1.jpg', 'a-2.jpg']);
  assert.equal(jobs[2].kind, 'video');
  assert.equal(db.contents[1].posts.instagram?.status ?? 'pending', 'pending'); // "b" fica para o próximo ciclo
  assert.equal(db.contents[0].posts.youtube?.status ?? 'pending', 'pending'); // YouTube nunca entra para foto
  assert.deepEqual(claimJobs(db, Date.parse('2026-10-02T00:05:00Z')).map(j => `${j.contentId}:${j.network}`), ['b:instagram', 'b:facebook']);
});
