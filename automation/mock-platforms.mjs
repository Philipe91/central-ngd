// Mock local das plataformas (YouTube, Meta/Facebook/Instagram e TikTok) para testar a automação sem contas reais.
// Escuta só em 127.0.0.1 e nada sai para a internet. Use com `create-workflows.mjs --simulate` e `automation/simular.ps1`.
// Modos por rede: ok (publica), auth (token inválido) e recusado (plataforma rejeita o vídeo). Controle em /__mock/modo.
import express from 'express';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const REDES = ['youtube', 'facebook', 'instagram', 'tiktok'];
export const MODOS = ['ok', 'auth', 'recusado'];
const novoId = prefixo => prefixo + randomBytes(4).toString('hex');
const numero = (base, id) => base + (parseInt(id.replace(/\D/g, '').slice(-4) || '0', 10) % 900);

const ERRO_AUTH = {
  youtube: [401, { error: { code: 401, message: 'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.', status: 'UNAUTHENTICATED' } }],
  facebook: [400, { error: { message: 'Invalid OAuth access token - Cannot parse access token', type: 'OAuthException', code: 190, fbtrace_id: 'SIMULADO' } }],
  instagram: [400, { error: { message: 'Invalid OAuth access token - Cannot parse access token', type: 'OAuthException', code: 190, fbtrace_id: 'SIMULADO' } }],
  tiktok: [401, { error: { code: 'access_token_invalid', message: 'The access token is invalid or not found in the request.', log_id: 'SIMULADO' } }],
};
const ERRO_RECUSA = {
  youtube: [400, { error: { code: 400, message: 'The request metadata specifies an invalid video description.', errors: [{ reason: 'invalidDescription' }] } }],
  facebook: [400, { error: { message: "The video file you selected is in a format that we don't support.", type: 'GraphMethodException', code: 352, error_user_msg: 'Formato de vídeo não aceito (simulação).' } }],
};
const ttOk = { code: 'ok', message: '', log_id: 'SIMULADO' };

