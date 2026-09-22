/* Vitrine do novo visual (kit.html). Monta as telas do painel NGD na gramática do
   SaaS Dashboard UI Kit, lendo /api/state (só leitura). Onde os dados reais ainda são poucos
   para mostrar uma tendência, o gráfico usa números de exemplo e diz isso no título. */
import { icon } from './icons.js';
import { area, bars, hbars, donut, legend, spark, wire, fmt, KIT } from './charts.js';

const NET = {
  instagram: { name: 'Instagram', color: KIT.purple },
  youtube: { name: 'YouTube', color: KIT.red },
  tiktok: { name: 'TikTok', color: KIT.yellow },
  facebook: { name: 'Facebook', color: KIT.accent },
  linkedin: { name: 'LinkedIn', color: KIT.green },
};
const STATUS = { draft: ['Rascunho', 'warn'], planned: ['Planejado', 'purple'], published: ['Publicado', 'ok'], attention: ['Com falha', 'danger'] };
const VIEWS = { overview: ['Visão geral', 'grid'], contents: ['Conteúdos', 'video'], calendar: ['Calendário', 'calendar'], networks: ['Redes sociais', 'network'], automations: ['Automações', 'flow'], results: ['Resultados', 'chart'], midia: ['Mídia paga', 'megaphone'] };
const READY = ['overview', 'contents', 'results', 'components'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = d => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const when = d => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : '—';
const badge = st => { const [l, c] = STATUS[st] || STATUS.draft; return `<span class="k-badge ${c}">${l}</span>`; };
const show = (label, value) => `<button class="k-show" type="button">${label}: <b>${value}</b>${icon('caret', { size: 10 })}</button>`;
const initials = name => (name || 'NGD').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const viewsOf = c => Object.values(c.posts || {}).reduce((s, p) => s + (p.metrics?.views || 0), 0);

// série de exemplo com semente fixa: repetir dá o mesmo desenho
function sample(n, base, amp, seed = 7) {
  let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + amp * Math.sin(i / 3.2 + seed) + amp * 0.6 * Math.sin(i / 1.3 + 1) + (rnd() - 0.5) * amp * 0.5)));
}
const lastDays = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d; });

let state = { settings: {}, contents: [], activity: [], connections: {} };
const pick = h => (READY.includes(h) ? h : 'overview');
let view = pick(location.hash.slice(1));

function shell(body) {
  const s = state.settings;
  const nav = Object.entries(VIEWS).map(([id, [label, ic]]) => {
    const cur = view === id ? ' aria-current="page"' : '';
    const count = id === 'contents' ? `<span class="k-count">${state.contents.length}</span>` : '';
    const sub = id === 'contents' && view === 'contents' ? `<div class="k-nav-sub">${Object.values(STATUS).map(([l, c]) => `<a class="dot-${c}"><i></i>${esc(l)}</a>`).join('')}</div>` : '';
    return `<a href="#${id}"${cur}>${icon(ic)}<span>${label}</span>${count}</a>${sub}`;
  }).join('');
  return `<aside class="k-side" aria-label="Menu principal">
    <div class="k-logo">NGD <small>Central de conteúdo</small></div>
    <div class="k-profile"><span class="k-avatar">${initials(s.name)}</span><div><strong title="${esc(s.name || '')}">${esc(s.name || 'NGD Núcleo Gráfico')}</strong><span>@${esc(s.instagram || 'nucleograficodigital')}</span></div></div>
    <nav class="k-nav">${nav}</nav>
    <div class="k-side-divider"></div>
    <nav class="k-nav k-nav-2"><a href="#components"${view === 'components' ? ' aria-current="page"' : ''}>${icon('settings')}<span>Componentes do kit</span></a></nav>
    <div class="k-side-foot">${icon('toggle', { size: 16 })} Recolher menu</div>
  </aside>
  <div class="k-main">
    <header class="k-top"><label class="k-top-search">${icon('search')}<span class="k-sr">Buscar</span><input type="search" name="q" placeholder="Buscar conteúdo, rede ou data"></label><button class="k-bell" type="button" aria-label="Avisos"${state.contents.some(c => c.status === 'attention') ? ' data-dot' : ''}>${icon('bell', { size: 24 })}</button></header>
    <main class="k-page" id="main" tabindex="-1">${body}</main>
  </div>`;
}

