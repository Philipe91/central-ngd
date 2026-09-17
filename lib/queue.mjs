// Fila de publicação por rede. Funções puras sobre o objeto db (mutam o clone passado por store.change).
export const AUTOMATED = ['youtube', 'facebook', 'instagram', 'tiktok'];
export const MANUAL_ONLY = ['linkedin'];
export const STUCK_MS = 30 * 60 * 1000;

const DONE = ['published', 'manual'];

export function syncStatus(c) {
  if (!c.scheduledAt) { c.status = 'draft'; return c; }
  const posts = (c.channels || []).map(n => c.posts?.[n]).filter(Boolean);
  if (posts.length && posts.every(p => DONE.includes(p.status))) c.status = 'published';
  else if (posts.some(p => p.status === 'failed')) c.status = 'attention';
  else c.status = 'planned';
  return c;
}

// Texto publicado: legenda específica da rede ou legenda + hashtags. Hashtags que já estão na legenda
// não são repetidas, e marcas de negrito em Markdown (**) são removidas porque nenhuma rede as interpreta.
export function textFor(c, network) {
  const specific = (c.texts?.[network] || '').trim();
  let base = specific;
  if (!base) {
    const caption = (c.caption || '').trim();
    const present = new Set((caption.match(/#[\p{L}\p{N}_]+/gu) || []).map(t => t.toLowerCase()));
    const extra = (c.hashtags || '').split(/\s+/).filter(t => t.startsWith('#') && !present.has(t.toLowerCase()));
    base = [caption, extra.join(' ')].filter(Boolean).join('\n\n');
  }
  return base.replace(/\*\*/g, '').trim();
}

export function expireStuck(db, now = Date.now(), ttl = STUCK_MS) {
  let count = 0;
  for (const c of db.contents) for (const n of c.channels || []) {
    const p = c.posts?.[n];
    if (p?.status === 'queued' && p.claimedAt && now - Date.parse(p.claimedAt) > ttl) {
      Object.assign(p, { status: 'failed', error: 'Sem resposta da automação em 30 minutos. Verifique a execução no n8n.', updatedAt: new Date(now).toISOString() });
      count++;
    }
    syncStatus(c);
  }
  return count;
}

export function claimJobs(db, now = Date.now(), { networks = AUTOMATED, limit = 10, renditionPath } = {}) {
  expireStuck(db, now);
  const jobs = [];
  for (const c of db.contents) {
    if (!c.scheduledAt || Date.parse(c.scheduledAt) > now) continue;
    if (c.media?.state !== 'ready') continue;
    for (const n of c.channels || []) {
      if (!networks.includes(n) || !AUTOMATED.includes(n)) continue;
      const p = c.posts[n] ??= { status: 'pending', attempts: 0 };
      if (p.status !== 'pending') continue;
      if (jobs.length >= limit) break;
      Object.assign(p, { status: 'queued', attempts: (p.attempts || 0) + 1, claimedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), error: '' });
      jobs.push({
        jobId: `${c.id}:${n}`, contentId: c.id, network: n, title: c.title, text: textFor(c, n), hashtags: c.hashtags || '',
        filePath: String(renditionPath ? renditionPath(c) : c.media.rendition).split('\\').join('/'), thumbPath: c.media.thumb, fileName: c.media.rendition || c.file,
        duration: c.media.duration || 0, bytes: c.media.bytes || c.bytes || 0, scheduledAt: c.scheduledAt,
      });
      syncStatus(c);
    }
  }
  db.automation = { ...(db.automation || {}), checkedAt: new Date(now).toISOString(), mode: jobs.length ? 'publishing' : 'idle', lastClaim: jobs.length };
  return jobs;
}

export function applyResult(db, { contentId, network, status, url = '', externalId = '', error = '' }, now = Date.now()) {
  const c = db.contents.find(x => x.id === contentId);
  if (!c) throw Object.assign(new Error('Conteúdo não encontrado.'), { status: 404 });
  if (!['published', 'failed', 'manual', 'pending'].includes(status)) throw Object.assign(new Error('Estado inválido.'), { status: 400 });
  const p = c.posts[network] ??= { status: 'pending', attempts: 0 };
  Object.assign(p, { status, url: url || (status === 'pending' ? '' : p.url), externalId: externalId || p.externalId, error: status === 'failed' ? (error || 'Falha não informada.') : '', updatedAt: new Date(now).toISOString() });
  if (status === 'pending') p.claimedAt = '';
  syncStatus(c);
  return { content: c, post: p };
}

export function applyMetrics(db, items, now = Date.now()) {
  let updated = 0;
  for (const item of items || []) {
    const c = db.contents.find(x => x.id === item.contentId);
    const p = c?.posts?.[item.network];
    if (!p) continue;
    const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);
    p.metrics = { views: num(item.views), likes: num(item.likes), comments: num(item.comments), shares: num(item.shares), at: new Date(now).toISOString() };
    updated++;
  }
  return updated;
}

export function jobsSnapshot(db) {
  return db.contents.flatMap(c => (c.channels || []).map(n => ({ contentId: c.id, title: c.title, network: n, scheduledAt: c.scheduledAt, media: c.media?.state, ...(c.posts?.[n] || { status: 'pending' }) })));
}
