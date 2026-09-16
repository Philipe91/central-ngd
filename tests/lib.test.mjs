import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { migrateContent, migrateDb, createStore } from '../lib/store.mjs';
import { claimJobs, applyResult, expireStuck, syncStatus, textFor, applyMetrics } from '../lib/queue.mjs';
import { createShareToken, verifyShareToken, tools, prepare, probe } from '../lib/media.mjs';

const H = 3600 * 1000;
const content = (over = {}) => migrateContent({ id: 'c1', title: 'Cartões', caption: 'Acabamento fosco', channels: ['youtube', 'instagram', 'linkedin'], scheduledAt: new Date(Date.now() - H).toISOString(), file: 'c1.mp4', media: { state: 'ready', rendition: 'c1.mp4', thumb: 'c1.jpg', duration: 12 }, ...over });

test('migração completa registros antigos sem quebrar', () => {
  const old = { id: 'x', title: 'Antigo', channels: ['youtube'], scheduledAt: '', file: 'x.mp4', status: 'draft' };
  const m = migrateContent(structuredClone(old));
  assert.equal(m.posts.youtube.status, 'pending'); assert.equal(m.media.state, 'pending'); assert.equal(m.hashtags, '');
  const db = migrateDb({ settings: {}, contents: [old] });
  assert.equal(db.integrations.tiktok.privacy, 'SELF_ONLY'); assert.deepEqual(db.connections, {});
});

test('store grava em disco com cópia de segurança', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-store-'));
  const store = createStore(dir, { settings: {}, contents: [], activity: [] });
  store.change(d => { d.contents.push(content()); store.log(d, 'ok'); });
  store.change(d => { d.contents[0].title = 'Depois'; });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dashboard.json'), 'utf8')).contents[0].title, 'Depois');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dashboard.json.bak'), 'utf8')).contents[0].title, 'Cartões');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('claim devolve só trabalhos vencidos, prontos e automatizáveis, uma vez', () => {
  const now = Date.now();
  const db = { contents: [content(), content({ id: 'futuro', scheduledAt: new Date(now + H).toISOString() }), content({ id: 'semmidia', media: { state: 'preparing' } }), content({ id: 'rascunho', scheduledAt: '' })] };
  const jobs = claimJobs(db, now, { renditionPath: c => 'R:/' + c.media.rendition });
  assert.deepEqual(jobs.map(j => j.jobId).sort(), ['c1:instagram', 'c1:youtube']);
  assert.equal(jobs[0].filePath, 'R:/c1.mp4'); assert.equal(jobs[0].text, 'Acabamento fosco');
  assert.equal(db.contents[0].posts.youtube.status, 'queued'); assert.equal(db.contents[0].posts.youtube.attempts, 1);
  assert.equal(db.contents[0].posts.linkedin.status, 'pending');
  assert.equal(claimJobs(db, now).length, 0);
  assert.equal(db.automation.mode, 'idle');
});

test('resultado deriva o estado do conteúdo e trabalho preso expira', () => {
  const now = Date.now();
  const db = { contents: [content({ channels: ['youtube', 'facebook'] })] };
  claimJobs(db, now);
  applyResult(db, { contentId: 'c1', network: 'youtube', status: 'published', url: 'https://youtube.com/shorts/abc', externalId: 'abc' });
  assert.equal(db.contents[0].status, 'planned');
  assert.equal(expireStuck(db, now + 31 * 60 * 1000), 1);
  assert.equal(db.contents[0].posts.facebook.status, 'failed'); assert.equal(db.contents[0].status, 'attention');
  applyResult(db, { contentId: 'c1', network: 'facebook', status: 'pending' });
  assert.equal(db.contents[0].posts.facebook.claimedAt, '');
  applyResult(db, { contentId: 'c1', network: 'facebook', status: 'manual', url: 'https://facebook.com/reel/1' });
  assert.equal(db.contents[0].status, 'published');
  assert.throws(() => applyResult(db, { contentId: 'nope', network: 'youtube', status: 'published' }), /não encontrado/);
  assert.equal(applyMetrics(db, [{ contentId: 'c1', network: 'youtube', views: '120', likes: 4 }]), 1);
  assert.equal(db.contents[0].posts.youtube.metrics.views, 120); assert.equal(db.contents[0].posts.youtube.metrics.comments, null);
});

test('texto por rede usa legenda específica ou legenda + hashtags', () => {
  const c = content({ hashtags: '#ngd #grafica', texts: { tiktok: 'Só para o TikTok' } });
  assert.equal(textFor(c, 'youtube'), 'Acabamento fosco\n\n#ngd #grafica');
  assert.equal(textFor(c, 'tiktok'), 'Só para o TikTok');
  assert.equal(syncStatus(content({ scheduledAt: '' })).status, 'draft');
});

test('token de compartilhamento expira e rejeita adulteração', () => {
  const t = createShareToken('c1.mp4', 'segredo', 1000);
  assert.equal(verifyShareToken(t, 'segredo').file, 'c1.mp4');
  assert.equal(verifyShareToken(t, 'outro'), null);
  assert.equal(verifyShareToken(t.slice(0, -2) + 'zz', 'segredo'), null);
  assert.equal(verifyShareToken(createShareToken('c1.mp4', 'segredo', -1), 'segredo'), null);
  assert.equal(verifyShareToken(createShareToken('../x.mp4', 'segredo'), 'segredo'), null);
});

test('prepare gera 1080x1920 e capa a partir de vídeo horizontal', { skip: tools().missing.length ? 'ferramentas ausentes' : false }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-media-'));
  const src = path.join(dir, 'src.mp4');
  execFileSync(tools().ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', src], { windowsHide: true });
  const out = await prepare(src, dir, 'r1');
  assert.equal(out.width, 1080); assert.equal(out.height, 1920); assert.ok(out.duration >= 1.5);
  assert.ok(fs.existsSync(path.join(dir, 'r1.jpg')));
  const p = await probe(path.join(dir, 'r1.mp4')); assert.equal(p.hasAudio, true);
  fs.rmSync(dir, { recursive: true, force: true });
});
