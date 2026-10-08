/* Biblioteca de conteúdos: grade/lista de mídia no visual da Central (mesma família de Resultados).
   Só apresentação: os status vêm dos mapas STATUS/POST/MEDIA do app.js e as ações continuam
   nos mesmos data-* (data-publish, data-edit, data-delete, data-prepare, data-manual, data-filter),
   tratados pelo app.js. Nada aqui altera status, datas ou regras de publicação. */
import { icon } from './ui/icons.js';
import { marcaRede } from './ui/redes.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const FILTROS = [['all', 'Todos'], ['draft', 'Rascunhos'], ['planned', 'Planejados'], ['published', 'Publicados'], ['attention', 'Com falha']];
export const ORDENS = [['recentes', 'Mais recentes'], ['antigos', 'Mais antigos'], ['agenda', 'Data de publicação'], ['titulo', 'Título (A–Z)']];
const TIPO = { video: 'Vídeo', image: 'Imagem', carousel: 'Carrossel' };

// Preferências de exibição (ordem e grade/lista): só deste navegador, sem afetar dados.
export const opcoes = { ordem: 'recentes', vista: 'grade' };
try { Object.assign(opcoes, JSON.parse(globalThis.localStorage?.getItem('ngd.biblioteca') || '{}')); } catch { /* sem armazenamento */ }
const guardar = () => { try { globalThis.localStorage?.setItem('ngd.biblioteca', JSON.stringify(opcoes)); } catch { /* sem armazenamento */ } };

export function contarStatus(contents) {
  const n = { all: contents.length, draft: 0, planned: 0, published: 0, attention: 0 };
  for (const c of contents) if (c.status in n) n[c.status] += 1;
  return n;
}

const tempo = v => Date.parse(v) || 0;
export function filtrarOrdenar(contents, { filtro = 'all', busca = '', ordem = 'recentes' } = {}) {
  const q = busca.toLocaleLowerCase();
  const lista = contents.filter(c => (filtro === 'all' || c.status === filtro) && c.title.toLocaleLowerCase().includes(q));
  const porOrdem = {
    recentes: (a, b) => tempo(b.createdAt) - tempo(a.createdAt),
    antigos: (a, b) => tempo(a.createdAt) - tempo(b.createdAt),
    // Com data primeiro, da mais próxima para a mais distante; sem data no fim.
    agenda: (a, b) => (a.scheduledAt ? 0 : 1) - (b.scheduledAt ? 0 : 1) || tempo(a.scheduledAt) - tempo(b.scheduledAt),
    titulo: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
  };
  return lista.slice().sort(porOrdem[ordem] || porOrdem.recentes);
}

export const duracao = s => { s = Math.round(Number(s) || 0); return s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; };

function preview(c, ui) {
  const tipo = c.kind === 'carousel' ? `Carrossel · ${c.images?.length || 0} fotos` : TIPO[c.kind] || 'Vídeo';
  const estado = c.media?.state;
  const preparando = ['importing', 'preparing', 'pending'].includes(estado);
  const thumb = c.media?.thumb ? `/media/prepared/${encodeURIComponent(c.media.thumb)}` : '';
  let midia;
  if (thumb) midia = `<img class="lib-blur" src="${thumb}" alt="" aria-hidden="true" loading="lazy"><img class="lib-img" src="${thumb}" alt="" loading="lazy">`;
  else if (c.file && (c.kind || 'video') === 'video' && !preparando) midia = `<video class="lib-img" controls preload="metadata" src="/media/${encodeURIComponent(c.file)}"></video>`;
  else if (preparando) midia = '<span class="lib-skeleton" aria-hidden="true"></span>';
  else midia = `<span class="lib-sem">${icon((c.kind || 'video') === 'video' ? 'video' : 'image', { size: 26 })}<small>Sem miniatura</small></span>`;
  const d = (c.kind || 'video') === 'video' ? duracao(c.media?.duration) : '';
  const [rotulo] = ui.MEDIA[estado] || ui.MEDIA.pending;
  return `<div class="lib-preview">${midia}
    <span class="lib-tipo">${icon(c.kind === 'carousel' || c.kind === 'image' ? 'image' : 'video', { size: 13 })}${esc(tipo)}${c.source?.type === 'instagram' ? ' · Importado' : ''}</span>
    ${preparando ? `<span class="lib-preparo"><i aria-hidden="true"></i>${esc(rotulo)}</span>` : ''}
    ${d ? `<span class="lib-dur">${icon('play', { size: 11 })}${d}</span>` : ''}</div>`;
}

function chipRede(c, n, ui) {
  const p = c.posts?.[n] || { status: 'pending' };
  const [label, cls] = ui.POST[p.status] || ui.POST.pending;
  const inner = `${marcaRede(n, 16)}<span>${esc(ui.networks[n]?.name || n)}</span><em class="${cls}">${label}</em>`;
  return p.url
    ? `<a class="lib-chip" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.error || 'Abrir publicação')}">${inner}${icon('link', { size: 12 })}</a>`
    : `<span class="lib-chip" title="${esc(p.error || '')}">${inner}</span>`;
}

