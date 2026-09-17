import express from 'express';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, NETWORKS } from './lib/store.mjs';
import { AUTOMATED, claimJobs, applyResult, applyMetrics, jobsSnapshot, expireStuck, syncStatus, textFor } from './lib/queue.mjs';
import * as media from './lib/media.mjs';
import { createTikTokAuth } from './lib/tiktok-auth.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NGD_DATA_DIR || path.join(root, 'data');
const uploadDir = path.join(dataDir, 'videos');
const renditionDir = path.join(dataDir, 'renditions');
const cookiesFile = path.join(dataDir, 'cookies', 'instagram.txt');
for (const d of [uploadDir, renditionDir, path.join(dataDir, 'cookies')]) fs.mkdirSync(d, { recursive: true });
const SHARE_PORT = Number(process.env.NGD_SHARE_PORT || 3211);
const initial = { settings: { name: 'NGD Núcleo Gráfico Digital', instagram: 'ngdgrafica', city: '', whatsapp: '', n8nUrl: 'http://localhost:5678' }, profiles: { instagram: 'https://www.instagram.com/ngdgrafica/' }, contents: [], activity: [] };
const store = createStore(dataDir, initial);
const networks = NETWORKS;

function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function bad(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function secrets() { const file = path.join(dataDir, 'automation-secrets.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}; }
function bridgeSecret() { return secrets().bridgeToken || null; }
function shareSecret() { return secrets().shareSecret || secrets().bridgeToken || null; }
// TikTok: o painel guarda e renova o token (data/automation-secrets.json) e o entrega ao n8n em cada trabalho dessa rede.
const tiktokAuth = createTikTokAuth({ file: path.join(dataDir, 'automation-secrets.json'), log: message => { try { store.change(d => store.log(d, message)); } catch {} } });
function n8nBase() { return store.db.settings.n8nUrl.replace('localhost', '127.0.0.1'); }
async function n8nWebhook(name, body, timeout = 15000) {
  const token = bridgeSecret();
  if (!token) throw Object.assign(new Error('Token da automação ainda não foi gerado. Inicie a Central NGD.'), { status: 503 });
  const response = await fetch(n8nBase() + '/webhook/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NGD-Automation': token }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeout), redirect: 'error' });
  let data = null; try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data };
}
function renditionPath(c) { return path.join(renditionDir, c.media.rendition); }
function findContent(id) { const c = store.db.contents.find(x => x.id === id); if (!c) bad('Vídeo não encontrado.', 404); return c; }

// Preparação da mídia (renderização 9:16 + capa) em segundo plano, uma por vez por conteúdo.
const preparing = new Set();
function prepareContent(id) {
  if (preparing.has(id)) return;
  const c = store.db.contents.find(x => x.id === id);
  if (!c || !c.file) return;
  if (media.tools().missing.length) { store.change(d => { const x = d.contents.find(y => y.id === id); x.media.state = 'error'; x.media.error = 'Ferramentas de vídeo ausentes. Execute automation/install-tools.ps1.'; }); return; }
  preparing.add(id);
  store.change(d => { const x = d.contents.find(y => y.id === id); x.media.state = 'preparing'; x.media.error = ''; });
  media.prepare(path.join(uploadDir, c.file), renditionDir, id).then(out => {
    store.change(d => { const x = d.contents.find(y => y.id === id); if (!x) return; x.media = { ...x.media, state: 'ready', error: '', ...out }; store.log(d, `Vídeo preparado: ${x.title}`); });
  }).catch(error => {
    store.change(d => { const x = d.contents.find(y => y.id === id); if (!x) return; x.media.state = 'error'; x.media.error = String(error.stderr || error.message).split('\n').filter(Boolean).slice(-1)[0] || 'Falha ao preparar o vídeo.'; store.log(d, `Falha ao preparar: ${x.title}`); });
  }).finally(() => preparing.delete(id));
}
function prepareMissing() { for (const c of store.db.contents) if (c.file && ['pending', 'preparing'].includes(c.media?.state)) prepareContent(c.id); }

