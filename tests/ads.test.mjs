// Testes do módulo Mídia Paga (Etapa 1). Executados por `npm test`, junto com os demais.
// Chamado por: package.json (script test, padrão tests/*.test.mjs). Não exporta nada.
// Usa banco em memória e pasta temporária do sistema; não toca em data/ nem em
// plataforma de anúncio. Campos exercitados: products (sku, name, price_cents em
// centavos inteiros, status) e daily_metrics (campaign_id + date únicos, datas "2026-01-02").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, registrar } from '../lib/ads/db.mjs';
import * as catalogo from '../lib/ads/catalog.mjs';
import { prepararImagem } from '../lib/ads/images.mjs';
import { tools } from '../lib/media.mjs';

test('banco: migrações criam as tabelas e a coleta é idempotente por campanha e dia', () => {
  const db = openDb(':memory:');
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  for (const t of ['products', 'product_images', 'ad_accounts', 'campaigns', 'daily_metrics', 'leads', 'lead_events', 'recommendations', 'sync_runs', 'audit_log', 'schema_migrations']) {
    assert.ok(tabelas.includes(t), 'falta a tabela ' + t);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 1);

  db.prepare("INSERT INTO ad_accounts (platform, external_id) VALUES ('meta', 'act_1')").run();
  db.prepare("INSERT INTO campaigns (ad_account_id, external_id, first_seen, last_seen) VALUES (1, 'c1', '2026-01-01', '2026-01-01')").run();
  const inserir = db.prepare('INSERT INTO daily_metrics (campaign_id, date, spend_cents) VALUES (?, ?, ?) ON CONFLICT(campaign_id, date) DO UPDATE SET spend_cents = excluded.spend_cents');
  inserir.run(1, '2026-01-02', 1000);
  inserir.run(1, '2026-01-02', 2500);
  const linhas = db.prepare('SELECT * FROM daily_metrics').all();
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].spend_cents, 2500);

  db.prepare('DELETE FROM campaigns WHERE id = 1').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_metrics').get().n, 0);
  db.close();
});

test('catálogo: cadastra, valida, normaliza o código e apaga em cascata', () => {
  const db = openDb(':memory:');
  assert.throws(() => catalogo.criarProduto(db, { name: '' }), /nome/i);

  const p = catalogo.criarProduto(db, { name: 'Display de chão', category: 'PDV', price: '1.234,56', description: 'Papelão resistente' });
  assert.equal(p.sku, 'DISPLAY-DE-CHAO');          // sem acento, maiúsculo, com hífen
  assert.equal(p.price_cents, 123456);              // centavos inteiros, nada de float
  assert.equal(p.status, 'ativo');
  assert.throws(() => catalogo.criarProduto(db, { name: 'Outro', sku: 'display de chão' }), /já existe/i);
  assert.throws(() => catalogo.criarProduto(db, { name: 'Preço ruim', price: 'abc' }), /preço/i);

  const editado = catalogo.atualizarProduto(db, p.id, { status: 'inativo', price: '' });
  assert.equal(editado.status, 'inativo');
  assert.equal(editado.price_cents, null);

  db.prepare("INSERT INTO product_images (product_id, kind, path, created_at) VALUES (?, 'quadrada', 'x.jpg', '2026-01-01T00:00:00.000Z')").run(p.id);
  assert.equal(catalogo.resumo(db).comImagem, 1);
  catalogo.removerProduto(db, p.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_images').get().n, 0);
  assert.throws(() => catalogo.obterProduto(db, p.id), /não encontrado/i);

  const acoes = db.prepare('SELECT action FROM audit_log ORDER BY id').all().map(r => r.action);
  assert.deepEqual(acoes, ['produto.criado', 'produto.atualizado', 'produto.removido']);
  registrar(db, 'teste', 'product', 1, { a: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, 4);
  db.close();
});

test('imagem: gera 1080x1080 com fundo branco e preserva o original', { skip: tools().missing.length ? 'ferramentas ausentes' : false }, async () => {
  const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-ads-'));
  const t = tools();
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  // Foto de produto fictícia: retângulo bem deitado, para provar que não corta nem estica.
  const origem = path.join(temporario, 'foto.png');
  await run(t.ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=1600x400:d=1', '-frames:v', '1', origem], { windowsHide: true });

  const destino = path.join(temporario, 'PRODUTO-X');
  const r = await prepararImagem(origem, destino);
  assert.equal(r.quadrada.width, 1080);
  assert.equal(r.quadrada.height, 1080);
  assert.equal(r.original.width, 1600);
  assert.ok(fs.existsSync(path.join(destino, 'original.png')), 'o original tem de continuar lá');
  assert.equal(r.quadrada.sha256.length, 64);
  assert.notEqual(r.original.sha256, r.quadrada.sha256);

  // O canto superior esquerdo tem de ser branco: é a margem do fundo, não o produto.
  const amostra = path.join(temporario, 'canto.rgb');
  await run(t.ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(destino, 'quadrada.jpg'), '-vf', 'crop=8:8:0:0,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', amostra], { windowsHide: true });
  const [rr, gg, bb] = fs.readFileSync(amostra);
  assert.ok(rr > 245 && gg > 245 && bb > 245, `canto deveria ser branco, veio ${rr},${gg},${bb}`);

  fs.rmSync(temporario, { recursive: true, force: true });
});
