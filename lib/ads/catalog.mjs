// Catálogo de produtos da Mídia Paga: cadastro local, sem nenhuma chamada a plataforma.
//
// Importado por: lib/ads/routes.mjs (e pelos testes).
// API pública: normalizarSku, listarProdutos, obterProduto, criarProduto,
// atualizarProduto, removerProduto, salvarImagens, resumo.
// Tabelas usadas: products (sku, name, category, description, price_cents inteiro,
// status 'ativo'|'inativo', created_at/updated_at ISO) e product_images
// (product_id, kind 'original'|'quadrada', path, width, height, bytes, sha256).
import { registrar } from './db.mjs';

const agora = () => new Date().toISOString();
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const erro = (mensagem, status = 400) => Object.assign(new Error(mensagem), { status });

/** SKU estável: usado como nome de pasta das imagens, então só aceita letra, número e hífen. */
export function normalizarSku(valor, nome = '') {
  const base = texto(valor, 40) || texto(nome, 40);
  const sku = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!sku) throw erro('Informe um código ou um nome para o produto.');
  return sku;
}

function precoEmCentavos(valor) {
  if (valor === '' || valor == null) return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw erro('Preço inválido.');
  return Math.round(n * 100);
}

export function listarProdutos(db) {
  const produtos = db.prepare("SELECT * FROM products ORDER BY status = 'inativo', name COLLATE NOCASE").all();
  const imagens = db.prepare('SELECT * FROM product_images ORDER BY id').all();
  return produtos.map(p => ({ ...p, images: imagens.filter(i => i.product_id === p.id) }));
}

export function obterProduto(db, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(id));
  if (!p) throw erro('Produto não encontrado.', 404);
  p.images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY id').all(p.id);
  return p;
}

export function criarProduto(db, dados) {
  const sku = normalizarSku(dados.sku, dados.name);
  const name = texto(dados.name, 120);
  if (!name) throw erro('Informe o nome do produto.');
  if (db.prepare('SELECT id FROM products WHERE sku = ?').get(sku)) throw erro(`Já existe um produto com o código ${sku}.`);
  const at = agora();
  const r = db.prepare(`INSERT INTO products (sku, name, category, description, price_cents, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sku, name, texto(dados.category, 60), texto(dados.description, 600), precoEmCentavos(dados.price), 'ativo', at, at);
  registrar(db, 'produto.criado', 'product', r.lastInsertRowid, { sku, name });
  return obterProduto(db, r.lastInsertRowid);
}

export function atualizarProduto(db, id, dados) {
  const atual = obterProduto(db, id);
  const name = texto(dados.name ?? atual.name, 120);
  if (!name) throw erro('Informe o nome do produto.');
  const status = ['ativo', 'inativo'].includes(dados.status) ? dados.status : atual.status;
  db.prepare('UPDATE products SET name = ?, category = ?, description = ?, price_cents = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(name, texto(dados.category ?? atual.category, 60), texto(dados.description ?? atual.description, 600),
      dados.price === undefined ? atual.price_cents : precoEmCentavos(dados.price), status, agora(), atual.id);
  registrar(db, 'produto.atualizado', 'product', atual.id, { name, status });
  return obterProduto(db, atual.id);
}

export function removerProduto(db, id) {
  const p = obterProduto(db, id);
  db.prepare('DELETE FROM products WHERE id = ?').run(p.id);   // imagens saem em cascata
  registrar(db, 'produto.removido', 'product', p.id, { sku: p.sku });
  return { removed: p.id, sku: p.sku };
}

/** Grava no banco o par original + quadrada devolvido por prepararImagem(). */
export function salvarImagens(db, productId, resultado, caminhoRelativo) {
  const p = obterProduto(db, productId);
  db.prepare('DELETE FROM product_images WHERE product_id = ?').run(p.id);
  const insert = db.prepare(`INSERT INTO product_images (product_id, kind, path, width, height, bytes, sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const kind of ['original', 'quadrada']) {
    const i = resultado[kind];
    insert.run(p.id, kind, caminhoRelativo(i.path), i.width, i.height, i.bytes, i.sha256, agora());
  }
  db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').run(agora(), p.id);
  registrar(db, 'produto.imagem', 'product', p.id, { quadrada: `${resultado.quadrada.width}x${resultado.quadrada.height}` });
  return obterProduto(db, p.id);
}

export function resumo(db) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const ativos = db.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'ativo'").get().n;
  const comImagem = db.prepare("SELECT COUNT(DISTINCT product_id) AS n FROM product_images WHERE kind = 'quadrada'").get().n;
  const contas = db.prepare('SELECT COUNT(*) AS n FROM ad_accounts').get().n;
  const leads = db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;
  return { total, ativos, comImagem, semImagem: total - comImagem, contas, leads };
}