function contentFields(body, existing) {
  const title = clean(body.title, 160); if (!title) bad('Informe um título para o vídeo.');
  let channels = body.channels;
  if (typeof channels === 'string') { try { channels = JSON.parse(channels); } catch { bad('Selecione redes válidas.'); } }
  if (!Array.isArray(channels) || channels.some(n => !networks.includes(n))) bad('Selecione redes válidas.');
  const scheduledAt = clean(body.scheduledAt, 50);
  if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) bad('Informe uma data válida.');
  if (scheduledAt && !channels.length) bad('Selecione pelo menos uma rede para planejar uma publicação.');
  let texts = body.texts ?? existing?.texts ?? {};
  if (typeof texts === 'string') { try { texts = JSON.parse(texts); } catch { texts = {}; } }
  texts = Object.fromEntries(Object.entries(texts || {}).filter(([n]) => networks.includes(n)).map(([n, v]) => [n, clean(v, 5000)]).filter(([, v]) => v));
  const posts = { ...(existing?.posts || {}) };
  for (const n of channels) posts[n] ??= store.emptyPost();
  return { title, caption: clean(body.caption, 5000), hashtags: clean(body.hashtags, 500), channels: [...new Set(channels)], scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : '', texts, posts };
}

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return res.status(403).json({ error: 'Acesso apenas neste computador.' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return res.status(403).json({ error: 'Origem não autorizada.' });
  if (req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate') return res.status(403).json({ error: 'Origem não autorizada.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: '256kb' }));