export function cardBiblioteca(c, ui) {
  const ready = c.media?.state === 'ready';
  // Mesmas regras do cartão anterior: publicar só com mídia pronta e rede automática pendente/falha.
  const canPublish = ready && c.channels.some(n => ui.AUTOMATED.includes(n) && ['pending', 'failed'].includes(c.posts?.[n]?.status || 'pending'));
  const manualNets = c.channels.filter(n => !ui.AUTOMATED.includes(n) && !['published', 'manual'].includes(c.posts?.[n]?.status));
  const podePreparar = c.media?.state === 'error' && (c.file || c.images?.length);
  const [stLabel, stCls] = ui.STATUS[c.status] || ui.STATUS.draft;
  const [mdLabel, mdCls] = ui.MEDIA[c.media?.state] || ui.MEDIA.pending;

  // Ações de contexto na mesma prioridade de antes; a última fica visível, as outras vão para o menu ⋮.
  const contexto = [];
  if (podePreparar) contexto.push(['prepare', `data-prepare="${c.id}"`, icon('refresh', { size: 15 }) + 'Preparar de novo']);
  if (manualNets.length) contexto.push(['manual', `data-manual="${c.id}" data-network="${manualNets[0]}"`, 'Registrar ' + esc(ui.networks[manualNets[0]].name)]);
  if (canPublish) contexto.push(['publish', `data-publish="${c.id}"`, icon('send', { size: 15 }) + 'Publicar agora']);
  const topo = contexto.pop();
  const principal = topo ? `<button class="lib-btn${topo[0] === 'publish' ? ' primary' : ''}" ${topo[1]}>${topo[2]}</button>` : '';
  const menu = [
    ...contexto.map(([, attrs, label]) => `<button role="menuitem" ${attrs}>${label}</button>`),
    ...manualNets.slice(1).map(n => `<button role="menuitem" data-manual="${c.id}" data-network="${n}">Registrar ${esc(ui.networks[n].name)}</button>`),
    `<button role="menuitem" data-edit="${c.id}">${icon('edit', { size: 15 })}Editar</button>`,
    ...c.channels.filter(n => c.posts?.[n]?.url).map(n => `<a role="menuitem" href="${esc(c.posts[n].url)}" target="_blank" rel="noopener noreferrer">${marcaRede(n, 16)}Abrir no ${esc(ui.networks[n]?.name || n)}</a>`),
    `<button role="menuitem" class="perigo" data-delete="${c.id}">${icon('delete', { size: 15 })}Remover</button>`,
  ];

  const aviso = (texto, erro = false) => `<p class="lib-aviso${erro ? ' erro' : ''}">${icon('warning', { size: 14 })}<span>${texto}</span></p>`;
  const avisos = [
    c.media?.error ? aviso(esc(c.media.error), true) : '',
    // Erro de cada rede com falha, visível (antes só no title do chip). Sem repetir o nome quando a mensagem já começa com ele.
    ...c.channels.filter(n => c.posts?.[n]?.status === 'failed' && c.posts[n].error).map(n => { const nome = ui.networks[n]?.name || n, erro = c.posts[n].error; return aviso(erro.startsWith(nome) ? esc(erro) : `<b>${esc(nome)}:</b> ${esc(erro)}`, true); }),
    c.media?.duration > 90 ? aviso('acima de 90 s: Facebook Reels pode recusar') : '',
    c.media?.duration > 60 && c.channels.includes('youtube') ? aviso('acima de 60 s: no YouTube, música com direitos autorais bloqueia o Short') : '',
  ].join('');

  return `<article class="lib-card${c.status === 'attention' ? ' falha' : ''}" data-id="${c.id}">${preview(c, ui)}
    <details class="lib-menu"><summary aria-label="Mais ações" title="Mais ações">${icon('more', { size: 18 })}</summary><div class="lib-menu-list" role="menu">${menu.join('')}</div></details>
    <div class="lib-body">
      <div class="lib-badges"><span class="lib-badge ${stCls || 'gray'}">${stLabel}</span><span class="lib-badge ${mdCls} soft" title="${esc(c.media?.error || '')}">${mdLabel}</span></div>
      <h3 title="${esc(c.title)}">${esc(c.title)}</h3>
      <div class="lib-chips">${c.channels.length ? c.channels.map(n => chipRede(c, n, ui)).join('') : '<span class="lib-quiet">Nenhuma rede selecionada</span>'}</div>
      <p class="lib-meta">${icon('calendar', { size: 14 })}<span>${c.scheduledAt ? esc(ui.date(c.scheduledAt)) : 'Sem data planejada'}${c.media?.duration ? ` · ${Math.round(c.media.duration)} s` : ''}${c.bytes ? ` · ${(c.bytes / 1024 / 1024).toFixed(1)} MB` : ''}</span></p>
      ${avisos}
    </div>
    <footer class="lib-foot"><div class="lib-acoes">${principal}<button class="lib-btn" data-edit="${c.id}">Editar</button><button class="lib-icon" data-delete="${c.id}" aria-label="Remover" title="Remover">${icon('close', { size: 14 })}</button></div></footer>
  </article>`;
}

