// Tela do módulo Mídia Paga. Isolada do módulo de vídeos: só conversa com /api/ads.
//
// Importada por: public/app.js, que a registra como a página "Mídia paga".
// API pública: adsPage(). Consome /api/ads/status, /api/ads/products e
// /api/ads/products, /api/ads/campaigns, /api/ads/leads. Não lê o módulo de vídeos.
// Etapas 1 e 2: catálogo, imagens, campanhas com código de referência e funil de leads.
// Nenhuma rota escreve em plataforma de anúncio.
//
// Visual: componentes do SaaS Dashboard UI Kit (public/ui/kit.css, prefixo k-).
// A lógica em ligar() depende de: data-ads-*, os ids #ads-*, os name dos campos,
// a classe "primary" no botão de enviar de cada formulário e o <tr> em volta de
// estágio e valor do lead. Trocar a marcação sem manter isso quebra a tela.
import { wire } from './ui/charts.js';
import { icon } from './ui/icons.js';
import { painelDashboard, abrirDashboard, dashboardEvento } from './ads-dashboard.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = cents => (cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (parte, todo) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
const $ = s => document.querySelector(s);

let dados = { status: null, produtos: [], campanhas: [], leads: [], rotulos: {}, estagios: [], carregando: true, erro: '' };
let ligado = false;
let formAberto = false;
let formLead = false;
let formCampanha = false;
let aba = 'dashboard';

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
  if (aba === 'dashboard') abrirDashboard(desenhar);   // o resumo vem somado do servidor, em chamada própria
  desenhar();
}

function desenhar() {
  const alvo = $('#ads-body');
  if (!alvo) return;
  alvo.innerHTML = corpo();
  wire(alvo);
}

/** Página completa. app.js chama isto de forma síncrona; os dados chegam depois. */
export function adsPage() {
  if (!ligado) { ligar(); ligado = true; }
  dados.carregando = true;
  queueMicrotask(carregar);
  return `<div class="k-scope" id="ads-body">${corpo()}</div>`;
}

const ACOES = {
  dashboard: '',
  catalogo: `<button class="k-btn primary" type="button" data-ads-novo>${icon('plus', { size: 16 })} Novo produto</button>`,
  campanhas: `<button class="k-btn primary" type="button" data-ads-nova-campanha>${icon('plus', { size: 16 })} Nova campanha</button>`,
  leads: `<button class="k-btn primary" type="button" data-ads-novo-lead>${icon('plus', { size: 16 })} Registrar lead</button>`,
};

