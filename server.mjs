import express from 'express';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NGD_DATA_DIR || path.join(root, 'data');
const uploadDir = path.join(dataDir, 'videos');
fs.mkdirSync(uploadDir, { recursive: true });
const dbPath = path.join(dataDir, 'dashboard.json');
const networks = ['instagram', 'youtube', 'tiktok', 'facebook', 'linkedin'];
const initial = { settings: { name: 'NGD Núcleo Gráfico Digital', instagram: 'ngdgrafica', city: '', whatsapp: '', n8nUrl: 'http://localhost:5678' }, profiles: { instagram: 'https://www.instagram.com/ngdgrafica/' }, contents: [], activity: [] };
let db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : initial;
function save(next) {
  fs.writeFileSync(dbPath + '.tmp', JSON.stringify(next, null, 2));
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dbPath + '.bak');
  fs.renameSync(dbPath + '.tmp', dbPath);
  db = next;
}
if (!fs.existsSync(dbPath)) save(db);
function change(fn) { const next = structuredClone(db); fn(next); save(next); }
function log(d, message) { d.activity.unshift({ id: randomUUID(), message, at: new Date().toISOString() }); d.activity = d.activity.slice(0, 100); }
function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function bad(message) { const e = new Error(message); e.status = 400; throw e; }
function contentFields(body) {
  const title = clean(body.title, 160); if (!title) bad('Informe um título para o vídeo.');
  let channels = body.channels;
  if (typeof channels === 'string') { try { channels = JSON.parse(channels); } catch { bad('Selecione redes válidas.'); } }
  if (!Array.isArray(channels) || channels.some(n => !networks.includes(n))) bad('Selecione redes válidas.');
  const scheduledAt = clean(body.scheduledAt, 50);
  if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) bad('Informe uma data válida.');
  if (scheduledAt && !channels.length) bad('Selecione pelo menos uma rede para planejar uma publicação.');
  return { title, caption: clean(body.caption, 5000), channels: [...new Set(channels)], scheduledAt, status: scheduledAt ? 'planned' : 'draft' };
}
export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return res.status(403).json({ error: 'Acesso apenas neste computador.' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return res.status(403).json({ error: 'Origem não autorizada.' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Origem não autorizada.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: '64kb' }));
function bridgeSecret() {
  const file = path.join(dataDir, 'automation-secrets.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).bridgeToken : null;
}
function authenticateBridge(req, res, next) {
  const expected = bridgeSecret(); const received = req.headers['x-ngd-automation'];
  if (req.headers.origin || !expected || typeof received !== 'string' || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return res.status(401).json({ error: 'Comunicação local não autorizada.' });
  next();
}
app.post('/api/automation/prepare', authenticateBridge, (req, res) => {
  const checkedAt = new Date().toISOString();
  const jobs = db.contents.filter(c => c.scheduledAt).flatMap(c => c.channels.map(network => ({ contentId: c.id, title: c.title, network, scheduledAt: c.scheduledAt, due: Date.parse(c.scheduledAt) <= Date.now(), status: 'blocked', reason: 'Configurar credenciais e publicador desta rede.' })));
  change(d => { d.automation = { checkedAt, mode: 'preparation', jobs }; });
  res.json({ ok: true, mode: 'preparation', checkedAt, total: jobs.length, blocked: jobs.length, published: 0 });
});
const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()) }), limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 8, fieldSize: 20000 }, fileFilter: (req, file, cb) => {
  if (!['.mp4', '.mov', '.webm'].includes(path.extname(file.originalname).toLowerCase())) return cb(Object.assign(new Error('Envie um vídeo MP4, MOV ou WebM.'), { status: 400 }));
  cb(null, true);
} });
app.get('/api/state', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(db); });
app.post('/api/contents', upload.single('video'), (req, res, next) => {
  try {
    if (!req.file) bad('Selecione um vídeo.');
    const fields = contentFields(req.body);
    const fd = fs.openSync(req.file.path, 'r'); const header = Buffer.alloc(32); fs.readSync(fd, header, 0, 32, 0); fs.closeSync(fd);
    if (header.toString('ascii', 4, 8) !== 'ftyp' && header.readUInt32BE(0) !== 0x1a45dfa3) bad('O arquivo não é um vídeo MP4, MOV ou WebM compatível.');
    const item = { id: randomUUID(), ...fields, file: req.file.filename, originalName: clean(req.file.originalname, 200), bytes: req.file.size, createdAt: new Date().toISOString() };
    change(d => { d.contents.unshift(item); log(d, `Vídeo adicionado: ${item.title}`); });
    res.status(201).json(item);
  } catch (error) { if (req.file) fs.rmSync(req.file.path, { force: true }); next(error); }
});
app.patch('/api/contents/:id', (req, res) => {
  if (!db.contents.some(c => c.id === req.params.id)) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  const fields = contentFields(req.body);
  change(d => { Object.assign(d.contents.find(c => c.id === req.params.id), fields); log(d, `Conteúdo atualizado: ${fields.title}`); });
  res.json(db.contents.find(c => c.id === req.params.id));
});
app.put('/api/settings', (req, res) => {
  const s = req.body; const name = clean(s.name, 120); if (!name) bad('Informe o nome da loja.');
  let url; try { url = new URL(s.n8nUrl); } catch { bad('Informe o endereço local do n8n.'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) bad('Use um endereço local, como http://localhost:5678.');
  change(d => { d.settings = { name, instagram: clean(s.instagram, 60).replace(/^@/, ''), city: clean(s.city, 120), whatsapp: clean(s.whatsapp, 30), n8nUrl: url.origin }; log(d, 'Configurações da loja atualizadas.'); }); res.json(db.settings);
});
app.put('/api/profiles/:network', (req, res) => {
  if (!networks.includes(req.params.network)) bad('Rede inválida.');
  const value = clean(req.body.url, 500);
  if (value) {
    let url; try { url = new URL(value); } catch { bad('Informe um link válido.'); }
    const hosts = { instagram: ['instagram.com'], youtube: ['youtube.com', 'youtu.be'], tiktok: ['tiktok.com'], facebook: ['facebook.com'], linkedin: ['linkedin.com'] };
    if (url.protocol !== 'https:' || url.username || url.password || !hosts[req.params.network].some(h => url.hostname === h || url.hostname.endsWith('.' + h))) bad('Use o link HTTPS do perfil nessa rede.');
  }
  change(d => { d.profiles[req.params.network] = value; log(d, 'Cadastro de perfil atualizado.'); }); res.json({ saved: true, connected: false });
});
app.get('/api/n8n/status', async (req, res) => {
  const base = db.settings.n8nUrl.replace('localhost', '127.0.0.1');
  let online = false, connected = false;
  try { const result = await fetch(base + '/healthz', { signal: AbortSignal.timeout(2500), redirect: 'error' }); const body = await result.json(); online = result.ok && body.status === 'ok'; } catch {}
  if (online && bridgeSecret()) {
    try { const result = await fetch(base + '/webhook/ngd-local-health', { headers: { 'X-NGD-Automation': bridgeSecret() }, signal: AbortSignal.timeout(5000), redirect: 'error' }); const body = await result.json(); connected = result.ok && body.service === 'ngd-n8n'; } catch {}
  }
  res.json({ online, connected, mode: 'preparation', lastCheck: db.automation?.checkedAt || null, jobs: db.automation?.jobs || [] });
});
app.get('/api/export', (req, res) => { res.attachment('ngd-planejamento.json').json(db); });
app.use('/media', express.static(uploadDir, { dotfiles: 'deny', index: false }));
app.use(express.static(path.join(root, 'public')));
app.use((error, req, res, next) => { const status = error instanceof multer.MulterError ? 400 : error.status || 500; res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'O vídeo deve ter até 500 MB.' : status < 500 ? error.message : 'Não foi possível salvar. Tente novamente.' }); });
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3210);
  app.listen(port, '127.0.0.1', () => console.log(`NGD Mídia: http://localhost:${port}`));
}
