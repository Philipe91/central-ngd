// Tela do módulo Mídia Paga. Isolada do módulo de vídeos: só conversa com /api/ads.
//
// Importada por: public/app.js, que a registra como a página "Mídia paga".
// API pública: adsPage(). Consome /api/ads/status, /api/ads/products e
// /api/ads/products, /api/ads/campaigns, /api/ads/leads. Não lê o módulo de vídeos.
// Etapas 1 e 2: catálogo, imagens, campanhas com código de referência e funil de leads.
// Nenhuma rota escreve em plataforma de anúncio.
import { paint } from './charts.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = cents => (cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const $ = s => document.querySelector(s);

let dados = { status: null, produtos: [], campanhas: [], leads: [], rotulos: {}, estagios: [], carregando: true, erro: '' };
let ligado = false;
let formAberto = false;
let formLead = false;
let formCampanha = false;
let aba = 'catalogo';

async function api(url, options) {
  const r = await fetch(url, options);
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir.');
  return corpo;
}

async function carregar() {
  try {
    const q = new URLSearchParams({ site: 'https://nucleografico.com.br/loja/', whatsapp: '61996490102' });
    const [status, lista, camp, leads] = await Promise.all([
      api('/api/ads/status'), api('/api/ads/products'), api('/api/ads/campaigns?' + q), api('/api/ads/leads'),
    ]);
    dados = { status, produtos: lista.items, campanhas: camp.items, leads: leads.items, rotulos: leads.rotulos, estagios: leads.estagios, carregando: false, erro: '' };
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
    ['Leads registrados', s.leads ?? 0, (s.funil?.ngd?.vendas ?? 0) + ' viraram venda', '#885af8'],
  ];
  return `<div class="setup-banner">${iconeInfo()}<div><strong>Somente leitura: este módulo não gasta dinheiro</strong>
      <p>O painel não consegue criar, pausar nem alterar campanha, e o código que faria isso não existe.
      Aqui você organiza os produtos, gera as imagens quadradas, cria os links rastreados e registra os leads que chegam.</p></div></div>
    <div class="metrics">${cards.map(([titulo, valor, nota, cor]) => `<div class="metric accent" data-accent="${cor}">
      <div class="metric-head">${titulo}</div><strong>${valor}</strong><small>${esc(nota)}</small></div>`).join('')}</div>
    <div class="toolbar"><div class="filters">${[['catalogo', 'Catálogo'], ['campanhas', 'Campanhas e links'], ['leads', 'Leads']]
      .map(([id, rotulo]) => `<button class="filter ${aba === id ? 'active' : ''}" data-ads-aba="${id}">${rotulo}</button>`).join('')}</div></div>
    ${aba === 'catalogo' ? painelCatalogo() : aba === 'campanhas' ? painelCampanhas() : painelLeads()}`;
}

