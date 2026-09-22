// Rotas do módulo Mídia Paga. Montadas em /api/ads pelo server.mjs.
//
// Importado por: server.mjs (uma linha). API pública: criarRotasAds(dataDir) -> express.Router.
// Lê e grava apenas em data/ads.sqlite e data/ads/products/<sku>/; nunca toca no
// dashboard.json do módulo de vídeos.
// Etapa 1: nenhuma rota aqui fala com Meta, LinkedIn ou qualquer plataforma de anúncio.
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb, backup } from './db.mjs';
import { prepararImagem } from './images.mjs';
import * as catalogo from './catalog.mjs';
import * as funil from './funnel.mjs';
import * as painel from './dashboard.mjs';
import { criarClienteMeta, sincronizar, API_BASE } from './meta.mjs';

const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSOES = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function criarRotasAds(dataDir) {
  const dbFile = path.join(dataDir, 'ads.sqlite');
  const produtosDir = path.join(dataDir, 'ads', 'products');
  const tmpDir = path.join(dataDir, 'ads', 'tmp');
  for (const d of [produtosDir, tmpDir]) fs.mkdirSync(d, { recursive: true });
  const db = openDb(dbFile);
  const relativo = abs => path.relative(dataDir, abs).split('\\').join('/');
  // NGD_META_BASE aponta para o mock no modo simulado; em produção fica o Graph API real.
  const meta = criarClienteMeta({ file: path.join(dataDir, 'ads-secrets.json'), baseUrl: process.env.NGD_META_BASE || API_BASE });

  // Alguns navegadores e clientes mandam application/octet-stream; por isso a extensão
  // também vale. A validação real vem depois: o ffmpeg recusa o que não for imagem.
  const aceita = (req, file, cb) => {
    const ok = IMAGENS.has(file.mimetype) || EXTENSOES.has(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : Object.assign(new Error('Envie uma imagem JPG, PNG ou WebP.'), { status: 400 }), ok);
  };
  const upload = multer({
    storage: multer.diskStorage({ destination: tmpDir, filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()) }),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: aceita,
  });

  const router = express.Router();
  router.use(express.json({ limit: '128kb' }));

  // Estado do módulo: o painel usa para mostrar que ainda não há conta conectada.
  router.get('/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ultimaSync = db.prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1').get() || null;
    res.json({ etapa: 2, somenteLeitura: true, meta: meta.status(), ultimaSync, ...catalogo.resumo(db), funil: funil.duasVerdades(db) });
  });

  // ---------- funil: campanhas, links e leads ----------
  router.get('/campaigns', (req, res) => {
    const site = String(req.query.site || '');
    const whatsapp = String(req.query.whatsapp || '');
    res.json({ items: funil.listarCampanhas(db).map(c => ({ ...c, links: c.ref_code ? funil.gerarLinks(c, { site, whatsapp }) : null })) });
  });
  router.post('/campaigns/manual', (req, res) => res.status(201).json(funil.criarCampanhaManual(db, req.body || {})));

  router.get('/leads', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ items: funil.listarLeads(db), estagios: funil.ESTAGIOS, rotulos: funil.ROTULOS }); });
  router.post('/leads', (req, res) => res.status(201).json(funil.criarLead(db, req.body || {})));
  router.get('/leads/:id', (req, res) => res.json(funil.obterLead(db, req.params.id)));
  router.post('/leads/:id/stage', (req, res) => res.json(funil.moverEstagio(db, req.params.id, req.body || {})));
  router.delete('/leads/:id', (req, res) => res.json(funil.removerLead(db, req.params.id)));
  router.get('/funnel', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(funil.duasVerdades(db)); });

  // Aba Dashboard: uma chamada só, com tudo já somado no banco. Apenas GET, nada escreve.
  router.get('/dashboard', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(painel.resumo(db, {
      periodo: String(req.query.periodo || '30'),
      desde: String(req.query.desde || ''),
      ate: String(req.query.ate || ''),
      campanha: req.query.campanha,
    }));
  });

  // ---------- Meta: leitura apenas ----------
  router.get('/meta/status', (req, res) => res.json(meta.status()));
  router.post('/meta/config', (req, res) => res.json(meta.salvarConfig(req.body || {})));
  router.post('/meta/disconnect', (req, res) => res.json(meta.desconectar()));
  router.post('/meta/test', async (req, res, next) => { try { res.json(await meta.testar()); } catch (error) { next(error); } });
  router.post('/meta/sync', async (req, res, next) => {
    try { res.json(await sincronizar(db, meta, { dias: Math.min(90, Math.max(1, Number(req.body?.dias) || 30)) })); }
    catch (error) { next(error); }
  });

  router.get('/products', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ items: catalogo.listarProdutos(db) }); });
  router.post('/products', (req, res) => res.status(201).json(catalogo.criarProduto(db, req.body || {})));
  router.get('/products/:id', (req, res) => res.json(catalogo.obterProduto(db, req.params.id)));
  router.patch('/products/:id', (req, res) => res.json(catalogo.atualizarProduto(db, req.params.id, req.body || {})));
  router.delete('/products/:id', (req, res) => {
    const p = catalogo.obterProduto(db, req.params.id);
    const r = catalogo.removerProduto(db, p.id);
    fs.rmSync(path.join(produtosDir, p.sku), { recursive: true, force: true });
    res.json(r);
  });

  // Envio da foto: o original é guardado e a versão quadrada é gerada pelo ffmpeg.
  router.post('/products/:id/image', upload.single('image'), async (req, res, next) => {
    const temporario = req.file?.path;
    try {
      const p = catalogo.obterProduto(db, req.params.id);
      if (!temporario) { const e = new Error('Escolha uma imagem.'); e.status = 400; throw e; }
      const resultado = await prepararImagem(temporario, path.join(produtosDir, p.sku));
      res.json(catalogo.salvarImagens(db, p.id, resultado, relativo));
    } catch (error) { next(error); }
    finally { if (temporario) fs.rmSync(temporario, { force: true }); }
  });

  router.post('/backup', async (req, res, next) => {
    try { res.json({ arquivo: relativo(await backup(db, path.join(dataDir, 'backup'))) }); } catch (error) { next(error); }
  });

  // Imagens do catálogo, servidas só de dentro da pasta de produtos.
  router.use('/media', express.static(produtosDir, { dotfiles: 'deny', index: false }));

  router.use((error, req, res, next) => {
    const status = error instanceof multer.MulterError ? 400 : error.status || 500;
    res.status(status).json({ error: status < 500 ? error.message : 'Não foi possível concluir. Tente novamente.' });
  });

  // O Windows mantém o arquivo do banco travado enquanto ele estiver aberto; quem
  // encerra o processo (ou o teste) precisa poder fechar.
  router.fechar = () => { try { db.close(); } catch {} };
  return router;
}
