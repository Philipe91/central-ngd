// Banco do módulo Mídia Paga: SQLite embutido do Node 24 (node:sqlite).
// Escolhido para não acrescentar dependência nativa ao projeto, que hoje tem só
// express e multer. Fica em data/ads.sqlite, fora do git, só no PC da loja.
//
// Regras: dinheiro sempre em centavos inteiros; datas em texto ISO; nenhuma outra
// parte do sistema abre este arquivo, tudo passa por aqui.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Cada migração roda uma vez, na ordem. Nunca edite uma já aplicada: acrescente outra.
const MIGRATIONS = [
  `CREATE TABLE products (
     id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
     price_cents INTEGER, status TEXT NOT NULL DEFAULT 'ativo',
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE product_images (
     id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     kind TEXT NOT NULL, path TEXT NOT NULL, width INTEGER, height INTEGER,
     bytes INTEGER, sha256 TEXT, created_at TEXT NOT NULL);
   CREATE INDEX idx_images_product ON product_images(product_id);
   CREATE TABLE ad_accounts (
     id INTEGER PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT NOT NULL,
     name TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'BRL',
     active INTEGER NOT NULL DEFAULT 1, UNIQUE(platform, external_id));
   CREATE TABLE campaigns (
     id INTEGER PRIMARY KEY, ad_account_id INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
     external_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', objective TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT '', daily_budget_cents INTEGER, ref_code TEXT UNIQUE,
     first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, raw_json TEXT);
   CREATE TABLE daily_metrics (
     id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
     date TEXT NOT NULL, spend_cents INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
     clicks INTEGER NOT NULL DEFAULT 0, platform_leads INTEGER NOT NULL DEFAULT 0,
     raw_json TEXT, UNIQUE(campaign_id, date));
   CREATE TABLE leads (
     id INTEGER PRIMARY KEY, created_at TEXT NOT NULL,
     campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL, ref_code TEXT,
     source TEXT NOT NULL DEFAULT 'whatsapp', contact_name TEXT NOT NULL DEFAULT '',
     contact_phone TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT 'lead',
     quoted_cents INTEGER, won_cents INTEGER, closed_at TEXT, notes TEXT NOT NULL DEFAULT '');
   CREATE INDEX idx_leads_stage ON leads(stage);
   CREATE TABLE lead_events (
     id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
     at TEXT NOT NULL, from_stage TEXT, to_stage TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
   CREATE TABLE recommendations (
     id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, rule TEXT NOT NULL,
     campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE, payload_json TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'rascunho', decided_at TEXT, note TEXT NOT NULL DEFAULT '');
   CREATE TABLE sync_runs (
     id INTEGER PRIMARY KEY, platform TEXT NOT NULL, started_at TEXT NOT NULL,
     finished_at TEXT, ok INTEGER NOT NULL DEFAULT 0, rows_upserted INTEGER NOT NULL DEFAULT 0,
     message TEXT NOT NULL DEFAULT '');
   CREATE TABLE audit_log (
     id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL,
     entity TEXT NOT NULL DEFAULT '', entity_id TEXT NOT NULL DEFAULT '', payload_json TEXT);`,
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const aplicadas = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  for (const [i, sql] of MIGRATIONS.entries()) {
    const version = i + 1;
    if (aplicadas.has(version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return db;
}

/** Cópia consistente do banco, para backup. Mantém as `manter` mais recentes. */
export async function backup(db, dir, manter = 7) {
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `ads-${new Date().toISOString().slice(0, 10)}.sqlite`);
  await db.backup(destino);
  const antigos = fs.readdirSync(dir).filter(f => /^ads-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0, -manter);
  for (const f of antigos) fs.rmSync(path.join(dir, f), { force: true });
  return destino;
}

export function registrar(db, action, entity = '', entityId = '', payload = null) {
  db.prepare('INSERT INTO audit_log (at, action, entity, entity_id, payload_json) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), action, String(entity), String(entityId), payload ? JSON.stringify(payload) : null);
}