function authenticateBridge(req, res, next) {
  const expected = bridgeSecret(); const received = req.headers['x-ngd-automation'];
  if (req.headers.origin || !expected || typeof received !== 'string' || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return res.status(401).json({ error: 'Comunicação local não autorizada.' });
  next();
}

// ---------- Ponte com o n8n ----------
app.post('/api/automation/prepare', authenticateBridge, (req, res) => {
  const checkedAt = new Date().toISOString();
  const jobs = store.change(d => { expireStuck(d); const snapshot = jobsSnapshot(d).filter(j => j.scheduledAt); d.automation = { ...(d.automation || {}), checkedAt, mode: 'preparation', jobs: snapshot }; return snapshot; });
  res.json({ ok: true, mode: 'preparation', checkedAt, total: jobs.length, blocked: jobs.filter(j => j.status === 'pending').length, published: jobs.filter(j => j.status === 'published').length });
});
app.post('/api/automation/claim', authenticateBridge, async (req, res, next) => {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.body?.limit) || 10));
    const requested = Array.isArray(req.body?.networks) ? req.body.networks.filter(n => AUTOMATED.includes(n)) : AUTOMATED;
    const jobs = store.change(d => claimJobs(d, Date.now(), { networks: requested, limit, renditionPath }));
    const integrations = store.db.integrations;
    const ready = [];
    for (const job of jobs) {
      job.integrations = { pageId: integrations.facebook?.pageId || '', igUserId: integrations.instagram?.igUserId || '', privacy: integrations.tiktok?.privacy || 'SELF_ONLY' };
      job.title = job.title.slice(0, job.network === 'youtube' ? 100 : 150);
      if (job.network === 'facebook' && !job.integrations.pageId) { store.change(d => applyResult(d, { contentId: job.contentId, network: job.network, status: 'failed', error: 'Informe o ID da Página do Facebook em Redes sociais.' })); continue; }
      if (job.network === 'instagram') {
        if (!job.integrations.igUserId) { store.change(d => applyResult(d, { contentId: job.contentId, network: job.network, status: 'failed', error: 'Informe o ID da conta do Instagram em Redes sociais.' })); continue; }
        try {
          const base = await media.ensureTunnel(SHARE_PORT, path.join(dataDir, 'tunnel.log'));
          job.publicUrl = base + '/share/' + media.createShareToken(job.fileName, shareSecret());
        } catch (error) { store.change(d => applyResult(d, { contentId: job.contentId, network: job.network, status: 'failed', error: 'Link temporário indisponível: ' + error.message })); continue; }
      }
      if (job.network === 'tiktok' && job.bytes > 64 * 1024 * 1024) { store.change(d => applyResult(d, { contentId: job.contentId, network: job.network, status: 'failed', error: 'O TikTok recebe até 64 MB por envio nesta versão. Reduza o vídeo.' })); continue; }
      if (job.network === 'tiktok') {
        try { job.tiktokToken = await tiktokAuth.getFreshToken(); }
        catch (error) { store.change(d => applyResult(d, { contentId: job.contentId, network: job.network, status: 'failed', error: error.message })); continue; }
      }
      ready.push(job);
    }
    res.json({ ok: true, checkedAt: new Date().toISOString(), jobs: ready, total: ready.length });
  } catch (error) { next(error); }
});
app.post('/api/automation/result', authenticateBridge, (req, res) => {
  const { contentId, network, status } = req.body || {};
  if (!networks.includes(network)) bad('Rede inválida.');
  const result = store.change(d => { const r = applyResult(d, { contentId, network, status, url: clean(req.body.url, 500), externalId: clean(String(req.body.externalId ?? ''), 200), error: clean(String(req.body.error ?? ''), 1000) }); store.log(d, status === 'published' ? `Publicado no ${network}: ${r.content.title}` : status === 'failed' ? `Falha no ${network}: ${r.content.title}` : `Estado ${status} no ${network}: ${r.content.title}`); return r; });
  res.json({ ok: true, status: result.post.status, contentStatus: result.content.status });
});
app.post('/api/automation/connection', authenticateBridge, (req, res) => {
  const { network } = req.body || {};
  if (!networks.includes(network)) bad('Rede inválida.');
  store.change(d => { d.connections[network] = { connected: !!req.body.connected, account: clean(String(req.body.account ?? ''), 120), error: clean(String(req.body.error ?? ''), 500), checkedAt: new Date().toISOString() }; });
  res.json({ ok: true });
});
app.get('/api/automation/published', authenticateBridge, async (req, res) => {
  let items = store.db.contents.flatMap(c => Object.entries(c.posts || {}).filter(([n, p]) => p.status === 'published' && p.externalId && AUTOMATED.includes(n)).map(([n, p]) => ({ contentId: c.id, network: n, externalId: p.externalId, url: p.url, title: c.title })));
  if (items.some(i => i.network === 'tiktok')) {
    let tiktokToken = ''; try { tiktokToken = await tiktokAuth.getFreshToken(); } catch {}
    if (!tiktokToken) store.change(d => store.log(d, 'TikTok: coleta de métricas pulada, conta não conectada.'));
    items = tiktokToken ? items.map(i => (i.network === 'tiktok' ? { ...i, tiktokToken } : i)) : items.filter(i => i.network !== 'tiktok');
  }
  res.json({ ok: true, items, integrations: store.db.integrations, total: items.length });
});
app.post('/api/automation/metrics', authenticateBridge, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  const updated = store.change(d => applyMetrics(d, items));
  res.json({ ok: true, updated });
});

