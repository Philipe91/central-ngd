import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const NETWORKS = ['instagram', 'youtube', 'tiktok', 'facebook', 'linkedin'];

const emptyPost = () => ({ status: 'pending', url: '', externalId: '', error: '', attempts: 0, updatedAt: '', claimedAt: '', metrics: null });

export function migrateContent(c) {
  c.hashtags ??= '';
  c.source ??= { type: 'upload', url: '', importedCaption: '' };
  c.media ??= { state: 'pending', rendition: '', thumb: '', duration: 0, width: 0, height: 0, error: '' };
  c.texts ??= {};
  c.posts ??= {};
  for (const n of c.channels || []) c.posts[n] ??= emptyPost();
  if (!['draft', 'planned', 'published', 'attention'].includes(c.status)) c.status = c.scheduledAt ? 'planned' : 'draft';
  return c;
}

export function migrateDb(db) {
  db.settings ??= {};
  db.settings.n8nUrl ??= 'http://localhost:5678';
  db.profiles ??= {};
  db.integrations ??= {};
  db.integrations.facebook ??= { pageId: '' };
  db.integrations.instagram ??= { igUserId: '' };
  db.integrations.tiktok ??= { privacy: 'SELF_ONLY' };
  db.connections ??= {};
  db.contents ??= [];
  db.activity ??= [];
  db.automation ??= { checkedAt: '', mode: 'preparation', jobs: [] };
  db.contents.forEach(migrateContent);
  return db;
}

export function createStore(dataDir, initial) {
  const dbPath = path.join(dataDir, 'dashboard.json');
  let db = migrateDb(fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : structuredClone(initial));
  function save(next) {
    fs.writeFileSync(dbPath + '.tmp', JSON.stringify(next, null, 2));
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dbPath + '.bak');
    fs.renameSync(dbPath + '.tmp', dbPath);
    db = next;
  }
  if (!fs.existsSync(dbPath)) save(db);
  return {
    get db() { return db; },
    change(fn) { const next = structuredClone(db); const result = fn(next); save(next); return result; },
    log(d, message) { d.activity.unshift({ id: randomUUID(), message, at: new Date().toISOString() }); d.activity = d.activity.slice(0, 100); },
    emptyPost,
  };
}