export function createMock({ log = () => {} } = {}) {
  const estado = { modos: Object.fromEntries(REDES.map(r => [r, 'ok'])), objetos: new Map(), publicacoes: [], chamadas: [] };
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const baseDe = req => 'http://' + req.get('host');
  const drenar = req => new Promise(resolve => { let bytes = 0; req.on('data', c => { bytes += c.length; }); req.on('end', () => resolve(bytes)); req.on('error', () => resolve(bytes)); });
  const publicar = (rede, id, extra = {}) => { const item = { rede, id, hora: new Date().toISOString(), ...extra }; estado.publicacoes.push(item); log(`PUBLICADO (simulado) ${rede} ${id}`); return item; };
  function redeDe(req) {
    const p = req.path;
    if (p.startsWith('/youtube')) return 'youtube';
    if (p.startsWith('/tiktok')) return 'tiktok';
    if (p.startsWith('/rupload') || /video_reels$/.test(p) || p.endsWith('/me')) return 'facebook';
    if (/\/media(_publish)?$/.test(p)) return 'instagram';
    const m = p.match(/^\/graph\/v[\d.]+\/([^/]+)$/);
    if (m) { const o = estado.objetos.get(m[1]); if (o) return o.rede; return String(req.query.fields || '').includes('username') ? 'instagram' : 'facebook'; }
    return 'facebook';
  }

  // ---------- controle do mock ----------
  app.get('/__mock/estado', (req, res) => res.json({ modos: estado.modos, publicacoes: estado.publicacoes, chamadas: estado.chamadas.slice(-200), total: estado.chamadas.length }));
  app.post('/__mock/modo', (req, res) => {
    const { rede, modo } = req.body || {};
    if (!MODOS.includes(modo)) return res.status(400).json({ error: `Modo inválido. Use: ${MODOS.join(', ')}.` });
    const alvo = rede === 'todas' ? REDES : REDES.includes(rede) ? [rede] : null;
    if (!alvo) return res.status(400).json({ error: `Rede inválida. Use: ${REDES.join(', ')} ou todas.` });
    for (const r of alvo) estado.modos[r] = modo;
    log(`MODO ${alvo.join(',')} -> ${modo}`);
    res.json({ ok: true, modos: estado.modos });
  });
  app.post('/__mock/limpar', (req, res) => { estado.objetos.clear(); estado.publicacoes.length = 0; estado.chamadas.length = 0; res.json({ ok: true }); });

  // ---------- autenticação simulada ----------
  app.use((req, res, next) => {
    if (req.path.startsWith('/__mock')) return next();
    const rede = redeDe(req);
    const auth = req.get('authorization') || '';
    estado.chamadas.push({ hora: new Date().toISOString(), rede, metodo: req.method, caminho: req.path, autenticado: !!auth, modo: estado.modos[rede] });
    log(`${req.method} ${req.path} [${rede}] auth=${auth ? 'sim' : 'NAO'} modo=${estado.modos[rede]}`);
    req.rede = rede;
    // O upload do TikTok vai para uma URL pré-assinada, sem Authorization (igual à API real).
    const semToken = req.path.startsWith('/tiktok/upload/');
    if (!semToken && (!auth || estado.modos[rede] === 'auth')) {
      // Drena o corpo (upload) antes de responder, senão a conexão keep-alive seguinte fica presa.
      const [status, body] = ERRO_AUTH[rede];
      const responder = () => res.status(status).json(body);
      return req.readableEnded || req.complete ? responder() : drenar(req).then(responder);
    }
    next();
  });
  const recusado = req => estado.modos[req.rede] === 'recusado';

  // ---------- YouTube ----------
  app.post('/youtube/upload/videos', async (req, res) => {
    const bytes = await drenar(req);
    if (recusado(req)) { const [status, body] = ERRO_RECUSA.youtube; return res.status(status).json(body); }
    const id = novoId('yt');
    estado.objetos.set(id, { rede: 'youtube', tipo: 'video', bytes, titulo: String(req.query.title || '') });
    publicar('youtube', id, { bytes, url: 'https://youtube.com/shorts/' + id });
    res.json({ kind: 'youtube#video', id, snippet: { title: String(req.query.title || '') }, status: { uploadStatus: 'uploaded', privacyStatus: 'public' } });
  });
  app.get('/youtube/v3/channels', (req, res) => res.json({ items: [{ id: 'UCsimulado', snippet: { title: 'Canal NGD (simulado)' } }] }));
  app.get('/youtube/v3/videos', (req, res) => {
    const id = String(req.query.id || '');
    if (!estado.objetos.has(id)) return res.json({ items: [] });
    res.json({ items: [{ id, statistics: { viewCount: String(numero(1200, id)), likeCount: String(numero(80, id)), commentCount: String(numero(6, id)) } }] });
  });

  // ---------- Meta: Facebook Reels ----------
  app.post('/graph/:v/:pageId/video_reels', (req, res) => {
    if (req.query.upload_phase === 'finish') {
      const id = String(req.query.video_id || '');
      const o = estado.objetos.get(id);
      if (!o) return res.status(400).json({ error: { message: 'Unsupported post request. Object with ID does not exist (simulação).', type: 'GraphMethodException', code: 100 } });
      if (!o.bytes) return res.status(400).json({ error: { message: 'Video upload has not finished (simulação).', code: 389 } });
      o.publicado = true;
      publicar('facebook', id, { bytes: o.bytes, url: 'https://www.facebook.com/reel/' + id });
      return res.json({ success: true, post_id: req.params.pageId + '_' + id });
    }
    if (recusado(req)) { const [status, body] = ERRO_RECUSA.facebook; return res.status(status).json(body); }
    const id = novoId('fbv');
    estado.objetos.set(id, { rede: 'facebook', tipo: 'video', bytes: 0 });
    res.json({ video_id: id, upload_url: `${baseDe(req)}/rupload/video-reels/${id}` });
  });
  app.post('/rupload/video-reels/:videoId', async (req, res) => {
    const bytes = await drenar(req);
    const o = estado.objetos.get(req.params.videoId);
    if (!o) return res.status(400).json({ error: { message: 'Invalid video id (simulação).', code: 100 } });
    o.bytes = bytes;
    res.json({ success: true });
  });

  // ---------- Meta: Instagram Reels ----------
  app.post('/graph/:v/:igUserId/media', async (req, res) => {
    const url = String(req.body?.video_url || '');
    const id = novoId('igc');
    const o = { rede: 'instagram', tipo: 'container', consultas: 0, status_code: 'IN_PROGRESS', status: 'In progress', legenda: String(req.body?.caption || '') };
    estado.objetos.set(id, o);
    try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); await r.body?.cancel(); o.download = r.ok; o.motivo = r.ok ? '' : `HTTP ${r.status}`; } catch (error) { o.download = false; o.motivo = error.message; }
    res.json({ id });
  });
  app.post('/graph/:v/:igUserId/media_publish', (req, res) => {
    const c = estado.objetos.get(String(req.query.creation_id || ''));
    if (!c || c.status_code !== 'FINISHED') return res.status(400).json({ error: { message: 'Media ID is not available (simulação).', type: 'OAuthException', code: 9007 } });
    const id = novoId('igm');
    estado.objetos.set(id, { rede: 'instagram', tipo: 'media', permalink: 'https://www.instagram.com/reel/' + id + '/' });
    publicar('instagram', id, { url: 'https://www.instagram.com/reel/' + id + '/' });
    res.json({ id });
  });

  // ---------- Meta: consultas por ID (estado do contêiner, link, métricas, quem sou eu) ----------
  app.get('/graph/:v/:id', (req, res) => {
    const fields = String(req.query.fields || '');
    const id = req.params.id;
    if (id === 'me') return res.json(fields.includes('username') ? { id: '17841400000000001', username: 'ngdgrafica' } : { id: '100000000000001', name: 'NGD Núcleo Gráfico (simulado)' });
    if (fields.includes('username') && !estado.objetos.has(id)) return res.json({ id, username: 'ngdgrafica' });
    const o = estado.objetos.get(id);
    if (!o) return res.status(400).json({ error: { message: 'Unsupported get request. Object with ID does not exist (simulação).', type: 'GraphMethodException', code: 100 } });
    if (fields.includes('status_code')) {
      o.consultas++;
      if (o.consultas >= 2 && o.status_code === 'IN_PROGRESS') {
        if (!o.download) { o.status_code = 'ERROR'; o.status = `Error: Media download failed (${o.motivo}) (simulação)`; }
        else if (estado.modos.instagram === 'recusado') { o.status_code = 'ERROR'; o.status = 'Error: Media upload has failed with error code 2207026: unsupported video format (simulação)'; }
        else { o.status_code = 'FINISHED'; o.status = 'Finished'; }
      }
      return res.json({ id, status_code: o.status_code, status: o.status });
    }
    if (fields.includes('permalink')) return res.json({ id, permalink: o.permalink });
    if (fields.includes('like_count')) return res.json({ id, like_count: numero(90, id), comments_count: numero(7, id), insights: { data: [{ name: 'views', values: [{ value: numero(1500, id) }] }, { name: 'shares', values: [{ value: numero(12, id) }] }] } });
    if (fields.includes('views')) return res.json({ id, views: numero(900, id), likes: { summary: { total_count: numero(40, id) } }, comments: { summary: { total_count: numero(3, id) } } });
    res.json({ id });
  });

  // ---------- TikTok ----------
  app.post('/tiktok/v2/post/publish/video/init/', (req, res) => {
    const id = novoId('tt');
    estado.objetos.set(id, { rede: 'tiktok', tipo: 'publish', bytes: 0, consultas: 0, tamanho: Number(req.body?.source_info?.video_size || 0) });
    res.json({ data: { publish_id: id, upload_url: `${baseDe(req)}/tiktok/upload/${id}` }, error: ttOk });
  });
  app.put('/tiktok/upload/:id', async (req, res) => {
    const bytes = await drenar(req);
    const o = estado.objetos.get(req.params.id);
    if (!o) return res.status(404).end();
    o.bytes = bytes;
    res.status(201).end();
  });
  app.post('/tiktok/v2/post/publish/status/fetch/', (req, res) => {
    const id = String(req.body?.publish_id || '');
    const o = estado.objetos.get(id);
    if (!o) return res.status(400).json({ error: { code: 'invalid_publish_id', message: 'The publish_id does not exist (simulação).', log_id: 'SIMULADO' } });
    o.consultas++;
    if (o.consultas < 2) return res.json({ data: { status: 'PROCESSING_UPLOAD' }, error: ttOk });
    if (!o.bytes) return res.json({ data: { status: 'FAILED', fail_reason: 'file_upload_failed' }, error: ttOk });
    if (recusado(req)) return res.json({ data: { status: 'FAILED', fail_reason: 'video_format_check_failed' }, error: ttOk });
    if (!o.publicado) { o.publicado = 'v' + id.slice(2); publicar('tiktok', o.publicado, { bytes: o.bytes, url: 'https://www.tiktok.com/video/' + o.publicado }); }
    res.json({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [o.publicado] }, error: ttOk });
  });
  app.get('/tiktok/v2/user/info/', (req, res) => res.json({ data: { user: { display_name: 'NGD Gráfica (simulado)', username: 'ngdgrafica' } }, error: ttOk }));
  app.post('/tiktok/v2/video/query/', (req, res) => {
    const ids = req.body?.filters?.video_ids || [];
    res.json({ data: { videos: ids.map(id => ({ id, view_count: numero(700, id), like_count: numero(50, id), comment_count: numero(4, id), share_count: numero(9, id) })) }, error: ttOk });
  });

  app.use((req, res) => res.status(404).json({ error: { message: `Rota não simulada: ${req.method} ${req.path}`, code: 404 } }));
  app.estado = estado;
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.NGD_MOCK_PORT || 3212);
  createMock({ log: m => console.log(new Date().toISOString().slice(11, 19), m) }).listen(port, '127.0.0.1', () => console.log(`Mock das plataformas (simulação): http://127.0.0.1:${port}`));
}
