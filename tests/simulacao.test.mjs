import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMock } from '../automation/mock-platforms.mjs';
import { ensureTunnel, tunnelStatus, stopTunnel } from '../lib/media.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mock = createMock().listen(0, '127.0.0.1');
const share = http.createServer((req, res) => { if (req.url === '/share/ok') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end('video'); } else { res.writeHead(404); res.end(); } }).listen(0, '127.0.0.1');
await Promise.all([mock, share].map(s => new Promise(resolve => s.once('listening', resolve))));
const base = `http://127.0.0.1:${mock.address().port}`;
const shareBase = `http://127.0.0.1:${share.address().port}`;
after(() => { mock.close(); share.close(); });

const call = async (url, { method = 'GET', body, headers = {}, raw } = {}) => {
  const h = { Authorization: 'Bearer teste', ...headers };
  let payload;
  if (raw) { payload = raw; h['Content-Type'] = 'video/mp4'; } else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  const r = await fetch(base + url, { method, headers: h, body: payload });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, body: json };
};
const modo = (rede, m) => call('/__mock/modo', { method: 'POST', body: { rede, modo: m } });
const statusIG = id => call(`/graph/v21.0/${id}?fields=status_code,status`);
const statusTT = id => call('/tiktok/v2/post/publish/status/fetch/', { method: 'POST', body: { publish_id: id } });

