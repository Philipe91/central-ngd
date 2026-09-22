// Tela do módulo Mídia Paga. Isolada do módulo de vídeos: só conversa com /api/ads.
//
// Importada por: public/app.js, que a registra como a página "Mídia paga".
// API pública: adsPage(). Consome /api/ads/status, /api/ads/products e
// /api/ads/products/:id/image. Não lê o estado do módulo de vídeos.
// Etapa 1: catálogo e imagens. Nenhuma conta de anúncio é acessada.
import { paint } from './charts.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = cents => (cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const $ = s => document.querySelector(s);

let dados = { status: null, produtos: [], carregando: true, erro: '' };
let ligado = false;
let formAberto = false;

async function api(url, options) {
  const r = await fetch(url, options);
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir.');
  return corpo;
}

async function carregar() {
  try {
    const [status, lista] = await Promise.all([api('/api/ads/status'), api('/api/ads/products')]);
    dados = { status, produtos: lista.items, carregando: false, erro: '' };
  } catch (error) {
    dados = { ...dados, carregando: false, erro: error.message };
  }
  desenhar();
}

function desenhar() {
  const alvo = $('#ads-body');
  if (!alvo) return;
  alvo.innerHTML = corpo();
  paint(alvo);
}

/** Página completa. app.js chama isto de forma síncrona; os dados chegam depois. */
export function adsPage() {
  if (!ligado) { ligar(); ligado = true; }
  dados.carregando = true;
  queueMicrotask(carregar);
  return `<div class="page-heading"><div><span class="eyebrow">MÍDIA PAGA</span><h1>Anúncios da NGD</h1>
      <p>Catálogo de produtos, imagens padronizadas e, nas próximas etapas, campanhas e resultados.</p></div></div>
    <div id="ads-body">${corpo()}</div>`;
}

function corpo() {
  if (dados.carregando) return `<section class="panel"><div class="empty compact"><p>Carregando…</p></div></section>`;
  if (dados.erro) return `<section class="panel"><div class="empty compact"><h3>Não foi possível abrir o módulo</h3><p>${esc(dados.erro)}</p></div></section>`;
  const s = dados.status || {};
  const cards = [
    ['Produtos no catálogo', s.total ?? 0, 'ativos: ' + (s.ativos ?? 0), '#109cf1'],
    ['Com imagem pronta', s.comImagem ?? 0, (s.semImagem ?? 0) + ' sem imagem', '#2ed47a'],
    ['Contas de anúncio', s.contas ?? 0, 'nenhuma conectada ainda', '#ffb946'],
    ['Leads registrados', s.leads ?? 0, 'começa na etapa 2', '#885af8'],
  ];
  return `<div class="setup-banner">${iconeInfo()}<div><strong>Etapa 1: só o catálogo, nada de dinheiro</strong>
      <p>Este módulo ainda não acessa nenhuma conta de anúncios e não consegue criar, pausar ou alterar campanha.
      Aqui você organiza os produtos e gera as imagens quadradas para usar no Gerenciador de Anúncios.</p></div></div>
    <div class="metrics">${cards.map(([titulo, valor, nota, cor]) => `<div class="metric accent" data-accent="${cor}">
      <div class="metric-head">${titulo}</div><strong>${valor}</strong><small>${esc(nota)}</small></div>`).join('')}</div>
    ${painelCatalogo()}`;
}

function painelCatalogo() {
  const itens = dados.produtos;
  return `<section class="panel"><div class="panel-head"><div><h2>Catálogo de produtos</h2>
      <p>Cada produto vira um anúncio com imagem 1080x1080 e fundo branco</p></div>
      <div class="actions"><button class="button primary small" data-ads-novo>Novo produto</button></div></div>
    ${formAberto ? formulario() : ''}
    ${itens.length ? `<div class="content-grid ads-grid">${itens.map(cartao).join('')}</div>`
      : `<div class="empty"><h3>Nenhum produto ainda</h3><p>Comece pelos cinco ou dez produtos que a loja mais quer vender. Depois envie uma foto de cada um.</p>
         <button class="button primary" data-ads-novo>Cadastrar o primeiro</button></div>`}
  </section>`;
}