function corpo() {
  if (dados.carregando) return `<section class="k-card"><div class="k-empty"><span>Carregando…</span></div></section>`;
  if (dados.erro) return `<section class="k-card"><div class="k-empty">${icon('warning', { size: 32 })}<strong>Não foi possível abrir o módulo</strong><span>${esc(dados.erro)}</span></div></section>`;
  const s = dados.status || {};
  const total = s.total ?? 0, leads = s.leads ?? 0, qualificados = s.funil?.ngd?.qualificados ?? 0;
  const conectada = !!s.meta?.configurado;
  // [rótulo, ícone, número, barra (0–100 ou null), cor da barra, nota]
  const kpis = [
    ['Produtos no catálogo', 'grid', total, pct(s.ativos ?? 0, total), '#109bf0', `${s.ativos ?? 0} ativos`],
    ['Com imagem pronta', 'image', s.comImagem ?? 0, pct(s.comImagem ?? 0, total), '#2ed47a', `${s.semImagem ?? 0} sem imagem`],
    ['Contas de anúncio', 'megaphone', s.contas ?? 0, null, '', conectada ? `Meta: ${s.meta?.nome || s.meta?.conta || 'conectada'}` : 'falta o token da Meta'],
    ['Leads registrados', 'users', leads, pct(qualificados, leads), '#885af8', `${qualificados} ${qualificados === 1 ? 'qualificado' : 'qualificados'}`],
  ];
  const abas = [['dashboard', 'Dashboard', null], ['catalogo', 'Catálogo', dados.produtos.length], ['campanhas', 'Campanhas e links', dados.campanhas.length], ['leads', 'Leads', dados.leads.length]];
  // Na Dashboard esses números operacionais saem de cena: lá o espaço principal é do
  // desempenho dos anúncios, não da arrumação do catálogo.
  return `${aba === 'dashboard' ? '' : `<section class="k-card k-kpis" aria-label="Resumo da mídia paga">${kpis.map(([rotulo, ic, valor, barra, cor, nota]) => `
      <div class="k-kpi"><span class="k-kpi-label">${icon(ic, { size: 16 })}${rotulo}</span>
        <strong class="k-num">${valor}</strong>
        ${barra === null ? `<span class="k-badge ${conectada ? 'ok' : 'neutral'}">${conectada ? 'Conectada' : 'Não conectada'}</span>`
          : `<div class="k-progress sm" role="img" aria-label="${barra}%"><i data-w="${barra}" data-c="${cor}"></i></div>`}
        <small>${esc(nota)}</small></div>`).join('')}
    </section>`}
    <div class="k-notice">${icon('info', { size: 20 })}<p><strong>Somente leitura: este módulo não gasta dinheiro.</strong> O painel não cria, não pausa e não altera campanha, e o código que faria isso não existe. Aqui você organiza os produtos, gera as imagens quadradas, cria os links rastreados e registra os leads.</p></div>
    <div class="k-pagebar"><div class="k-tabs" role="tablist" aria-label="Seções da mídia paga">${abas.map(([id, rotulo, n]) =>
      `<button type="button" role="tab" aria-selected="${aba === id}" data-ads-aba="${id}">${rotulo}${n === null ? '' : `<span class="k-tab-count">${n}</span>`}</button>`).join('')}</div>${ACOES[aba]}</div>
    ${aba === 'dashboard' ? painelDashboard() : aba === 'catalogo' ? painelCatalogo() : aba === 'campanhas' ? painelCampanhas() : painelLeads()}`;
}

const campo = (rotulo, input, dica = '') => `<label class="k-field"><span>${rotulo}</span>${input}${dica ? `<small class="k-hint">${dica}</small>` : ''}</label>`;
const acoesForm = (cancelar, enviar) => `<div class="k-form-foot"><button type="button" class="k-btn secondary sm" ${cancelar}>Cancelar</button><button class="k-btn primary sm">${enviar}</button></div>`;