test('mock publica nas quatro redes com o mesmo protocolo dos fluxos reais', async () => {
  await call('/__mock/limpar', { method: 'POST' });
  // YouTube
  const yt = await call('/youtube/upload/videos?part=snippet&title=Teste', { method: 'POST', raw: Buffer.alloc(1000) });
  assert.equal(yt.status, 200); assert.match(yt.body.id, /^yt/);
  assert.ok(Number((await call(`/youtube/v3/videos?part=statistics&id=${yt.body.id}`)).body.items[0].statistics.viewCount) > 0);
  assert.equal((await call('/youtube/v3/channels?part=snippet&mine=true')).body.items[0].snippet.title, 'Canal NGD (simulado)');
  // Facebook Reels
  const start = await call('/graph/v21.0/123/video_reels', { method: 'POST', body: { upload_phase: 'start' } });
  assert.ok(start.body.video_id); assert.ok(start.body.upload_url.startsWith(base));
  const cedo = await call(`/graph/v21.0/123/video_reels?upload_phase=finish&video_id=${start.body.video_id}`, { method: 'POST' });
  assert.equal(cedo.status, 400); assert.match(cedo.body.error.message, /not finished/);
  assert.equal((await call(`/rupload/video-reels/${start.body.video_id}`, { method: 'POST', raw: Buffer.alloc(2000), headers: { offset: '0', file_size: '2000' } })).body.success, true);
  assert.equal((await call(`/graph/v21.0/123/video_reels?upload_phase=finish&video_id=${start.body.video_id}&video_state=PUBLISHED`, { method: 'POST' })).body.success, true);
  assert.ok(Number((await call(`/graph/v21.0/${start.body.video_id}?fields=views,likes.summary(true)`)).body.views) > 0);
  // Instagram Reels: o mock baixa o video_url de verdade
  const cont = await call('/graph/v21.0/178/media', { method: 'POST', body: { media_type: 'REELS', video_url: shareBase + '/share/ok', caption: 'x' } });
  assert.ok(cont.body.id);
  assert.equal((await statusIG(cont.body.id)).body.status_code, 'IN_PROGRESS');
  assert.equal((await statusIG(cont.body.id)).body.status_code, 'FINISHED');
  const pub = await call(`/graph/v21.0/178/media_publish?creation_id=${cont.body.id}`, { method: 'POST' });
  assert.match((await call(`/graph/v21.0/${pub.body.id}?fields=permalink`)).body.permalink, /instagram\.com\/reel\//);
  const ruim = await call('/graph/v21.0/178/media', { method: 'POST', body: { video_url: shareBase + '/share/nao-existe' } });
  await statusIG(ruim.body.id);
  const estadoRuim = (await statusIG(ruim.body.id)).body;
  assert.equal(estadoRuim.status_code, 'ERROR'); assert.match(estadoRuim.status, /HTTP 404/);
  assert.ok((await call('/graph/v21.0/me?fields=id,name')).body.name.length > 0);
  assert.equal((await call('/graph/v21.0/178?fields=username')).body.username, 'ngdgrafica');
  // TikTok
  const init = await call('/tiktok/v2/post/publish/video/init/', { method: 'POST', body: { source_info: { video_size: 3000 } } });
  assert.equal(init.body.error.code, 'ok'); assert.ok(init.body.data.upload_url.startsWith(base));
  assert.equal((await call(init.body.data.upload_url.slice(base.length), { method: 'PUT', raw: Buffer.alloc(3000) })).status, 201);
  assert.equal((await statusTT(init.body.data.publish_id)).body.data.status, 'PROCESSING_UPLOAD');
  const fim = await statusTT(init.body.data.publish_id);
  assert.equal(fim.body.data.status, 'PUBLISH_COMPLETE'); assert.equal(fim.body.data.publicaly_available_post_id.length, 1);
  const q = await call('/tiktok/v2/video/query/?fields=id,view_count', { method: 'POST', body: { filters: { video_ids: fim.body.data.publicaly_available_post_id } } });
  assert.ok(q.body.data.videos[0].view_count > 0);
  assert.equal((await call('/tiktok/v2/user/info/?fields=display_name')).body.data.user.username, 'ngdgrafica');
  const estado = (await call('/__mock/estado')).body;
  assert.deepEqual(estado.publicacoes.map(p => p.rede).sort(), ['facebook', 'instagram', 'tiktok', 'youtube']);
});

test('mock devolve erros de autenticação e recusa no formato de cada plataforma', async () => {
  const semToken = await fetch(base + '/tiktok/v2/user/info/');
  assert.equal(semToken.status, 401); assert.equal((await semToken.json()).error.code, 'access_token_invalid');
  assert.equal((await modo('todas', 'auth')).body.ok, true);
  const yt = await call('/youtube/upload/videos', { method: 'POST', raw: Buffer.alloc(10) });
  assert.equal(yt.status, 401); assert.match(yt.body.error.message, /invalid authentication/);
  const fb = await call('/graph/v21.0/1/video_reels', { method: 'POST', body: { upload_phase: 'start' } });
  assert.equal(fb.body.error.code, 190); assert.match(fb.body.error.message, /access token/);
  assert.equal((await call('/tiktok/v2/post/publish/video/init/', { method: 'POST', body: {} })).status, 401);
  await modo('todas', 'recusado');
  assert.match((await call('/youtube/upload/videos', { method: 'POST', raw: Buffer.alloc(10) })).body.error.message, /invalid video description/);
  assert.equal((await call('/graph/v21.0/1/video_reels', { method: 'POST', body: { upload_phase: 'start' } })).body.error.code, 352);
  const init = await call('/tiktok/v2/post/publish/video/init/', { method: 'POST', body: {} });
  await call(init.body.data.upload_url.slice(base.length), { method: 'PUT', raw: Buffer.alloc(5) });
  await statusTT(init.body.data.publish_id);
  const st = await statusTT(init.body.data.publish_id);
  assert.equal(st.body.data.status, 'FAILED'); assert.equal(st.body.data.fail_reason, 'video_format_check_failed');
  const cont = await call('/graph/v21.0/178/media', { method: 'POST', body: { video_url: shareBase + '/share/ok' } });
  await statusIG(cont.body.id);
  assert.equal((await statusIG(cont.body.id)).body.status_code, 'ERROR');
  assert.equal((await modo('todas', 'errado')).status, 400);
  assert.equal((await modo('x', 'ok')).status, 400);
  await modo('todas', 'ok');
});

test('create-workflows --simulate aponta tudo para o mock e não toca nos fluxos reais nem nas credenciais', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-sim-'));
  const script = path.join(root, 'automation', 'create-workflows.mjs');
  const reais = fs.readFileSync(path.join(root, 'automation', 'workflows.json'), 'utf8');
  execFileSync(process.execPath, [script, '--simulate'], { env: { ...process.env, NGD_DATA_DIR: dir, NGD_MOCK_URL: 'http://127.0.0.1:1' }, stdio: 'pipe' });
  assert.equal(fs.readFileSync(path.join(root, 'automation', 'workflows.json'), 'utf8'), reais);
  assert.ok(!fs.existsSync(path.join(dir, 'n8n-import-credential.json')));
  const sim = JSON.parse(fs.readFileSync(path.join(dir, 'workflows.simulado.json'), 'utf8'));
  assert.deepEqual(sim.map(w => w.id), ['ngdLocalHealth01', 'ngdPublishQueue01', 'ngdTestConnection01', 'ngdCollectMetrics01']);
  const nos = sim.flatMap(w => w.nodes);
  assert.ok(!nos.some(n => n.type === 'n8n-nodes-base.youTube'));
  const urls = nos.map(n => n.parameters?.url).filter(Boolean);
  assert.ok(urls.length > 15);
  for (const u of urls) { if (u.startsWith('={{ $(')) continue; assert.ok(u.includes('http://127.0.0.1:1/') || u.includes('http://127.0.0.1:3210/'), u); } // URLs vindas da resposta anterior (upload_url) são dinâmicas
  assert.ok(nos.some(n => n.name === 'Modo simulado'));
  assert.ok(!JSON.stringify(sim).includes('youTubeOAuth2Api'));
  // Os fluxos reais versionados nunca podem apontar para o mock.
  assert.ok(!/127\.0\.0\.1:3212|Modo simulado/.test(reais));
  assert.ok(reais.includes('graph.facebook.com') && reais.includes('open.tiktokapis.com') && reais.includes('googleapis.com'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('túnel do Instagram usa o endereço fixo em modo simulado, sem cloudflared', async () => {
  process.env.NGD_SHARE_PUBLIC_URL = 'http://127.0.0.1:3211/';
  try {
    assert.equal(await ensureTunnel(3211), 'http://127.0.0.1:3211');
    assert.equal(tunnelStatus().simulated, true);
  } finally { delete process.env.NGD_SHARE_PUBLIC_URL; stopTunnel(); }
  assert.equal(tunnelStatus(), null);
});