// ---------- Painel ----------
const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()) }), limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 12, fieldSize: 20000 }, fileFilter: (req, file, cb) => {
  if (!['.mp4', '.mov', '.webm'].includes(path.extname(file.originalname).toLowerCase())) return cb(Object.assign(new Error('Envie um vídeo MP4, MOV ou WebM.'), { status: 400 }));
  cb(null, true);
} });
app.get('/api/state', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ...store.db, runtime: { toolsMissing: media.tools().missing, tunnel: media.tunnelStatus(), cookies: fs.existsSync(cookiesFile), sharePort: SHARE_PORT, tiktok: tiktokAuth.status() } }); });
// TikTok: chave e segredo entram só por aqui (127.0.0.1); a autorização volta pelo túnel no servidor de compartilhamento.
app.get('/api/tiktok/status', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(tiktokAuth.status()); });
app.post('/api/tiktok/config', (req, res) => { res.json(tiktokAuth.setConfig({ clientKey: req.body?.clientKey, clientSecret: req.body?.clientSecret })); });
app.post('/api/tiktok/oauth/start', async (req, res, next) => {
  try {
    if (!tiktokAuth.status().configured) bad('Salve a client key e o client secret antes de conectar.');
    const base = await media.ensureTunnel(SHARE_PORT, path.join(dataDir, 'tunnel.log'));
    const { authUrl, redirectUri } = tiktokAuth.startAuth(base + '/tiktok/callback');
    res.json({ authUrl, redirectUri });
  } catch (error) { next(error); }
});
app.post('/api/tiktok/disconnect', (req, res) => { store.change(d => { d.connections.tiktok = { connected: false, account: '', error: 'Desconectado pelo painel.', checkedAt: new Date().toISOString() }; store.log(d, 'TikTok desconectado pelo painel.'); }); res.json(tiktokAuth.disconnect()); });
app.post('/api/contents', upload.single('video'), (req, res, next) => {
  try {
    if (!req.file) bad('Selecione um vídeo.');
    const fields = contentFields(req.body);
    const fd = fs.openSync(req.file.path, 'r'); const header = Buffer.alloc(32); fs.readSync(fd, header, 0, 32, 0); fs.closeSync(fd);
    if (header.toString('ascii', 4, 8) !== 'ftyp' && header.readUInt32BE(0) !== 0x1a45dfa3) bad('O arquivo não é um vídeo MP4, MOV ou WebM compatível.');
    const item = syncStatus({ id: randomUUID(), ...fields, file: req.file.filename, originalName: clean(req.file.originalname, 200), bytes: req.file.size, createdAt: new Date().toISOString(), source: { type: 'upload', url: '', importedCaption: '' }, media: { state: 'pending', rendition: '', thumb: '', duration: 0, width: 0, height: 0, error: '' } });
    store.change(d => { d.contents.unshift(item); store.log(d, `Vídeo adicionado: ${item.title}`); });
    prepareContent(item.id);
    res.status(201).json(item);
  } catch (error) { if (req.file) fs.rmSync(req.file.path, { force: true }); next(error); }
});
app.post('/api/import', (req, res) => {
  let url; try { url = new URL(clean(req.body?.url, 500)); } catch { bad('Cole o link do vídeo (Instagram, YouTube ou TikTok).'); }
  if (url.protocol !== 'https:' || !/(^|\.)(instagram\.com|youtube\.com|youtu\.be|tiktok\.com|facebook\.com)$/.test(url.hostname)) bad('Use um link https do Instagram, YouTube, TikTok ou Facebook.');
  if (media.tools().missing.includes('ytdlp')) bad('Ferramenta de download ausente. Execute automation/install-tools.ps1.', 503);
  const id = randomUUID();
  const item = { id, title: clean(req.body.title, 160) || 'Importando…', caption: '', hashtags: '', channels: [], scheduledAt: '', status: 'draft', file: '', originalName: '', bytes: 0, createdAt: new Date().toISOString(), source: { type: 'instagram', url: url.href, importedCaption: '' }, media: { state: 'importing', rendition: '', thumb: '', duration: 0, width: 0, height: 0, error: '' }, texts: {}, posts: {} };
  store.change(d => { d.contents.unshift(item); store.log(d, `Importação iniciada: ${url.hostname}`); });
  media.importVideo(url.href, uploadDir, id, { cookies: cookiesFile }).then(out => {
    store.change(d => { const x = d.contents.find(y => y.id === id); if (!x) return; x.file = out.file; x.originalName = out.file; x.bytes = fs.statSync(path.join(uploadDir, out.file)).size; if (x.title === 'Importando…') x.title = out.title || 'Vídeo importado'; x.caption = x.caption || out.description; x.source.importedCaption = out.description; x.media.state = 'pending'; store.log(d, `Vídeo importado: ${x.title}`); });
    prepareContent(id);
  }).catch(error => { store.change(d => { const x = d.contents.find(y => y.id === id); if (!x) return; x.media.state = 'error'; x.media.error = error.message; if (x.title === 'Importando…') x.title = 'Importação falhou'; store.log(d, 'Falha na importação: ' + error.message); }); });
  res.status(202).json(item);
});
app.post('/api/contents/:id/prepare', (req, res) => { const c = findContent(req.params.id); if (!c.file) bad('Este conteúdo ainda não tem arquivo de vídeo.'); prepareContent(c.id); res.json({ ok: true }); });
app.post('/api/contents/:id/retry', (req, res) => {
  const c = findContent(req.params.id); const network = req.body?.network;
  if (!c.channels.includes(network)) bad('Rede inválida.');
  const out = store.change(d => applyResult(d, { contentId: c.id, network, status: 'pending' }));
  res.json({ ok: true, post: out.post });
});
app.post('/api/contents/:id/manual', (req, res) => {
  const c = findContent(req.params.id); const network = req.body?.network;
  if (!networks.includes(network)) bad('Rede inválida.');
  const url = clean(req.body?.url, 500);
  if (url) { try { const u = new URL(url); if (u.protocol !== 'https:') throw 0; } catch { bad('Informe o link https da publicação.'); } }
  const out = store.change(d => { const x = d.contents.find(y => y.id === c.id); if (!x.channels.includes(network)) { x.channels.push(network); x.posts[network] = store.emptyPost(); } if (!x.scheduledAt) x.scheduledAt = new Date().toISOString(); const r = applyResult(d, { contentId: c.id, network, status: 'manual', url }); store.log(d, `Publicação manual registrada no ${network}: ${x.title}`); return r; });
  res.json({ ok: true, post: out.post, contentStatus: out.content.status });
});
app.post('/api/contents/:id/publish', async (req, res) => {
  const c = findContent(req.params.id);
  if (c.media.state !== 'ready') bad(c.media.state === 'error' ? 'O vídeo não foi preparado. Corrija o erro antes de publicar.' : 'Aguarde a preparação do vídeo terminar.');
  const requested = Array.isArray(req.body?.networks) && req.body.networks.length ? req.body.networks : c.channels;
  const targets = requested.filter(n => c.channels.includes(n) && AUTOMATED.includes(n) && ['pending', 'failed'].includes(c.posts[n]?.status || 'pending'));
  if (!targets.length) bad('Nenhuma rede pendente para publicar automaticamente neste conteúdo.');
  store.change(d => { const x = d.contents.find(y => y.id === c.id); x.scheduledAt = new Date().toISOString(); for (const n of targets) { x.posts[n] = { ...store.emptyPost(), ...(x.posts[n] || {}), status: 'pending', error: '', claimedAt: '' }; } syncStatus(x); store.log(d, `Publicação imediata solicitada: ${x.title} (${targets.join(', ')})`); });
  let triggered = false, message = '';
  try { const r = await n8nWebhook('ngd-publish-now', { contentId: c.id, networks: targets }, 20000); triggered = r.ok; message = r.ok ? 'Automação acionada.' : `O n8n respondeu ${r.status}. A fila será tentada no próximo ciclo de 5 minutos.`; }
  catch (error) { message = 'O n8n não respondeu agora. A fila será tentada no próximo ciclo de 5 minutos.'; }
  res.json({ ok: true, queued: targets, triggered, message });
});
app.post('/api/automation/run', async (req, res) => {
  try { const r = await n8nWebhook('ngd-publish-now', {}, 20000); res.json({ ok: r.ok, status: r.status, message: r.ok ? 'Fila acionada no n8n.' : `O n8n respondeu ${r.status}.` }); }
  catch (error) { res.status(502).json({ error: 'O n8n não respondeu: ' + error.message }); }
});
app.post('/api/automation/collect', async (req, res) => {
  try { const r = await n8nWebhook('ngd-collect-metrics', {}, 60000); res.json({ ok: r.ok, status: r.status, data: r.data }); }
  catch (error) { res.status(502).json({ error: 'O n8n não respondeu: ' + error.message }); }
});
app.delete('/api/contents/:id', (req, res) => {
  const c = findContent(req.params.id);
  if (Object.values(c.posts || {}).some(p => p.status === 'queued')) bad('Este conteúdo está sendo publicado agora. Aguarde.');
  store.change(d => { d.contents = d.contents.filter(x => x.id !== c.id); store.log(d, `Conteúdo removido: ${c.title}`); });
  for (const f of [c.file && path.join(uploadDir, c.file), c.media?.rendition && path.join(renditionDir, c.media.rendition), c.media?.thumb && path.join(renditionDir, c.media.thumb)]) if (f) fs.rmSync(f, { force: true });
  res.json({ ok: true });
});
app.patch('/api/contents/:id', (req, res) => {
  const c = findContent(req.params.id);
  const fields = contentFields(req.body, c);
  store.change(d => { const x = d.contents.find(y => y.id === c.id); Object.assign(x, fields); syncStatus(x); store.log(d, `Conteúdo atualizado: ${fields.title}`); });
  res.json(store.db.contents.find(x => x.id === c.id));
});
app.get('/api/contents/:id/texts', (req, res) => { const c = findContent(req.params.id); res.json(Object.fromEntries(c.channels.map(n => [n, textFor(c, n)]))); });
app.put('/api/settings', (req, res) => {
  const s = req.body; const name = clean(s.name, 120); if (!name) bad('Informe o nome da loja.');
  let url; try { url = new URL(s.n8nUrl); } catch { bad('Informe o endereço local do n8n.'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) bad('Use um endereço local, como http://localhost:5678.');
  store.change(d => { d.settings = { name, instagram: clean(s.instagram, 60).replace(/^@/, ''), city: clean(s.city, 120), whatsapp: clean(s.whatsapp, 30), n8nUrl: url.origin }; store.log(d, 'Configurações da loja atualizadas.'); }); res.json(store.db.settings);
});
app.put('/api/profiles/:network', (req, res) => {
  const network = req.params.network;
  if (!networks.includes(network)) bad('Rede inválida.');
  const value = clean(req.body.url, 500);
  if (value) {
    let url; try { url = new URL(value); } catch { bad('Informe um link válido.'); }
    const hosts = { instagram: ['instagram.com'], youtube: ['youtube.com', 'youtu.be'], tiktok: ['tiktok.com'], facebook: ['facebook.com'], linkedin: ['linkedin.com'] };
    if (url.protocol !== 'https:' || url.username || url.password || !hosts[network].some(h => url.hostname === h || url.hostname.endsWith('.' + h))) bad('Use o link HTTPS do perfil nessa rede.');
  }
  const pageId = clean(String(req.body.pageId ?? ''), 40), igUserId = clean(String(req.body.igUserId ?? ''), 40), privacy = clean(String(req.body.privacy ?? ''), 40);
  if ((pageId && !/^\d+$/.test(pageId)) || (igUserId && !/^\d+$/.test(igUserId))) bad('Os IDs da Meta são numéricos.');
  if (privacy && !['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR'].includes(privacy)) bad('Privacidade do TikTok inválida.');
  store.change(d => { d.profiles[network] = value; if (network === 'facebook' && 'pageId' in req.body) d.integrations.facebook.pageId = pageId; if (network === 'instagram' && 'igUserId' in req.body) d.integrations.instagram.igUserId = igUserId; if (network === 'tiktok' && privacy) d.integrations.tiktok.privacy = privacy; store.log(d, 'Cadastro de perfil atualizado.'); });
  res.json({ saved: true, connected: !!store.db.connections[network]?.connected, integrations: store.db.integrations });
});
app.post('/api/networks/:network/test', async (req, res) => {
  const network = req.params.network;
  if (!AUTOMATED.includes(network)) bad('Esta rede não tem teste automático.');
  let result;
  const payload = { network };
  if (network === 'tiktok') {
    try { payload.tiktokToken = await tiktokAuth.getFreshToken(); }
    catch (error) { store.change(d => { d.connections[network] = { connected: false, account: '', error: error.message, checkedAt: new Date().toISOString() }; }); return res.json(store.db.connections[network]); }
  }
  try {
    const r = await n8nWebhook('ngd-test-connection', payload, 30000);
    const d = r.data && typeof r.data === 'object' ? (Array.isArray(r.data) ? r.data[0] : r.data) : {};
    result = r.ok ? { connected: !!d.connected, account: clean(String(d.account ?? ''), 120), error: clean(String(d.error ?? ''), 500) } : { connected: false, account: '', error: r.status === 404 ? 'Fluxo "NGD · Testar conexão" não está ativo no n8n.' : `O n8n respondeu ${r.status}. Abra o fluxo de teste e escolha a credencial desta rede.` };
  } catch (error) { result = { connected: false, account: '', error: 'O n8n não respondeu: ' + error.message }; }
  store.change(d => { d.connections[network] = { ...result, checkedAt: new Date().toISOString() }; });
  res.json(store.db.connections[network]);
});
app.get('/api/n8n/status', async (req, res) => {
  const base = n8nBase();
  let online = false, connected = false;
  try { const result = await fetch(base + '/healthz', { signal: AbortSignal.timeout(2500), redirect: 'error' }); const body = await result.json(); online = result.ok && body.status === 'ok'; } catch {}
  if (online && bridgeSecret()) {
    try { const result = await fetch(base + '/webhook/ngd-local-health', { headers: { 'X-NGD-Automation': bridgeSecret() }, signal: AbortSignal.timeout(5000), redirect: 'error' }); const body = await result.json(); connected = result.ok && body.service === 'ngd-n8n'; } catch {}
  }
  const jobs = jobsSnapshot(store.db).filter(j => j.scheduledAt);
  res.json({ online, connected, mode: store.db.automation?.mode || 'idle', lastCheck: store.db.automation?.checkedAt || null, jobs, tunnel: media.tunnelStatus() });
});
app.get('/api/export', (req, res) => { res.attachment('ngd-planejamento.json').json(store.db); });
app.use('/media/prepared', express.static(renditionDir, { dotfiles: 'deny', index: false }));
app.use('/media', express.static(uploadDir, { dotfiles: 'deny', index: false }));
app.use(express.static(path.join(root, 'public')));
app.use((error, req, res, next) => { const status = error instanceof multer.MulterError ? 400 : error.status || 500; if (status >= 500) fs.appendFileSync(path.join(dataDir, 'dashboard-error.log'), `${new Date().toISOString()} ${req.method} ${req.url} ${error.stack || error}\n`); res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'O vídeo deve ter até 500 MB.' : status < 500 ? error.message : 'Não foi possível concluir. Tente novamente.' }); });