/* ---------------- visão geral: frame "dashboard regular" do kit ---------------- */
function overview() {
  const c = state.contents, done = c.filter(x => x.status === 'published').length;
  const now = new Date(), start = new Date(now); start.setDate(now.getDate() - now.getDay());
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const hasOn = d => c.some(x => x.scheduledAt && new Date(x.scheduledAt).toDateString() === d.toDateString());
  const pct = c.length ? Math.round(done / c.length * 100) : 0;
  const items = [...c].sort((a, b) => new Date(b.scheduledAt || b.createdAt) - new Date(a.scheduledAt || a.createdAt)).slice(0, 3);
  const nets = ['instagram', 'youtube', 'tiktok', 'facebook'];
  const connected = nets.filter(n => state.connections?.[n]?.connected).length;
  const labels = lastDays(30).map(day), views = sample(30, 90, 45);

  return `<div class="k-pagebar"><div class="k-filters">${show('Período', 'Esta semana')}${show('Rede', 'Todas')}</div><div class="k-actions"><button class="k-btn secondary" type="button">${icon('download', { size: 16 })} Importar do Instagram</button><button class="k-btn primary" type="button">${icon('plus', { size: 16 })} Novo conteúdo</button></div></div>
  <div class="k-grid cols-dash">
    <section class="k-card" aria-labelledby="t-week">
      <div class="k-card-body summary">
        <div class="k-row-between"><p class="k-progress-label" id="t-week">${done} ${done === 1 ? 'conteúdo' : 'conteúdos'} <em>publicado${done === 1 ? '' : 's'}</em> de ${c.length}</p>${show('Mostrar', 'Esta semana')}</div>
        <div class="k-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Publicados"><i data-w="${pct}"></i></div>
        <p class="k-date">${now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}, <span>${now.toLocaleDateString('pt-BR', { weekday: 'long' })}</span></p>
        <div class="k-days">${week.map(d => `<button type="button" class="${hasOn(d) ? 'has' : ''}"${d.toDateString() === now.toDateString() ? ' aria-current="date"' : ''}>${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}<b>${d.getDate()}</b></button>`).join('')}</div>
      </div>
      <div class="k-divider"></div>
      <div class="k-card-body"><div class="k-items">${items.length ? items.map(item).join('') : `<div class="k-empty">${icon('video', { size: 32 })}<strong>Nenhum conteúdo ainda</strong><span>Importe um Reels ou envie um vídeo.</span></div>`}</div></div>
      <div class="k-card-foot"><a class="k-btn tertiary" href="#contents">Ver todos os conteúdos</a></div>
    </section>
    <div class="k-stack">
      <section class="k-card" aria-labelledby="t-views">
        <div class="k-card-head"><h2 class="k-card-title" id="t-views">Visualizações</h2>${show('Mostrar', 'Mensal')}</div>
        <div class="k-card-body">${legend([{ label: 'Todas as redes · exemplo', color: KIT.accent }], { row: true })}<div class="k-mt-16">${area({ labels, values: views, name: 'Visualizações', title: 'Visualizações por dia nos últimos 30 dias (exemplo)' })}</div></div>
      </section>
      <section class="k-card" aria-labelledby="t-nets">
        <div class="k-card-head"><h2 class="k-card-title" id="t-nets">Redes</h2>${show('Mostrar', 'Agora')}</div>
        <div class="k-card-body"><div class="k-donut-wrap">${donut({ slices: [{ label: 'Conectadas', value: connected, color: KIT.green }, { label: 'Pendentes', value: nets.length - connected, color: KIT.yellow }], center: Math.round(connected / nets.length * 100) + '%', caption: 'conectadas', title: 'Redes automáticas conectadas' })}${legend([...nets.map(n => ({ label: NET[n].name, color: state.connections?.[n]?.connected ? KIT.green : KIT.yellow, value: state.connections?.[n]?.connected ? 'Conectada' : 'Pendente' })), { label: 'LinkedIn', color: KIT.axis, value: 'Manual' }])}</div></div>
      </section>
    </div>
  </div>`;
}

function item(c) {
  const nets = (c.channels || []).map(n => NET[n]?.name || n);
  return `<article class="k-item">
    <h3 class="k-item-title">${esc(c.title)}</h3><span class="k-item-type">${esc(nets.join(' · ') || 'Sem rede')}</span>
    <p class="k-item-meta"><span>${c.status === 'published' ? 'Publicado em:' : 'Planejado para:'}</span> ${when(c.scheduledAt || c.createdAt)}</p>
    <div class="k-item-who">${icon('eye', { size: 16 })} ${fmt(viewsOf(c))} visualizações</div>
    <div class="k-item-end"><button class="k-iconbtn" type="button" aria-label="Editar">${icon('edit', { size: 16 })}</button><button class="k-iconbtn" type="button" aria-label="Excluir">${icon('delete', { size: 16 })}</button>${badge(c.status)}</div>
  </article>`;
}