function painelCampanhas() {
  const itens = dados.campanhas;
  const m = dados.status?.meta || {};
  return `<div class="setup-banner ${m.configurado ? '' : 'warn'}">${iconeInfo()}<div>
      <strong>${m.configurado ? `Meta conectada: ${esc(m.nome || m.conta)}` : 'Meta ainda não conectada'}</strong>
      <p>${m.configurado ? 'O painel só lê gasto e resultado. Ele não cria, não pausa e não altera campanha.'
        : 'Enquanto o token não for configurado, crie campanhas aqui mesmo para gerar os códigos e os links. Quando a conta for conectada, os números de gasto aparecem ao lado.'}
      ${m.erro ? `<span class="error"> ${esc(m.erro)}</span>` : ''}</p></div></div>
    <section class="panel"><div class="panel-head"><div><h2>Campanhas e links rastreados</h2>
        <p>Cada campanha tem um código. Ele vai no link e volta na conversa do WhatsApp</p></div>
      <div class="actions"><button class="button primary small" data-ads-nova-campanha>Nova campanha</button></div></div>
    ${formCampanha ? `<form class="ads-form" id="ads-camp-form"><div class="form-grid">
        <label>Nome da campanha<input name="name" required maxlength="120" placeholder="Ex.: PDV setembro"></label>
        <label>Objetivo <span class="optional">opcional</span><input name="objective" maxlength="60" placeholder="Orçamentos no WhatsApp"></label>
      </div><p class="error" id="ads-camp-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="button secondary small" data-ads-cancelar-campanha>Cancelar</button><button class="button primary small">Criar campanha</button></div></form>` : ''}
    ${itens.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Campanha</th><th>Gasto</th><th>Leads plataforma</th><th>Leads NGD</th><th>Vendas</th><th>Links</th></tr></thead><tbody>
      ${itens.map(c => `<tr><td><strong>${esc(c.ref_code || '—')}</strong></td><td>${esc(c.name)}</td>
        <td>${c.gasto_cents ? brl(c.gasto_cents) : '—'}</td><td>${c.leads_plataforma || '—'}</td>
        <td>${c.leads || 0}</td><td>${c.vendas || 0}${c.receita_cents ? ` · ${brl(c.receita_cents)}` : ''}</td>
        <td>${c.links?.whatsapp ? `<button class="button secondary small" data-ads-copiar="${esc(c.links.whatsapp)}">Copiar WhatsApp</button>` : ''}
            ${c.links?.site ? `<button class="button secondary small" data-ads-copiar="${esc(c.links.site)}">Copiar link do site</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><h3>Nenhuma campanha ainda</h3><p>Crie uma campanha para gerar o código de referência e os links que identificam de onde o cliente veio.</p><button class="button primary" data-ads-nova-campanha>Criar a primeira</button></div>`}
    </section>`;
}

function painelLeads() {
  const f = dados.status?.funil || {};
  const custos = f.custos || {};
  const linha = (titulo, plataforma, ngd) => `<tr><td>${titulo}</td><td>${plataforma}</td><td><strong>${ngd}</strong></td></tr>`;
  return `<section class="panel"><div class="panel-head"><div><h2>As duas contas do mesmo jogo</h2>
      <p>O que a plataforma atribui e o que a NGD viu acontecer. Os dois números não se somam</p></div></div>
    <div class="table-wrap"><table class="table"><thead><tr><th></th><th>Diz a plataforma</th><th>Viu a NGD</th></tr></thead><tbody>
      ${linha('Leads', f.plataforma?.leads ?? 0, f.ngd?.leads ?? 0)}
      ${linha('Custo por lead', custos.cpl_plataforma != null ? brl(custos.cpl_plataforma) : '—', custos.cpl_ngd != null ? brl(custos.cpl_ngd) : '—')}
      ${linha('Custo por lead qualificado', '—', custos.cpql_ngd != null ? brl(custos.cpql_ngd) : '—')}
      ${linha('Vendas', '—', f.ngd?.vendas ?? 0)}
      ${linha('Receita confirmada', '—', brl(f.ngd?.receita_cents || 0))}
      ${linha('Investido', brl(f.plataforma?.gasto || 0), '—')}
    </tbody></table></div><p class="help-box">Traço significa que o dado não existe ou não pode ser calculado com segurança, e não zero.</p></section>
    <section class="panel"><div class="panel-head"><div><h2>Leads</h2><p>Quem chegou pelo anúncio e em que ponto da conversa está</p></div>
      <div class="actions"><button class="button primary small" data-ads-novo-lead>Registrar lead</button></div></div>
    ${formLead ? `<form class="ads-form" id="ads-lead-form"><div class="form-grid">
        <label>Nome do contato<input name="contact_name" maxlength="120" placeholder="Quem chamou"></label>
        <label>Telefone<input name="contact_phone" maxlength="40" placeholder="(61) 90000-0000"></label>
        <label>Código do anúncio <span class="optional">o [ref] que veio na mensagem</span><input name="ref_code" maxlength="20" placeholder="MP-001"></label>
        <label>Origem<select name="source"><option value="whatsapp">WhatsApp</option><option value="site">Site</option><option value="balcao">Balcão</option><option value="outro">Outro</option></select></label>
      </div><label>Observação<textarea name="notes" rows="2" maxlength="600" placeholder="O que a pessoa pediu."></textarea></label>
      <p class="error" id="ads-lead-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="button secondary small" data-ads-cancelar-lead>Cancelar</button><button class="button primary small">Salvar lead</button></div></form>` : ''}
    ${dados.leads.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Contato</th><th>Código</th><th>Campanha</th><th>Estágio</th><th>Valor</th><th></th></tr></thead><tbody>
      ${dados.leads.map(l => `<tr><td>${esc(l.contact_name || 'Sem nome')}<br><small>${esc(l.contact_phone || '')}</small></td>
        <td>${esc(l.ref_code || '—')}</td><td>${esc(l.campanha || '—')}</td>
        <td><select data-ads-estagio="${l.id}">${dados.estagios.map(e => `<option value="${e}" ${l.stage === e ? 'selected' : ''}>${esc(dados.rotulos[e] || e)}</option>`).join('')}</select></td>
        <td><input class="valor-lead" data-ads-valor="${l.id}" inputmode="decimal" placeholder="0,00" value="${l.won_cents ?? l.quoted_cents ? String(((l.won_cents ?? l.quoted_cents) / 100).toFixed(2)).replace('.', ',') : ''}"></td>
        <td><button class="icon-button" data-ads-remover-lead="${l.id}" title="Remover" aria-label="Remover lead">×</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><h3>Nenhum lead registrado</h3><p>Quando alguém chamar pelo anúncio, registre aqui com o código que veio na mensagem. É isso que liga a venda ao anúncio.</p><button class="button primary" data-ads-novo-lead>Registrar o primeiro</button></div>`}
    </section>`;
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
    if (d.adsAba) { aba = d.adsAba; formAberto = false; formLead = false; desenhar(); }
    if (alvo.hasAttribute('data-ads-novo-lead')) { formLead = true; desenhar(); $('#ads-lead-form')?.elements.contact_name.focus(); }
    if (alvo.hasAttribute('data-ads-cancelar-lead')) { formLead = false; desenhar(); }
    if (d.adsCopiar) {
      try { await navigator.clipboard.writeText(d.adsCopiar); aviso('Link copiado.'); }
      catch { aviso('Não consegui copiar. O link é: ' + d.adsCopiar); }
    }
    if (alvo.hasAttribute('data-ads-nova-campanha')) { formCampanha = true; desenhar(); $('#ads-camp-form')?.elements.name.focus(); }
    if (alvo.hasAttribute('data-ads-cancelar-campanha')) { formCampanha = false; desenhar(); }
    if (d.adsRemoverLead) {
      if (!confirm('Remover este lead e o histórico dele?')) return;
      try { await api('/api/ads/leads/' + d.adsRemoverLead, { method: 'DELETE' }); await carregar(); aviso('Lead removido.'); }
      catch (error) { aviso(error.message); }
    }
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

  // Estágio e valor ficam na própria linha: nada de caixa de diálogo do navegador,
  // que trava a página e atrapalha quem usa teclado.
  main.addEventListener('change', async e => {
    const id = e.target.dataset?.adsEstagio || e.target.dataset?.adsValor;
    if (!id) return;
    const linha = e.target.closest('tr');
    const stage = linha.querySelector('[data-ads-estagio]')?.value;
    const value = linha.querySelector('[data-ads-valor]')?.value || '';
    if (e.target.dataset.adsValor && !['orcamento', 'proposta', 'venda'].includes(stage)) return;
    try { await api(`/api/ads/leads/${id}/stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, value }) }); await carregar(); }
    catch (error) { aviso(error.message); await carregar(); }
  });

  main.addEventListener('submit', async e => {
    if (e.target.id === 'ads-camp-form') {
      e.preventDefault();
      const form = e.target;
      const botao = form.querySelector('button.primary');
      botao.disabled = true;
      try {
        const c = await api('/api/ads/campaigns/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        formCampanha = false;
        await carregar();
        aviso('Campanha criada com o código ' + c.ref_code + '. Use os links dela no anúncio.');
      } catch (error) { const p = $('#ads-camp-error'); if (p) p.textContent = error.message; botao.disabled = false; }
      return;
    }
    if (e.target.id === 'ads-lead-form') {
      e.preventDefault();
      const form = e.target;
      const botao = form.querySelector('button.primary');
      botao.disabled = true;
      try {
        await api('/api/ads/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        formLead = false;
        await carregar();
        aviso('Lead registrado.');
      } catch (error) { const p = $('#ads-lead-error'); if (p) p.textContent = error.message; botao.disabled = false; }
      return;
    }
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