function formulario() {
  return `<form class="ads-form" id="ads-form">
    <div class="form-grid">
      <label>Nome do produto<input name="name" required maxlength="120" placeholder="Ex.: Display de chão em poliondas"></label>
      <label>Código <span class="optional">opcional, gerado do nome</span><input name="sku" maxlength="40" placeholder="DISPLAY-CHAO"></label>
      <label>Categoria<input name="category" maxlength="60" placeholder="PDV, Eventos, Agro…"></label>
      <label>Preço de referência <span class="optional">opcional</span><input name="price" inputmode="decimal" placeholder="0,00"></label>
    </div>
    <label>Descrição curta<textarea name="description" rows="2" maxlength="600" placeholder="Uma frase que explica para que serve e para quem."></textarea></label>
    <p class="error" id="ads-form-error" role="alert"></p>
    <div class="dialog-actions"><button type="button" class="button secondary small" data-ads-cancelar>Cancelar</button><button class="button primary small">Salvar produto</button></div>
  </form>`;
}

function cartao(p) {
  const quadrada = p.images?.find(i => i.kind === 'quadrada');
  const thumb = quadrada ? `<img class="card-thumb" src="/api/ads/media/${encodeURIComponent(p.sku)}/quadrada.jpg?v=${encodeURIComponent(p.updated_at)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="card-thumb placeholder"><span>sem imagem</span></div>`;
  return `<article class="content-card">${thumb}<div class="card-body">
      <div class="card-badges"><span class="badge ${p.status === 'ativo' ? 'green' : ''}">${p.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
        ${p.category ? `<span class="badge">${esc(p.category)}</span>` : ''}
        ${quadrada ? `<span class="badge blue">${quadrada.width}x${quadrada.height}</span>` : ''}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.description || 'Sem descrição.')}</p>
      <div class="card-meta"><span>${esc(p.sku)}</span>${p.price_cents != null ? `<span>· ${brl(p.price_cents)}</span>` : ''}</div>
      <div class="card-bottom"><div class="actions small">
        <button class="button secondary small" data-ads-imagem="${p.id}">${quadrada ? 'Trocar imagem' : 'Enviar imagem'}</button>
        <button class="button secondary small" data-ads-status="${p.id}" data-valor="${p.status === 'ativo' ? 'inativo' : 'ativo'}">${p.status === 'ativo' ? 'Desativar' : 'Ativar'}</button>
        <button class="icon-button" data-ads-remover="${p.id}" title="Remover" aria-label="Remover produto">×</button>
      </div></div></div></article>`;
}

const iconeInfo = () => '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></svg>';

function ligar() {
  const main = document.querySelector('main');
  const arquivo = document.createElement('input');
  arquivo.type = 'file';
  arquivo.accept = 'image/jpeg,image/png,image/webp';
  arquivo.hidden = true;
  document.body.appendChild(arquivo);
  let produtoAlvo = null;

  arquivo.addEventListener('change', async () => {
    const file = arquivo.files?.[0];
    if (!file || !produtoAlvo) return;
    const body = new FormData();
    body.append('image', file);
    aviso('Preparando a imagem…');
    try {
      await api(`/api/ads/products/${produtoAlvo}/image`, { method: 'POST', body });
      await carregar();
      aviso('Imagem preparada em 1080x1080. O arquivo original foi guardado.');
    } catch (error) { aviso(error.message); }
    finally { arquivo.value = ''; produtoAlvo = null; }
  });

  main.addEventListener('click', async e => {
    const alvo = e.target.closest('button');
    if (!alvo || !document.getElementById('ads-body')) return;
    const d = alvo.dataset;
    if (alvo.hasAttribute('data-ads-novo')) { formAberto = true; desenhar(); $('#ads-form')?.elements.name.focus(); }
    if (alvo.hasAttribute('data-ads-cancelar')) { formAberto = false; desenhar(); }
    if (d.adsImagem) { produtoAlvo = d.adsImagem; arquivo.click(); }
    if (d.adsStatus) {
      try { await api('/api/ads/products/' + d.adsStatus, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: d.valor }) }); await carregar(); }
      catch (error) { aviso(error.message); }
    }
    if (d.adsRemover) {
      const p = dados.produtos.find(x => String(x.id) === d.adsRemover);
      if (!confirm(`Remover "${p?.name}" e a imagem dele deste computador?`)) return;
      try { await api('/api/ads/products/' + d.adsRemover, { method: 'DELETE' }); await carregar(); aviso('Produto removido.'); }
      catch (error) { aviso(error.message); }
    }
  });

  main.addEventListener('submit', async e => {
    if (e.target.id !== 'ads-form') return;
    e.preventDefault();
    const form = e.target;
    const botao = form.querySelector('button.primary');
    botao.disabled = true;
    try {
      await api('/api/ads/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      formAberto = false;
      await carregar();
      aviso('Produto cadastrado. Agora envie a foto dele.');
    } catch (error) { const p = $('#ads-form-error'); if (p) p.textContent = error.message; botao.disabled = false; }
  });
}

function aviso(mensagem) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = mensagem;
  toast.classList.add('show');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => toast.classList.remove('show'), 4000);
}
