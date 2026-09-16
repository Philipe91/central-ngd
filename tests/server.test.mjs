import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-test-'));
process.env.NGD_DATA_DIR = temporary;
process.env.NGD_TOOLS_DIR = path.join(temporary, 'sem-ferramentas');
const { app, shareApp } = await import('../server.mjs');
const server = app.listen(0, '127.0.0.1');
const share = shareApp.listen(0, '127.0.0.1');
await Promise.all([server, share].map(s => new Promise(resolve => s.once('listening', resolve))));
const base = `http://127.0.0.1:${server.address().port}`;
const shareBase = `http://127.0.0.1:${share.address().port}`;
after(async () => { await Promise.all([server, share].map(s => new Promise(resolve => s.close(resolve)))); fs.rmSync(temporary, { recursive: true, force: true }); });
const request = async (url, options) => { const response = await fetch(base + url, options); return { status: response.status, body: await response.json() }; };
const json = (method, body, headers = {}) => ({ method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const token = 'test-local-bridge-token';
const bridge = (method, body) => json(method, body, { 'X-NGD-Automation': token });

test('fluxo local persiste upload e planejamento, rejeita entradas malformadas e não inventa publicação', async () => {
  const initial = await request('/api/state');
  assert.equal(initial.body.contents.length, 0);
  assert.ok(initial.body.runtime.toolsMissing.includes('ffmpeg'));
  const invalid = new FormData(); invalid.append('video', new Blob(['not video']), 'bad.mp4'); invalid.append('title', 'Inválido'); invalid.append('channels', '[]');
  assert.equal((await request('/api/contents', { method: 'POST', body: invalid })).status, 400);
  assert.equal(fs.readdirSync(path.join(temporary, 'videos')).length, 0);
  const fixture = Buffer.alloc(32); fixture.writeUInt32BE(32); fixture.write('ftyp', 4); fixture.write('isom', 8);
  const upload = new FormData(); upload.append('video', new Blob([fixture], { type: 'video/mp4' }), 'fixture.mp4'); upload.append('title', 'Cartões NGD'); upload.append('channels', '["youtube"]');
  const saved = await request('/api/contents', { method: 'POST', body: upload });
  assert.equal(saved.status, 201); assert.equal(saved.body.status, 'draft'); assert.equal(saved.body.posts.youtube.status, 'pending');
  const plan = { title: 'Cartões revisados', caption: 'Acabamento fosco', hashtags: '#ngd', channels: ['youtube', 'instagram', 'linkedin'], scheduledAt: '2026-10-01T15:00:00.000Z', texts: { tiktok: 'Só TikTok', instagram: 'Legenda do Instagram', outra: 'x' } };
  const edited = await request('/api/contents/' + saved.body.id, json('PATCH', plan));
  assert.equal(edited.body.status, 'planned'); assert.deepEqual(edited.body.texts, { tiktok: 'Só TikTok', instagram: 'Legenda do Instagram' }); assert.equal(edited.body.posts.linkedin.status, 'pending');
  const disk = JSON.parse(fs.readFileSync(path.join(temporary, 'dashboard.json'), 'utf8'));
  assert.deepEqual(disk.contents[0].channels, plan.channels); assert.equal(disk.contents[0].media.state, 'error');
  assert.equal((await fetch(base + '/media/' + saved.body.file, { headers: { Range: 'bytes=0-7' } })).status, 206);
  assert.equal((await request('/api/contents/' + saved.body.id, json('PATCH', { ...plan, channels: ['unknown'] }))).status, 400);
  assert.equal((await request('/api/profiles/youtube', json('PUT', { url: 'https://youtube.com.evil.example/channel' }))).status, 400);
  assert.equal((await request('/api/profiles/youtube', json('PUT', { url: 'https://www.youtube.com/@ngd' }))).body.connected, false);
  assert.equal((await request('/api/profiles/facebook', json('PUT', { url: '', pageId: 'abc' }))).status, 400);
  assert.equal((await request('/api/profiles/facebook', json('PUT', { url: '', pageId: '123456' }))).body.integrations.facebook.pageId, '123456');
  assert.equal((await request('/api/settings', json('PUT', { ...initial.body.settings, n8nUrl: 'https://external.example' }))).status, 400);
  assert.equal((await request('/api/settings', json('PUT', initial.body.settings, { Origin: 'https://evil.example' }))).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => { http.get(base + '/api/state', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject); });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await request('/api/export')).body.contents[0].status, 'planned');

  // Ponte exige token; sem ele nada muda.
  for (const [url, options] of [['/api/automation/prepare', { method: 'POST' }], ['/api/automation/claim', json('POST', {})], ['/api/automation/result', json('POST', {})], ['/api/automation/published', {}], ['/api/automation/metrics', json('POST', {})]]) assert.equal((await request(url, options)).status, 401, url);
  fs.writeFileSync(path.join(temporary, 'automation-secrets.json'), JSON.stringify({ bridgeToken: token }));
  const prepare = await request('/api/automation/prepare', bridge('POST', {}));
  assert.equal(prepare.body.total, 3); assert.equal(prepare.body.published, 0);
  // Mídia não preparada: nada entra na fila, mesmo com data vencida.
  const claim = await request('/api/automation/claim', bridge('POST', { networks: ['youtube', 'instagram'] }));
  assert.equal(claim.status, 200); assert.equal(claim.body.total, 0);
  // Publicar agora bloqueia enquanto a mídia não está pronta.
  assert.equal((await request('/api/contents/' + saved.body.id + '/publish', json('POST', {}))).status, 400);
  // Resultado vindo da automação e publicação manual.
  const result = await request('/api/automation/result', bridge('POST', { contentId: saved.body.id, network: 'youtube', status: 'published', url: 'https://youtube.com/shorts/abc123', externalId: 'abc123' }));
  assert.equal(result.body.contentStatus, 'planned');
  assert.equal((await request('/api/automation/result', bridge('POST', { contentId: saved.body.id, network: 'instagram', status: 'failed', error: 'Token expirado' }))).body.contentStatus, 'attention');
  assert.equal((await request('/api/contents/' + saved.body.id + '/retry', json('POST', { network: 'instagram' }))).body.post.status, 'pending');
  const manual = await request('/api/contents/' + saved.body.id + '/manual', json('POST', { network: 'linkedin', url: 'https://www.linkedin.com/posts/ngd_1' }));
  assert.equal(manual.body.post.status, 'manual');
  assert.equal((await request('/api/contents/' + saved.body.id + '/manual', json('POST', { network: 'instagram', url: 'ftp://x' }))).status, 400);
  const published = await request('/api/automation/published', { headers: { 'X-NGD-Automation': token } });
  assert.equal(published.body.total, 1); assert.equal(published.body.items[0].externalId, 'abc123');
  assert.equal((await request('/api/automation/metrics', bridge('POST', { items: [{ contentId: saved.body.id, network: 'youtube', views: 42, likes: '3' }] }))).body.updated, 1);
  assert.equal((await request('/api/automation/connection', bridge('POST', { network: 'youtube', connected: true, account: 'Canal NGD' }))).status, 200);
  const state = await request('/api/state');
  assert.equal(state.body.contents[0].posts.youtube.metrics.views, 42);
  assert.equal(state.body.connections.youtube.account, 'Canal NGD');
  assert.equal(JSON.stringify(state.body).includes(token), false);
  const texts = await request('/api/contents/' + saved.body.id + '/texts');
  assert.equal(texts.body.youtube, 'Acabamento fosco\n\n#ngd'); assert.equal(texts.body.instagram, 'Legenda do Instagram');
  // Importação valida o link e responde 503 sem a ferramenta.
  assert.equal((await request('/api/import', json('POST', { url: 'http://instagram.com/reel/x' }))).status, 400);
  assert.equal((await request('/api/import', json('POST', { url: 'https://www.instagram.com/reel/x' }))).status, 503);
  // Teste de conexão sem n8n disponível registra o erro sem derrubar o painel.
  await request('/api/settings', json('PUT', { ...initial.body.settings, n8nUrl: 'http://127.0.0.1:1' }));
  const testConn = await request('/api/networks/youtube/test', { method: 'POST' });
  assert.equal(testConn.body.connected, false); assert.match(testConn.body.error, /n8n/);
  assert.equal((await request('/api/networks/linkedin/test', { method: 'POST' })).status, 400);
  // Servidor de compartilhamento só entrega com token válido.
  assert.equal((await fetch(shareBase + '/share/invalido')).status, 404);
  assert.equal((await fetch(shareBase + '/qualquer')).status, 404);
  // Remoção limpa os arquivos.
  assert.equal((await request('/api/contents/' + saved.body.id, { method: 'DELETE' })).status, 200);
  assert.equal(fs.readdirSync(path.join(temporary, 'videos')).length, 0);
  assert.equal((await request('/api/state')).body.contents.length, 0);
});