// Servidor de compartilhamento: serve só arquivos preparados com token assinado, através do túnel temporário.
export const shareApp = express();
shareApp.disable('x-powered-by');
shareApp.get('/share/:token', (req, res) => {
  const data = media.verifyShareToken(req.params.token, shareSecret() || '');
  if (!data) return res.status(404).type('text').send('Link expirado.');
  const file = path.join(renditionDir, data.file);
  if (!fs.existsSync(file)) return res.status(404).type('text').send('Arquivo indisponível.');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(file, { dotfiles: 'deny', headers: { 'Content-Type': 'video/mp4' } });
});
// Retorno da autorização do TikTok (passa pelo túnel público): só aceita um state emitido pelo painel, uma vez.
shareApp.get('/tiktok/callback', async (req, res) => {
  const page = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;max-width:520px;margin:60px auto;text-align:center"><h1>${title}</h1><p>${text}</p></body>`;
  try {
    const status = await tiktokAuth.handleCallback(req.query);
    store.change(d => { d.connections.tiktok = { connected: true, account: status.openId ? 'conta autorizada' : '', error: '', checkedAt: new Date().toISOString() }; });
    res.setHeader('Cache-Control', 'no-store'); res.type('html').send(page('TikTok conectado', 'Pode fechar esta aba e voltar para a Central NGD.'));
  } catch (error) {
    res.status(error.status || 500).type('html').send(page('Não deu certo', error.status ? error.message : 'Tente conectar de novo pelo painel.'));
  }
});
shareApp.use((req, res) => res.status(404).type('text').send('Nada aqui.'));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3210);
  app.listen(port, '127.0.0.1', () => console.log(`NGD Mídia: http://localhost:${port}`));
  shareApp.listen(SHARE_PORT, '127.0.0.1', () => console.log(`Compartilhamento temporário: 127.0.0.1:${SHARE_PORT}`));
  setTimeout(prepareMissing, 1500);
  setInterval(() => { try { store.change(d => expireStuck(d)); } catch {} }, 5 * 60 * 1000);
  process.on('exit', media.stopTunnel);
}