function painelCampanhas() {
  const itens = dados.campanhas;
  const m = dados.status?.meta || {};
  return `<div class="k-notice ${m.configurado ? '' : 'warn'}">${icon(m.configurado ? 'check' : 'warning', { size: 20 })}<p>
      <strong>${m.configurado ? `Meta conectada: ${esc(m.nome || m.conta)}.` : 'Meta ainda não conectada.'}</strong>
      ${m.configurado ? 'O painel só lê gasto e resultado. Ele não cria, não pausa e não altera campanha.'
        : 'Enquanto o token não for configurado, crie campanhas aqui mesmo para gerar os códigos e os links. Quando a conta for conectada, os números de gasto aparecem ao lado.'}
      ${m.erro ? `<span class="k-error-text"> ${esc(m.erro)}</span>` : ''}</p></div>
    <section class="k-card">
      <div class="k-card-head"><h2 class="k-card-title">Campanhas e links rastreados</h2><span class="k-muted k-body2">O código vai no link e volta na conversa do WhatsApp</span></div>
      ${formCampanha ? `<form class="k-form" id="ads-camp-form"><div class="k-form-grid">
          ${campo('Nome da campanha', '<input name="name" required maxlength="120" placeholder="Ex.: PDV setembro">')}
          ${campo('Objetivo (opcional)', '<input name="objective" maxlength="60" placeholder="Orçamentos no WhatsApp">')}
        </div><p class="k-error-text" id="ads-camp-error" role="alert"></p>${acoesForm('data-ads-cancelar-campanha', 'Criar campanha')}</form>` : ''}
      ${itens.length ? `<div class="k-table-scroll"><table class="k-table"><thead><tr><th>Código</th><th>Campanha</th><th class="t-right">Gasto</th><th class="t-right">Leads plataforma</th><th class="t-right">Leads NGD</th><th class="t-right">Qualificados</th><th class="t-right">Orçamentos</th><th>Links</th></tr></thead><tbody>
        ${itens.map(c => `<tr><td><span class="k-code">${esc(c.ref_code || '—')}</span></td><td class="t-title">${esc(c.name)}</td>
          <td class="t-right k-num">${c.gasto_cents ? brl(c.gasto_cents) : '—'}</td><td class="t-right k-num">${c.leads_plataforma || '—'}</td>
          <td class="t-right k-num">${c.leads || 0}</td><td class="t-right k-num">${c.qualificados || 0}</td><td class="t-right k-num">${c.orcamentos || 0}</td>
          <td><div class="k-row-tight">${c.links?.whatsapp ? `<button class="k-btn tertiary sm" type="button" data-ads-copiar="${esc(c.links.whatsapp)}">${icon('link', { size: 16 })} WhatsApp</button>` : ''}
              ${c.links?.site ? `<button class="k-btn tertiary sm" type="button" data-ads-copiar="${esc(c.links.site)}">${icon('link', { size: 16 })} Site</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="k-empty">${icon('megaphone', { size: 32 })}<strong>Nenhuma campanha ainda</strong><span>Crie uma campanha para gerar o código de referência e os links que identificam de onde o cliente veio.</span><button class="k-btn primary sm" type="button" data-ads-nova-campanha>Criar a primeira</button></div>`}
    </section>`;
}

function painelLeads() {
  const f = dados.status?.funil || {};
  const custos = f.custos || {};
  const linha = (titulo, plataforma, ngd) => `<tr><td>${titulo}</td><td class="t-right k-num">${plataforma}</td><td class="t-right k-num"><strong>${ngd}</strong></td></tr>`;
  return `<div class="k-grid cols-leads">
    <section class="k-card">
      <div class="k-card-head"><h2 class="k-card-title">As duas contas do mesmo jogo</h2></div>
      <div class="k-card-body tight"><p class="k-muted k-body2 k-m0">O que a plataforma atribui e o que a NGD viu acontecer. Os dois números não se somam.</p></div>
      <table class="k-table compact"><thead><tr><th></th><th class="t-right">Diz a plataforma</th><th class="t-right">Viu a NGD</th></tr></thead><tbody>
        ${linha('Leads', f.plataforma?.leads ?? 0, f.ngd?.leads ?? 0)}
        ${linha('Custo por lead', custos.cpl_plataforma != null ? brl(custos.cpl_plataforma) : '—', custos.cpl_ngd != null ? brl(custos.cpl_ngd) : '—')}
        ${linha('Leads qualificados', '—', f.ngd?.qualificados ?? 0)}
        ${linha('Custo por lead qualificado', '—', custos.cpql_ngd != null ? brl(custos.cpql_ngd) : '—')}
        ${linha('Pedidos de orçamento', '—', f.ngd?.orcamentos ?? 0)}
        ${linha('Custo por orçamento', '—', custos.cpo_ngd != null ? brl(custos.cpo_ngd) : '—')}
        ${linha('Propostas enviadas', '—', f.ngd?.propostas ?? 0)}
        ${linha('Investido em anúncio', brl(f.plataforma?.gasto || 0), '—')}
      </tbody></table>
      <p class="k-note k-pad">Traço significa que o dado não existe ou não pode ser calculado com segurança, e não zero.</p>
    </section>
    <section class="k-card">
      <div class="k-card-head"><h2 class="k-card-title">Leads</h2><span class="k-muted k-body2">Quem chegou pelo anúncio e em que ponto da conversa está</span></div>
      ${formLead ? `<form class="k-form" id="ads-lead-form"><div class="k-form-grid">
          ${campo('Nome do contato', '<input name="contact_name" maxlength="120" placeholder="Quem chamou">')}
          ${campo('Telefone', '<input name="contact_phone" maxlength="40" placeholder="(61) 90000-0000">')}
          ${campo('Código do anúncio', '<input name="ref_code" maxlength="20" placeholder="MP-001">', 'O [ref] que veio na mensagem')}
          ${campo('Origem', '<select name="source"><option value="whatsapp">WhatsApp</option><option value="site">Site</option><option value="balcao">Balcão</option><option value="outro">Outro</option></select>')}
          <div class="k-span-2">${campo('Observação', '<textarea name="notes" rows="2" maxlength="600" placeholder="O que a pessoa pediu."></textarea>')}</div>
        </div><p class="k-error-text" id="ads-lead-error" role="alert"></p>${acoesForm('data-ads-cancelar-lead', 'Salvar lead')}</form>` : ''}
      ${dados.leads.length ? `<div class="k-table-scroll"><table class="k-table"><thead><tr><th>Contato</th><th>Código</th><th>Campanha</th><th>Estágio</th><th></th></tr></thead><tbody>
        ${dados.leads.map(l => `<tr><td><span class="t-title">${esc(l.contact_name || 'Sem nome')}</span><br><small>${esc(l.contact_phone || '')}</small></td>
          <td><span class="k-code">${esc(l.ref_code || '—')}</span></td><td>${esc(l.campanha || '—')}</td>
          <td><select class="k-select" aria-label="Estágio" data-ads-estagio="${l.id}">${dados.estagios.map(e => `<option value="${e}" ${l.stage === e ? 'selected' : ''}>${esc(dados.rotulos[e] || e)}</option>`).join('')}</select></td>
          <td class="t-right"><button class="k-iconbtn" type="button" data-ads-remover-lead="${l.id}" title="Remover" aria-label="Remover lead">${icon('delete', { size: 16 })}</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="k-empty">${icon('users', { size: 32 })}<strong>Nenhum lead registrado</strong><span>Quando alguém chamar pelo anúncio, registre aqui com o código que veio na mensagem. É isso que liga a venda ao anúncio.</span><button class="k-btn primary sm" type="button" data-ads-novo-lead>Registrar o primeiro</button></div>`}
    </section></div>`;
}

function painelCatalogo() {
  const itens = dados.produtos;
  const ativos = itens.filter(p => p.status === 'ativo').length;
  return `<section class="k-card">
    <div class="k-card-head"><h2 class="k-card-title">Catálogo de produtos</h2><span class="k-muted k-body2">${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'} · ${ativos} ${ativos === 1 ? 'ativo' : 'ativos'} · imagens 1080×1080 em fundo branco</span></div>
    ${formAberto ? formulario() : ''}
    ${itens.length ? `<div class="k-card-body"><div class="k-products">${itens.map(cartao).join('')}</div></div>`
      : `<div class="k-empty">${icon('image', { size: 32 })}<strong>Nenhum produto ainda</strong><span>Comece pelos cinco ou dez produtos que a loja mais quer vender. Depois envie uma foto de cada um.</span><button class="k-btn primary sm" type="button" data-ads-novo>Cadastrar o primeiro</button></div>`}
  </section>`;
}

function formulario() {
  return `<form class="k-form" id="ads-form">
    <div class="k-form-grid">
      ${campo('Nome do produto', '<input name="name" required maxlength="120" placeholder="Ex.: Display de chão em poliondas">')}
      ${campo('Código (opcional)', '<input name="sku" maxlength="40" placeholder="DISPLAY-CHAO">', 'Se ficar vazio, é gerado a partir do nome')}
      ${campo('Categoria', '<input name="category" maxlength="60" placeholder="PDV, Eventos, Agro…">')}
      ${campo('Preço de referência (opcional)', '<input name="price" inputmode="decimal" placeholder="0,00">')}
      <div class="k-span-2">${campo('Descrição curta', '<textarea name="description" rows="2" maxlength="600" placeholder="Uma frase que explica para que serve e para quem."></textarea>')}</div>
    </div>
    <p class="k-error-text" id="ads-form-error" role="alert"></p>
    ${acoesForm('data-ads-cancelar', 'Salvar produto')}
  </form>`;
}

function cartao(p) {
  const quadrada = p.images?.find(i => i.kind === 'quadrada');
  const ativo = p.status === 'ativo';
  const midia = quadrada
    ? `<img src="/api/ads/media/${encodeURIComponent(p.sku)}/quadrada.jpg?v=${encodeURIComponent(p.updated_at)}" alt="${esc(p.name)}" loading="lazy" width="${quadrada.width}" height="${quadrada.height}"><span class="k-product-size">${quadrada.width}×${quadrada.height}</span>`
    : `<div class="k-product-empty">${icon('image', { size: 28 })}<span>Sem imagem</span></div>`;
  return `<article class="k-product${ativo ? '' : ' off'}">
    <div class="k-product-media">${midia}</div>
    <div class="k-product-body">
      <div class="k-product-top"><span class="k-product-cat">${esc(p.category || 'Sem categoria')}</span><span class="k-badge ${ativo ? 'ok' : 'neutral'}">${ativo ? 'Ativo' : 'Inativo'}</span></div>
      <h3 class="k-product-name">${esc(p.name)}</h3>
      <p class="k-product-desc">${esc(p.description || 'Sem descrição.')}</p>
      <div class="k-product-meta"><strong class="k-num">${p.price_cents != null ? brl(p.price_cents) : 'Sem preço'}</strong><span class="k-code" title="${esc(p.sku)}">${esc(p.sku)}</span></div>
    </div>
    <div class="k-product-foot">
      <button class="k-btn tertiary sm" type="button" data-ads-imagem="${p.id}">${icon('upload', { size: 16 })} ${quadrada ? 'Trocar imagem' : 'Enviar imagem'}</button>
      <span class="k-grow"></span>
      <button class="k-iconbtn" type="button" data-ads-status="${p.id}" data-valor="${ativo ? 'inativo' : 'ativo'}" title="${ativo ? 'Desativar' : 'Ativar'}" aria-label="${ativo ? 'Desativar' : 'Ativar'} ${esc(p.name)}">${icon(ativo ? 'eye' : 'play', { size: 16 })}</button>
      <button class="k-iconbtn" type="button" data-ads-remover="${p.id}" title="Remover" aria-label="Remover ${esc(p.name)}">${icon('delete', { size: 16 })}</button>
    </div>
  </article>`;
}

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
    if (dashboardEvento(alvo, desenhar)) return;
    if (d.adsAba) {
      aba = d.adsAba; formAberto = false; formLead = false; formCampanha = false;
      if (aba === 'dashboard') abrirDashboard(desenhar);
      desenhar();
    }
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

  // O estágio muda na própria linha: nada de caixa de diálogo do navegador, que trava
  // a página e atrapalha quem usa teclado. Não há campo de dinheiro aqui: o anúncio é
  // medido por lead, qualificação e orçamento, e o valor fechado é assunto do comercial.
  main.addEventListener('change', async e => {
    if (dashboardEvento(e.target, desenhar)) return;
    const id = e.target.dataset?.adsEstagio;
    if (!id) return;
    const stage = e.target.value;
    try { await api(`/api/ads/leads/${id}/stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }) }); await carregar(); }
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