/* ---------------- conteúdos: tabela do frame "tasks" ---------------- */
function contents() {
  const rows = state.contents.map(c => `<tr><td><input class="k-check" type="checkbox" aria-label="Selecionar ${esc(c.title)}"></td><td>${badge(c.status)}</td><td class="t-title">${esc(c.title)}</td><td>${esc((c.channels || []).map(n => NET[n]?.name || n).join(', ') || '—')}</td><td class="k-num">${fmt(viewsOf(c))}</td><td class="t-right k-num">${when(c.scheduledAt || c.createdAt)}</td></tr>`).join('');
  return `<div class="k-pagebar"><div class="k-filters">${show('Data', 'Todas')}${show('Status', 'Todos')}${show('Rede', 'Todas')}</div><button class="k-btn primary" type="button">${icon('plus', { size: 16 })} Novo conteúdo</button></div>
  <div class="k-table-wrap"><table class="k-table"><thead><tr><th><input class="k-check" type="checkbox" aria-label="Selecionar todos"></th><th>Status</th><th>Título</th><th>Redes</th><th>Visualizações</th><th class="t-right">Data</th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="k-empty"><strong>Nenhum conteúdo</strong></div></td></tr>'}</tbody></table></div>`;
}

/* ---------------- resultados ---------------- */
function results() {
  const labels = lastDays(30).map(day), nets = ['instagram', 'youtube', 'tiktok', 'facebook'];
  const real = nets.map(n => ({ label: NET[n].name, color: NET[n].color, value: state.contents.reduce((s, c) => s + (c.posts?.[n]?.metrics?.views || 0), 0) }));
  const hasReal = real.some(r => r.value);
  const eng = [{ label: 'Curtidas', value: 62, color: KIT.accent }, { label: 'Comentários', value: 21, color: KIT.green }, { label: 'Compartilhamentos', value: 17, color: KIT.yellow }];
  const stats = [['Visualizações', '2.418', '+18% no mês', 'up', sample(12, 40, 14, 3)], ['Curtidas', '312', '+6% no mês', 'up', sample(12, 20, 6, 5)], ['Comentários', '41', '−3% no mês', 'down', sample(12, 8, 3, 9)], ['Publicações', String(state.contents.filter(c => c.status === 'published').length), 'links registrados', '', sample(12, 3, 1, 11)]];
  return `<div class="k-pagebar"><div class="k-filters">${show('Período', 'Últimos 30 dias')}${show('Rede', 'Todas')}</div><button class="k-btn secondary" type="button">${icon('refresh', { size: 16 })} Coletar agora</button></div>
  <section class="k-card"><div class="k-card-body"><div class="k-stats">${stats.map(([l, v, d, cls, sp]) => `<div class="k-stat"><span>${l}</span><strong>${v}</strong><small class="${cls}">${d}</small>${spark(sp, { color: cls === 'down' ? KIT.red : KIT.accent })}</div>`).join('')}</div><p class="k-note">Números de exemplo, exceto “Publicações”.</p></div></section>
  <div class="k-grid cols-2">
    <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Visualizações por rede</h2>${show('Mostrar', 'Semanal')}</div><div class="k-card-body">${legend(nets.map(n => ({ label: NET[n].name, color: NET[n].color })), { row: true })}<div class="k-mt-16">${bars({ labels: ['1ª semana', '2ª semana', '3ª semana', '4ª semana'], series: nets.map((n, i) => ({ name: NET[n].name, color: NET[n].color, values: sample(4, 60 + i * 25, 30, 2 + i) })), title: 'Visualizações por rede e semana (exemplo)' })}</div></div></section>
    <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Engajamento</h2>${show('Mostrar', 'Este mês')}</div><div class="k-card-body"><div class="k-donut-wrap">${donut({ slices: eng, title: 'Distribuição do engajamento (exemplo)' })}${legend(eng.map(e => ({ ...e, value: e.value + '%' })))}</div></div></section>
  </div>
  <div class="k-grid cols-2">
    <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Tendência de alcance</h2>${show('Mostrar', 'Mensal')}</div><div class="k-card-body">${area({ labels, values: sample(30, 120, 60, 13), name: 'Alcance', marker: 'last', title: 'Alcance diário (exemplo)' })}</div></section>
    <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Ranking das redes</h2><span class="k-badge ${hasReal ? 'ok' : 'neutral'}">${hasReal ? 'Dados reais' : 'Sem coleta'}</span></div><div class="k-card-body">${hbars(real)}</div></section>
  </div>`;
}