export function listaBiblioteca(contents, ui) {
  const itens = filtrarOrdenar(contents, { filtro: ui.filtro, busca: ui.busca, ordem: opcoes.ordem });
  if (itens.length) return `<div class="lib-grid${opcoes.vista === 'lista' ? ' lista' : ''}">${itens.map(c => cardBiblioteca(c, ui)).join('')}</div>`;
  if (!contents.length) return `<section class="lib-vazio">${icon('video', { size: 30 })}<h3>Sua biblioteca começa com um vídeo</h3><p>Importe um Reels do Instagram da loja ou envie o arquivo original. O painel prepara a versão 9:16 automaticamente.</p><div class="lib-acoes"><button class="lib-btn" data-import>${icon('download', { size: 15 })}Importar do Instagram</button><button class="lib-btn primary" data-new>${icon('plus', { size: 15 })}Enviar um vídeo</button></div></section>`;
  return `<section class="lib-vazio">${icon('search', { size: 30 })}<h3>Nenhum conteúdo encontrado</h3><p>${ui.busca ? `Nada com "${esc(ui.busca)}"` : 'Nenhum conteúdo'} ${ui.filtro !== 'all' ? 'neste filtro' : 'na biblioteca'}. Altere a busca ou o filtro para encontrar seu conteúdo.</p><div class="lib-acoes"><button class="lib-btn" data-lib-limpar>Limpar busca e filtro</button></div></section>`;
}

export function paginaBiblioteca(contents, ui) {
  const n = contarStatus(contents);
  const abas = FILTROS.map(([id, label]) => `<button class="lib-tab${ui.filtro === id ? ' on' : ''}" aria-pressed="${ui.filtro === id}" data-filter="${id}">${label}<span>${n[id]}</span></button>`).join('');
  const ordem = `<label class="lib-select" title="Ordenar">${icon('filter', { size: 16 })}<span>${esc((ORDENS.find(o => o[0] === opcoes.ordem) || ORDENS[0])[1])}</span>${icon('caret', { size: 12 })}<select data-lib-ordem aria-label="Ordenar">${ORDENS.map(([v, t]) => `<option value="${v}"${v === opcoes.ordem ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const vista = `<div class="lib-vista" role="group" aria-label="Visualização"><button type="button" data-lib-vista="grade" class="${opcoes.vista !== 'lista' ? 'on' : ''}" aria-pressed="${opcoes.vista !== 'lista'}" title="Grade">${icon('grid', { size: 17 })}</button><button type="button" data-lib-vista="lista" class="${opcoes.vista === 'lista' ? 'on' : ''}" aria-pressed="${opcoes.vista === 'lista'}" title="Lista">${icon('rows', { size: 17 })}</button></div>`;
  return ui.heading('Biblioteca de conteúdos', 'Gerencie seus vídeos, imagens e publicações em um só lugar.') +
    `<div class="lib-page"><div class="lib-tabs" role="group" aria-label="Filtrar por status">${abas}</div>
    <div class="lib-toolbar"><label class="lib-search">${icon('search', { size: 17 })}<input id="search" aria-label="Buscar conteúdo" placeholder="Buscar conteúdo…" value="${esc(ui.busca)}" autocomplete="off"></label>${ordem}${vista}</div>
    <div id="content-list">${listaBiblioteca(contents, ui)}</div></div>`;
}

let menusLigados = false;
/* Ordem e grade/lista redesenham só a lista; o menu ⋮ fecha ao clicar fora, ao escolher uma ação ou com Esc. */
export function ligarBiblioteca(root, redesenhar) {
  root.querySelector('[data-lib-ordem]')?.addEventListener('change', e => { opcoes.ordem = e.target.value; guardar(); redesenhar(); });
  root.querySelectorAll('[data-lib-vista]').forEach(b => b.addEventListener('click', () => { opcoes.vista = b.dataset.libVista; guardar(); redesenhar(); }));
  if (menusLigados) return;
  menusLigados = true;
  document.addEventListener('click', e => {
    document.querySelectorAll('.lib-menu[open]').forEach(m => { if (!m.contains(e.target) || e.target.closest('[role=menuitem]')) m.removeAttribute('open'); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.lib-menu[open]').forEach(m => m.removeAttribute('open')); });
}