/* ---------------- componentes ---------------- */
function components() {
  const icons = ['grid', 'video', 'calendar', 'network', 'flow', 'chart', 'megaphone', 'send', 'settings', 'search', 'bell', 'plus', 'edit', 'delete', 'close', 'back', 'eye', 'more', 'check', 'link', 'attach', 'upload', 'download', 'refresh', 'clock', 'info', 'warning', 'play', 'image', 'users', 'filter', 'mail', 'user', 'chat', 'board', 'rows', 'toggle', 'schedule', 'add-circle', 'arrow'];
  const colors = [['Accent', '#109bf0', '#0d7cc0'], ['Green', '#2ed47a', '#1d874d'], ['Red', '#f7685b', '#c35248'], ['Yellow', '#ffb946', '#192a3e'], ['Purple', '#885af8', '#8457f1'], ['Black', '#192a3e', '#192a3e'], ['Dark blue', '#334d6e', '#334d6e'], ['Gray', '#90a0b7', '#6b7788'], ['Gray icon', '#c2cfe0', '#c2cfe0'], ['Divider', '#ebeff2', '#ebeff2']];
  return `<section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Botões</h2></div><div class="k-card-body k-row-wrap">
    <button class="k-btn primary" type="button">Novo conteúdo</button><button class="k-btn secondary" type="button">Importar</button><button class="k-btn tertiary" type="button">Ver todos</button><button class="k-btn primary" type="button" disabled>Salvando…</button><button class="k-btn primary sm" type="button">${icon('send', { size: 14 })} Publicar agora</button></div></section>
  <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Etiquetas de status</h2></div><div class="k-card-body k-row-wrap">${Object.keys(STATUS).map(badge).join('')}<span class="k-badge info">Na fila</span><span class="k-badge neutral">Manual</span></div></section>
  <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Campos</h2></div><div class="k-card-body k-form-grid">
    <label class="k-field"><span>Título do conteúdo</span><input placeholder="Ex.: acabamento de cartões de visita"></label>
    <label class="k-field"><span>Data e horário</span><input type="datetime-local"></label>
    <label class="k-field"><span>Rede</span><select><option>Instagram</option><option>YouTube</option></select></label>
    <label class="k-field"><span>Link do Reels</span><input value="https://instagram.com/reel/abc" aria-invalid="true"><small class="k-error">O link precisa ser de um Reels público.</small></label>
    <label class="k-field k-span-2"><span>Legenda</span><textarea rows="3" placeholder="Conte a história do vídeo."></textarea><small class="k-hint">Até 2.200 caracteres no Instagram.</small></label>
  </div></section>
  <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Ícones (${icons.length})</h2><span class="k-muted k-body2">contorno 1,4px, grade 20×20, cor pelo CSS</span></div><div class="k-card-body k-icon-grid">${icons.map(n => `<figure>${icon(n, { size: 24 })}<figcaption>${n}</figcaption></figure>`).join('')}</div></section>
  <section class="k-card"><div class="k-card-head"><h2 class="k-card-title">Cores do kit</h2><span class="k-muted k-body2">acima: cor original · abaixo: tom usado quando há texto</span></div><div class="k-card-body k-swatches">${colors.map(([n, a, b]) => `<div><i data-c="${a}"></i><i data-c="${b}"></i><strong>${n}</strong><span>${a}${a !== b ? ' → ' + b : ''}</span></div>`).join('')}</div></section>`;
}

function render() {
  const pages = { overview, contents, results, components };
  const title = view === 'components' ? 'Componentes do kit' : VIEWS[view][0];
  document.title = `NGD · ${title} · vitrine`;
  const app = document.getElementById('app');
  app.innerHTML = shell(pages[view]());
  wire(app);
}

addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (VIEWS[h] && !READY.includes(h)) { history.replaceState(null, '', '#' + view); return; } // telas da Etapa 6
  view = pick(h); render(); document.getElementById('main')?.focus();
});
fetch('/api/state').then(r => (r.ok ? r.json() : null)).then(s => { if (s) state = s; }).catch(() => {}).finally(render);
