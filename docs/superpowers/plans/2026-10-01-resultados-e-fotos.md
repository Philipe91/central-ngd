# Resultados no kit + Carrossel/Imagem na Meta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Refazer a aba Resultados com os mesmos cartões, gráficos e família de ícones da Mídia paga; (B) publicar imagem única e carrossel de fotos no Instagram e na Página do Facebook pela mesma fila dos vídeos.

**Architecture:** (A) Um módulo novo `public/resultados.js` com uma função pura de agregação e uma de HTML no kit (`ui/charts.js` + `ui/icons.js`), ligado em `app.js`. (B) Conteúdo ganha `kind` (`video|image|carousel`) e `images[]`; o servidor aceita fotos, prepara JPG com ffmpeg, entrega `imageUrls` assinadas pelo túnel ao n8n; dois ramos novos no fluxo "Publicar fila" (Instagram fotos e Facebook fotos), cobertos pelo mock.

**Tech Stack:** Node 22 (ESM, `node:test`), Express + multer, ffmpeg portátil, n8n 2.39 (fluxos gerados por `automation/create-workflows.mjs`), front-end sem build (CSP `style-src 'self'`, sem CDN).

**Spec:** `docs/superpowers/specs/2026-10-01-carrossel-imagem-design.md` (parte B). Parte A foi pedida no chat em 01/10/2026: "melhore a aba Resultados, família de ícones para gráficos, pode ser o mesmo da Mídia paga".

## Global Constraints

- Carrossel: toda foto sai em **1080×1350 (4:5)**; foto fora da proporção entra inteira sobre fundo desfocado, sem corte.
- Imagem única: mantém a proporção se estiver entre **4:5 e 1.91:1** (largura 1080); fora disso, 1080×1350 como o carrossel.
- Saída **JPG**, até **8 MB**. Entrada: JPG, PNG, WebP; até 30 MB por foto. Carrossel: **2 a 10** fotos; imagem: **1**.
- Fotos só em **instagram, facebook, linkedin** (manual). YouTube e TikTok recusados pelo servidor e desativados no painel.
- Conteúdos existentes viram `kind: 'video'` na migração e continuam idênticos (os 10 vídeos agendados de 01–10/10 não podem mudar).
- Painel offline e com CSP: nada de `style=""` na marcação (usar `data-*` + `wire()`/`paint()`), nada de CDN.
- Ícones novos no mesmo padrão de `public/ui/icons.js`: grade 20×20, contorno `stroke-width="1.4"`, `currentColor`.
- Commits: só os arquivos da tarefa (`git add <arquivos>`), nunca `git add -A` (outra sessão usa o mesmo diretório). Fim da mensagem: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de cada commit: `npm run check` e `npm test` verdes.

## Review Focus

1. **Dois carrosséis vencendo no mesmo ciclo** — o nó Aggregate do n8n junta tudo que chega; o painel entrega **no máximo um trabalho de foto por rede por ciclo** (Task 5) para nada se misturar.
2. **Uma foto do carrossel recusada pela Meta** — o post não pode sair com fotos faltando; o fluxo confere a contagem e registra falha legível (Task 7).
3. **Foto PNG com transparência** — vira fundo branco, não preto (Task 4).
4. **Edição de um conteúdo de foto** — PATCH não pode aceitar YouTube/TikTok nem trocar o tipo (Task 5).
5. **Métricas do Facebook em post de fotos** — a coleta atual usa o campo `views` de vídeo; posts de foto do Facebook ficam fora da coleta para não gerar erro (Task 5).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `public/ui/icons.js` (modificar) | + ícones `heart`, `share`, `trend`, `trophy`, `pie` |
| `public/resultados.js` (criar) | `resumoResultados(contents)` pura + `paginaResultados(contents, ui)` HTML no kit |
| `public/app.js` (modificar) | usa `paginaResultados`; editor com tipo/fotos; cartão com selo de foto |
| `public/index.html`, `public/style.css` (modificar) | seletor de tipo, área de fotos, lista de miniaturas |
| `lib/kinds.mjs` (criar) | tipos, canais permitidos, limites e validação |
| `lib/store.mjs` (modificar) | migração `kind`/`images` |
| `lib/media.mjs` (modificar) | `photoSize()` pura e `preparePhoto()` |
| `lib/queue.mjs` (modificar) | `claimJobs` com `kind`/`images` e 1 foto por rede por ciclo |
| `server.mjs` (modificar) | upload de fotos, preparo, `imageUrls`, share JPG, PATCH, métricas |
| `automation/mock-platforms.mjs` (modificar) | Meta: imagem, carrossel, `/photos`, `/feed` |
| `automation/create-workflows.mjs` (modificar) | ramos `instagram-fotos` e `facebook-fotos` |
| `tests/resultados.test.mjs`, `tests/fotos.test.mjs` (criar); `tests/server.test.mjs`, `tests/simulacao.test.mjs` (modificar) | testes |

---

### Task 1: Ícones de gráfico na família do kit

**Files:**
- Modify: `public/ui/icons.js` (objeto `ICONS`, antes de `'caret'`), `docs/design/README.md` (contagem de ícones)
- Test: `tests/resultados.test.mjs`

**Interfaces:**
- Produces: `icon('heart'|'share'|'trend'|'trophy'|'pie', { size })` → string SVG `viewBox="0 0 20 20"`.

- [ ] **Step 1: Write the failing test**

```js
// tests/resultados.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icon, ICON_NAMES } from '../public/ui/icons.js';

test('ícones de gráfico existem na grade 20×20 do kit, em currentColor', () => {
  for (const nome of ['heart', 'share', 'trend', 'trophy', 'pie']) {
    assert.ok(ICON_NAMES.includes(nome), nome);
    const svg = icon(nome);
    assert.match(svg, /viewBox="0 0 20 20"/);
    assert.match(svg, /currentColor/);
    assert.match(svg, /stroke-width="1.4"/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/resultados.test.mjs`
Expected: FAIL (`heart` não está em ICON_NAMES)

- [ ] **Step 3: Add the icons** (inserir antes da linha `'caret': ...`)

```js
  'heart': [20, '<path d="M10 16.67s-6.67-3.9-6.67-8.75A3.75 3.75 0 0 1 10 5.63a3.75 3.75 0 0 1 6.67 2.29c0 4.85-6.67 8.75-6.67 8.75Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'],
  'share': [20, '<circle cx="15" cy="4.58" r="2.08" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5" cy="10" r="2.08" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="15" cy="15.42" r="2.08" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m6.8 11.05 6.4 3.32M13.2 5.63 6.8 8.95" fill="none" stroke="currentColor" stroke-width="1.4"/>'],
  'trend': [20, '<path d="m2.5 14.17 5-5 3.33 3.33 6.67-6.67M12.5 5.83h5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'],
  'trophy': [20, '<path d="M6.67 2.5h6.66v5a3.33 3.33 0 0 1-6.66 0v-5ZM6.67 4.17H3.33v1.66a2.5 2.5 0 0 0 2.5 2.5M13.33 4.17h3.34v1.66a2.5 2.5 0 0 1-2.5 2.5M10 10.83v3.34M6.67 17.5h6.66" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'],
  'pie': [20, '<path d="M10 2.5v7.5h7.5A7.5 7.5 0 1 1 10 2.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12.5 2.92a7.5 7.5 0 0 1 4.58 4.58H12.5V2.92Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'],
```

Em `docs/design/README.md`, a linha de `public/ui/icons.js` ("41 ícones") passa a "46 ícones (heart, share, trend, trophy e pie desenhados para a aba Resultados)".

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/resultados.test.mjs` → PASS

- [ ] **Step 5: Commit**

```bash
git add public/ui/icons.js docs/design/README.md tests/resultados.test.mjs
git commit -m "Painel: ícones de gráfico (curtida, compartilhar, tendência, troféu, pizza) na família do kit"
```

---

### Task 2: Aba Resultados no kit da Mídia paga

**Files:**
- Create: `public/resultados.js`
- Modify: `public/app.js` (remover `METRIC_KEYS` e `function results()`; imports; `render()`), `package.json` (`check` inclui `public/resultados.js`)
- Test: `tests/resultados.test.mjs`

**Interfaces:**
- Consumes: `icon` (Task 1); `area, bars, hbars, donut, legend, KIT, fmt` de `public/ui/charts.js`; `NETWORK_COLORS` de `public/charts.js`.
- Produces: `resumoResultados(contents) → { rows, total:{views,likes,comments,shares}, medidos, taxa, porRede:[{network,posts,medidos,views,likes,comments,shares}], serie:[{dia:'AAAA-MM-DD', views}], ultima }`; `paginaResultados(contents, { heading, networks, networkMark, date }) → string`.

- [ ] **Step 1: Write the failing tests** (acrescentar em `tests/resultados.test.mjs`)

```js
import { resumoResultados, paginaResultados } from '../public/resultados.js';

const pub = (status, metrics, updatedAt = '2026-10-01T21:10:00.000Z') => ({ status, url: 'https://x/1', updatedAt, metrics });
const conteudos = [
  { id: 'a', title: 'Banner', kind: 'video', posts: { youtube: pub('published', { views: 100, likes: 10, comments: 2, shares: 1, at: '2026-10-02T10:00:00Z' }), facebook: pub('published', { views: 50, likes: 5, comments: 0, shares: 0, at: '2026-10-02T10:00:00Z' }) } },
  { id: 'b', title: 'Carrossel', kind: 'carousel', posts: { instagram: pub('published', null, '2026-10-03T02:30:00.000Z'), linkedin: pub('manual', null) } },
  { id: 'c', title: 'Rascunho', posts: { youtube: { status: 'pending' } } },
];

test('resumo soma métricas, agrupa por rede e monta a série por dia de Brasília', () => {
  const r = resumoResultados(conteudos);
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.total, { views: 150, likes: 15, comments: 2, shares: 1 });
  assert.equal(r.medidos, 2);
  assert.equal(r.taxa.toFixed(1), '12.0');
  assert.deepEqual(r.porRede.map(n => n.network), ['youtube', 'facebook', 'instagram', 'linkedin']);
  // 21:10Z de 01/10 ainda é 01/10 em Brasília.
  assert.deepEqual(r.serie, [{ dia: '2026-10-01', views: 150 }]);
  assert.equal(r.ultima, '2026-10-02T10:00:00Z');
});

const ui = { heading: t => `<h1>${t}</h1>`, networks: { youtube: { name: 'YouTube' }, facebook: { name: 'Facebook' }, instagram: { name: 'Instagram' }, linkedin: { name: 'LinkedIn' } }, networkMark: id => `<i>${id}</i>`, date: v => String(v) };

test('página usa cartões, gráficos e ícones do kit, sem style inline', () => {
  const html = paginaResultados(conteudos, ui);
  for (const trecho of ['k-card k-kpis', 'k-kpi', 'k-chart-slot', 'k-hbars', 'k-table', 'id="collect"', 'viewBox="0 0 20 20"']) assert.ok(html.includes(trecho), trecho);
  assert.ok(!/style="/.test(html));
  assert.ok(html.includes('Carrossel'));
});

test('sem publicação mostra o estado vazio; sem métricas não desenha gráfico', () => {
  assert.match(paginaResultados([], ui), /Seus resultados vão aparecer aqui/);
  const semMetrica = paginaResultados([conteudos[1]], ui);
  assert.ok(!semMetrica.includes('k-chart-slot'));
  assert.match(semMetrica, /aguardando a coleta/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/resultados.test.mjs` → FAIL (módulo não existe)

- [ ] **Step 3: Create `public/resultados.js`**

```js
/* Aba Resultados: mesma família visual da Mídia paga (cartões k-card, gráficos de ui/charts.js e
   ícones de ui/icons.js). resumoResultados() é pura e testada em tests/resultados.test.mjs.
   Cor e largura viajam em data-*, aplicadas por wire() depois de inserir o HTML (CSP). */
import { area, bars, hbars, donut, legend, KIT, fmt } from './ui/charts.js';
import { icon } from './ui/icons.js';
import { NETWORK_COLORS } from './charts.js';

export const METRICAS = [
  { k: 'views', titulo: 'Visualizações', icone: 'eye', cor: KIT.accent },
  { k: 'likes', titulo: 'Curtidas', icone: 'heart', cor: KIT.green },
  { k: 'comments', titulo: 'Comentários', icone: 'chat', cor: KIT.yellow },
  { k: 'shares', titulo: 'Compartilhamentos', icone: 'share', cor: KIT.purple },
];
const TIPO = { video: 'Vídeo', image: 'Imagem', carousel: 'Carrossel' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const diaBrasilia = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function resumoResultados(contents) {
  const rows = contents.flatMap(c => Object.entries(c.posts || {})
    .filter(([, p]) => ['published', 'manual'].includes(p.status))
    .map(([n, p]) => ({ id: c.id, title: c.title, kind: c.kind || 'video', network: n, url: p.url, at: p.updatedAt, m: p.metrics })));
  const total = Object.fromEntries(METRICAS.map(({ k }) => [k, rows.reduce((t, r) => t + (Number(r.m?.[k]) || 0), 0)]));
  const medidas = rows.filter(r => r.m);
  const porRede = {};
  for (const r of rows) {
    const n = (porRede[r.network] ??= { network: r.network, posts: 0, medidos: 0, views: 0, likes: 0, comments: 0, shares: 0 });
    n.posts += 1; if (r.m) n.medidos += 1;
    for (const { k } of METRICAS) n[k] += Number(r.m?.[k]) || 0;
  }
  // Evolução: visualizações somadas por dia de publicação (fuso de Brasília), em ordem cronológica.
  const dias = {};
  for (const r of medidas) if (r.at) { const d = diaBrasilia(r.at); dias[d] = (dias[d] || 0) + (Number(r.m.views) || 0); }
  const interacoes = total.likes + total.comments + total.shares;
  return {
    rows, total, medidos: medidas.length,
    taxa: total.views ? (interacoes / total.views) * 100 : 0,
    porRede: Object.values(porRede).sort((a, b) => b.views - a.views || b.posts - a.posts),
    serie: Object.keys(dias).sort().map(dia => ({ dia, views: dias[dia] })),
    ultima: medidas.map(r => r.m.at).filter(Boolean).sort().at(-1) || '',
  };
}

const cartao = (titulo, ic, nota, corpo, extra = '') => `<section class="k-card${extra}">
  <div class="k-card-head"><h2 class="k-card-title">${icon(ic, { size: 20 })} ${titulo}</h2><span class="k-muted k-body2">${nota}</span></div>
  <div class="k-card-body">${corpo}</div></section>`;

export function paginaResultados(contents, ui) {
  const r = resumoResultados(contents);
  const head = ui.heading('Resultados', 'Entenda quais conteúdos aproximam mais pessoas da NGD.', false);
  if (!r.rows.length) return head + `<section class="k-card"><div class="k-empty"><strong>Seus resultados vão aparecer aqui</strong><span>Conecte as contas e publique o primeiro conteúdo. Os indicadores variam entre as redes.</span><a href="#networks" class="button secondary">Gerenciar redes</a></div></section>`;
  const nome = id => ui.networks[id]?.name || id;
  const tem = r.medidos > 0;
  const kpi = ({ k, titulo, icone }) => `<div class="k-kpi"><span class="k-kpi-label">${icon(icone, { size: 16 })}${titulo}</span>
    <strong class="k-num">${tem ? fmt(r.total[k]) : '—'}</strong>
    <small>${!tem ? 'aguardando a coleta das redes' : k === 'views' ? `${r.taxa.toFixed(1).replace('.', ',')}% viraram interação` : `em ${r.medidos} publicaç${r.medidos === 1 ? 'ão medida' : 'ões medidas'}`}</small></div>`;
  const kpis = `<section class="k-card k-kpis" aria-label="Totais das publicações">${METRICAS.map(kpi).join('')}</section>`;
  if (!tem) return head + kpis + tabela(r, ui, nome);

  const medidasRede = r.porRede.filter(n => n.medidos > 0);
  const lider = medidasRede.find(n => n.views > 0);
  const evolucao = cartao('Alcance ao longo do tempo', 'trend', 'visualizações por dia de publicação',
    area({ labels: r.serie.map(s => s.dia.slice(8, 10) + '/' + s.dia.slice(5, 7)), values: r.serie.map(s => s.views), name: 'Visualizações', title: 'Visualizações por dia de publicação', height: 260 }), ' k-span-2');
  const fatias = medidasRede.map(n => ({ label: nome(n.network), value: n.views, color: NETWORK_COLORS[n.network] }));
  const rosca = cartao('De onde vem o alcance', 'pie', lider ? `${esc(nome(lider.network))} na frente` : 'por rede',
    `<div class="k-donut-wrap">${donut({ slices: fatias, caption: 'das visualizações', title: 'Visualizações por rede' })}${legend(fatias)}</div>`);
  const top = r.rows.filter(x => Number(x.m?.views) > 0).sort((a, b) => b.m.views - a.m.views).slice(0, 6);
  const melhores = cartao('Conteúdos que mais alcançaram', 'trophy', 'os seis melhores',
    hbars(top.map(x => ({ label: `${x.title} · ${nome(x.network)}`, value: x.m.views, color: NETWORK_COLORS[x.network] }))));
  const interacao = cartao('Como as pessoas interagem', 'heart', 'curtidas, comentários e compartilhamentos por rede',
    legend(METRICAS.slice(1).map(m => ({ label: m.titulo, color: m.cor })), { row: true }) +
    bars({ labels: medidasRede.map(n => nome(n.network)), series: METRICAS.slice(1).map(m => ({ name: m.titulo, color: m.cor, values: medidasRede.map(n => n[m.k]) })), title: 'Interações por rede', height: 240 }), ' k-span-2');

  return head + kpis + `<div class="k-grid cols-2 k-mt-16">${evolucao}${rosca}${melhores}${interacao}</div>` + tabela(r, ui, nome);
}

function tabela(r, ui, nome) {
  const num = v => (v != null ? fmt(v) : '—');
  const linhas = r.rows.slice().sort((a, b) => (Number(b.m?.views) || 0) - (Number(a.m?.views) || 0)).map(x => `<tr>
    <td class="t-title">${esc(x.title)}</td><td>${TIPO[x.kind] || 'Vídeo'}</td><td><span class="cell-net">${ui.networkMark(x.network)}${esc(nome(x.network))}</span></td>
    <td>${ui.date(x.at)}</td><td class="t-right k-num"><strong>${num(x.m?.views)}</strong></td><td class="t-right k-num">${num(x.m?.likes)}</td>
    <td class="t-right k-num">${num(x.m?.comments)}</td><td class="t-right k-num">${num(x.m?.shares)}</td>
    <td>${x.url ? `<a class="k-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>` : ''}</td></tr>`).join('');
  return `<section class="k-card k-mt-16"><div class="k-card-head"><h2 class="k-card-title">${icon('rows', { size: 20 })} Desempenho por publicação</h2>
    <div class="k-actions"><span class="k-muted k-body2">${r.ultima ? `Última coleta em ${ui.date(r.ultima)}` : 'Ainda sem coleta das plataformas'}</span>
    <button id="collect" class="button secondary small">${icon('refresh', { size: 16 })} Atualizar métricas</button></div></div>
    <div class="k-table-scroll"><table class="k-table compact"><thead><tr><th>Conteúdo</th><th>Tipo</th><th>Rede</th><th>Data</th>
    <th class="t-right">Views</th><th class="t-right">Curtidas</th><th class="t-right">Coment.</th><th class="t-right">Compart.</th><th></th></tr></thead>
    <tbody>${linhas}</tbody></table></div>
    <p class="k-note k-pad">Métricas coletadas todo dia às 7h para publicações feitas pela automação. Publicações registradas à mão não têm coleta, e cada rede mostra indicadores diferentes.</p></section>`;
}
```

- [ ] **Step 4: Wire into `public/app.js`**

1. Topo: acrescentar `import { paginaResultados } from './resultados.js';` e `import { wire } from './ui/charts.js';`.
2. Apagar a linha `const METRIC_KEYS = ...` e toda a `function results() { ... }` (linhas 67–108 hoje) e pôr no lugar:

```js
function results() { return paginaResultados(state.contents, { heading, networks, networkMark, date }); }
```

3. Em `render()`, depois de `paint(main);` acrescentar `wire(main);`.
4. Remover do import de `./charts.js` o que ficar sem uso (conferir com `grep -n "donut(\|bars(\|groupedBars(\|legend(\|SERIES_COLORS" public/app.js`).
5. `package.json` → `check`: acrescentar `&& node --check public/resultados.js`.

- [ ] **Step 5: Run tests and check**

Run: `npm run check && node --test tests/resultados.test.mjs && npm test` → PASS

- [ ] **Step 6: Ver no navegador**

Abrir `http://localhost:3210/#results`: 4 KPIs com ícones olho/coração/balão/compartilhar; gráficos com cor (barra cinza = faltou `wire(main)`); "Atualizar métricas" funcionando; console sem erro de CSP; em 375 px de largura, sem rolagem horizontal.

- [ ] **Step 7: Commit**

```bash
git add public/resultados.js public/app.js package.json tests/resultados.test.mjs
git commit -m "Painel: aba Resultados no kit da Mídia paga, com evolução, rosca, ranking e interações"
```

---

### Task 3: Tipos de conteúdo e migração

**Files:**
- Create: `lib/kinds.mjs`
- Modify: `lib/store.mjs` (`migrateContent`)
- Test: `tests/fotos.test.mjs`

**Interfaces:**
- Produces: `KINDS`, `PHOTO_CHANNELS`, `isPhoto(kind) → boolean`, `kindError(kind, channels, count|null) → string` ('' = válido).

- [ ] **Step 1: Write the failing test**

```js
// tests/fotos.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, PHOTO_CHANNELS, isPhoto, kindError } from '../lib/kinds.mjs';
import { migrateContent } from '../lib/store.mjs';

test('tipos: fotos só na Meta e no LinkedIn, com 1 ou 2–10 fotos', () => {
  assert.deepEqual(KINDS, ['video', 'image', 'carousel']);
  assert.deepEqual(PHOTO_CHANNELS, ['instagram', 'facebook', 'linkedin']);
  assert.ok(isPhoto('carousel') && isPhoto('image') && !isPhoto('video') && !isPhoto(undefined));
  assert.equal(kindError('video', ['youtube', 'tiktok'], null), '');
  assert.equal(kindError('gif', [], null), 'Tipo de conteúdo inválido.');
  assert.match(kindError('image', ['instagram', 'youtube'], 1), /Instagram, no Facebook e no LinkedIn/);
  assert.equal(kindError('image', ['instagram'], 1), '');
  assert.equal(kindError('image', ['instagram'], 2), 'Envie 1 foto.');
  assert.equal(kindError('carousel', ['facebook'], 1), 'O carrossel precisa de 2 a 10 fotos.');
  assert.equal(kindError('carousel', ['facebook'], 11), 'O carrossel precisa de 2 a 10 fotos.');
  assert.equal(kindError('carousel', ['facebook', 'linkedin'], 10), '');
  assert.equal(kindError('carousel', ['instagram'], null), '');
});

test('migração marca conteúdo antigo como vídeo sem fotos', () => {
  const c = migrateContent({ id: 'x', channels: ['youtube'], scheduledAt: '2026-10-05T21:00:00.000Z', status: 'planned' });
  assert.equal(c.kind, 'video'); assert.deepEqual(c.images, []); assert.equal(c.status, 'planned');
  assert.equal(migrateContent({ id: 'y', kind: 'carousel', images: [{ file: 'a.jpg' }], channels: [] }).kind, 'carousel');
});
```

- [ ] **Step 2: Run** `node --test tests/fotos.test.mjs` → FAIL (módulo não existe)

- [ ] **Step 3: Implement**

```js
// lib/kinds.mjs
// Tipos de conteúdo: vídeo (todas as redes) e fotos (imagem única ou carrossel: Meta + LinkedIn manual).
export const KINDS = ['video', 'image', 'carousel'];
export const PHOTO_CHANNELS = ['instagram', 'facebook', 'linkedin'];
const LIMITS = { image: [1, 1], carousel: [2, 10] };
export const isPhoto = kind => kind === 'image' || kind === 'carousel';

// count = null quando a quantidade não está em jogo (edição de um conteúdo já salvo).
export function kindError(kind, channels, count) {
  if (!KINDS.includes(kind)) return 'Tipo de conteúdo inválido.';
  if (!isPhoto(kind)) return '';
  if (channels.some(n => !PHOTO_CHANNELS.includes(n))) return 'Fotos só podem ser publicadas no Instagram, no Facebook e no LinkedIn.';
  if (count !== null) { const [min, max] = LIMITS[kind]; if (count < min || count > max) return kind === 'image' ? 'Envie 1 foto.' : 'O carrossel precisa de 2 a 10 fotos.'; }
  return '';
}
```

Em `lib/store.mjs`, `migrateContent`, logo depois de `c.hashtags ??= '';`:

```js
  c.kind ??= 'video';
  c.images ??= [];
```

- [ ] **Step 4: Run** `node --test tests/fotos.test.mjs && npm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add lib/kinds.mjs lib/store.mjs tests/fotos.test.mjs
git commit -m "Canal: tipo de conteúdo (vídeo, imagem, carrossel) com regras de rede e quantidade"
```

---

### Task 4: Preparo das fotos (JPG no formato certo)

**Files:**
- Modify: `lib/media.mjs` (depois de `prepare`)
- Test: `tests/fotos.test.mjs`

**Interfaces:**
- Consumes: `probe(file)` (já existe; o ffprobe expõe imagem como stream de vídeo).
- Produces: `photoSize(width, height, kind) → { width, height, fit: 'scale'|'pad' }`; `preparePhoto(inputPath, outDir, name, kind) → Promise<{ rendition, width, height, bytes }>`.

- [ ] **Step 1: Write the failing tests**

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tools, photoSize, preparePhoto, probe } from '../lib/media.mjs';

test('tamanho: carrossel sempre 1080×1350; imagem mantém de 4:5 a 1.91:1', () => {
  assert.deepEqual(photoSize(1080, 1080, 'carousel'), { width: 1080, height: 1350, fit: 'pad' });
  assert.deepEqual(photoSize(1080, 1080, 'image'), { width: 1080, height: 1080, fit: 'scale' });
  assert.deepEqual(photoSize(4000, 5000, 'image'), { width: 1080, height: 1350, fit: 'scale' });
  assert.deepEqual(photoSize(1910, 1000, 'image'), { width: 1080, height: 566, fit: 'scale' });
  assert.deepEqual(photoSize(1080, 1920, 'image'), { width: 1080, height: 1350, fit: 'pad' });
  assert.deepEqual(photoSize(3000, 1000, 'image'), { width: 1080, height: 1350, fit: 'pad' });
});

test('preparePhoto gera JPG a partir de PNG transparente e de paisagem', { skip: tools().missing.includes('ffmpeg') ? 'ferramentas ausentes' : false }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-foto-'));
  const { ffmpeg } = tools();
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red@0.0:s=800x600,format=rgba', '-frames:v', '1', path.join(dir, 'transp.png')]);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=1600x900', '-frames:v', '1', path.join(dir, 'paisagem.jpg')]);
  const a = await preparePhoto(path.join(dir, 'transp.png'), dir, 'a-1', 'carousel');
  const b = await preparePhoto(path.join(dir, 'paisagem.jpg'), dir, 'b-1', 'image');
  assert.deepEqual([a.rendition, a.width, a.height], ['a-1.jpg', 1080, 1350]);
  assert.deepEqual([b.width, b.height], [1080, 608]);
  assert.deepEqual(await probe(path.join(dir, 'a-1.jpg')).then(i => [i.width, i.height]), [1080, 1350]);
  // Transparência vira branco: o pixel do centro é claro, não preto.
  const px = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', path.join(dir, 'a-1.jpg'), '-vf', 'crop=1:1:540:675', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  assert.ok(px[0] > 200, `pixel ${px[0]}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run** `node --test tests/fotos.test.mjs` → FAIL (`photoSize` não exportado)

- [ ] **Step 3: Implement** (em `lib/media.mjs`, depois de `prepare`)

```js
// Fotos para a API da Meta: só JPG. Carrossel sempre 1080×1350 (4:5), porque o Instagram corta todas
// as fotos no formato da primeira. Imagem única mantém a proporção entre 4:5 e 1.91:1; fora disso, 4:5.
export function photoSize(width, height, kind) {
  const r = width / height;
  if (kind === 'image' && r >= 0.8 - 0.005 && r <= 1.91 + 0.005) return { width: 1080, height: Math.round(1080 / r / 2) * 2, fit: 'scale' };
  return { width: 1080, height: 1350, fit: 'pad' };
}

export async function preparePhoto(inputPath, outDir, name, kind) {
  const { ffmpeg } = tools();
  fs.mkdirSync(outDir, { recursive: true });
  const info = await probe(inputPath);
  const { width: W, height: H, fit } = photoSize(info.width, info.height, kind);
  // Fundo branco por baixo: PNG/WebP transparente não vira preto no JPG.
  const base = `color=c=white:s=${info.width}x${info.height}:d=1[w];[w][0:v]overlay=format=auto:shortest=1[src];`;
  const body = fit === 'scale'
    ? `[src]scale=${W}:${H}:flags=lanczos,setsar=1[v]`
    : `[src]split=2[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=luma_radius=30:luma_power=2,setsar=1[bgs];[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fgs];[bgs][fgs]overlay=(W-w)/2:(H-h)/2[v]`;
  const rendition = name + '.jpg';
  const out = path.join(outDir, rendition);
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-filter_complex', base + body, '-map', '[v]', '-frames:v', '1', '-pix_fmt', 'yuvj420p', '-q:v', '2', out], { timeout: 120000 });
  const bytes = fs.statSync(out).size;
  if (bytes > 8 * 1024 * 1024) throw new Error('A foto ficou com mais de 8 MB depois de preparada.');
  return { rendition, width: W, height: H, bytes };
}
```

- [ ] **Step 4: Run** `node --test tests/fotos.test.mjs && npm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add lib/media.mjs tests/fotos.test.mjs
git commit -m "Canal: preparo de fotos em JPG 1080×1350 (carrossel) ou proporção aceita (imagem)"
```

---

### Task 5: Servidor e fila aceitam fotos

**Files:**
- Modify: `server.mjs` (multer, `POST /api/contents`, `PATCH`, `prepareContent`, `prepare`, `DELETE`, claim, `/api/automation/published`, `shareApp`, handler de erro), `lib/queue.mjs` (`claimJobs`)
- Test: `tests/fotos.test.mjs` (fila), `tests/server.test.mjs` (HTTP)

**Interfaces:**
- Consumes: `kindError`, `isPhoto`, `PHOTO_CHANNELS` (Task 3); `preparePhoto` (Task 4).
- Produces: trabalho do n8n com `kind`, `images: ['<id>-1.jpg', ...]` e, para fotos, `imageUrls: ['https://…/share/<token>', ...]` (Instagram e Facebook). Conteúdo salvo: `{ kind, images: [{ file, originalName, bytes, rendition, width, height }], media.thumb = images[0].rendition }`.

- [ ] **Step 1: Write the failing queue test** (em `tests/fotos.test.mjs`)

```js
import { claimJobs } from '../lib/queue.mjs';

test('fila: foto leva kind e arquivos, pula YouTube e sai uma por rede por ciclo', () => {
  const foto = id => ({ id, title: id, kind: 'carousel', channels: ['instagram', 'facebook', 'youtube'], scheduledAt: '2026-10-01T00:00:00Z', media: { state: 'ready', rendition: '', thumb: id + '-1.jpg' }, images: [{ rendition: id + '-1.jpg' }, { rendition: id + '-2.jpg' }], posts: {} });
  const video = { id: 'v', title: 'v', kind: 'video', channels: ['instagram'], scheduledAt: '2026-10-01T00:00:00Z', media: { state: 'ready', rendition: 'v.mp4' }, posts: {} };
  const db = { contents: [foto('a'), foto('b'), video] };
  const jobs = claimJobs(db, Date.parse('2026-10-02T00:00:00Z'));
  assert.deepEqual(jobs.map(j => `${j.contentId}:${j.network}`), ['a:instagram', 'a:facebook', 'v:instagram']);
  assert.equal(jobs[0].kind, 'carousel'); assert.deepEqual(jobs[0].images, ['a-1.jpg', 'a-2.jpg']);
  assert.equal(jobs[2].kind, 'video');
  assert.equal(db.contents[1].posts.instagram.status, 'pending'); // "b" fica para o próximo ciclo
  assert.equal(db.contents[0].posts.youtube?.status ?? 'pending', 'pending'); // YouTube nunca entra para foto
  assert.deepEqual(claimJobs(db, Date.parse('2026-10-02T00:05:00Z')).map(j => `${j.contentId}:${j.network}`), ['b:instagram', 'b:facebook']);
});
```

- [ ] **Step 2: Run** `node --test tests/fotos.test.mjs` → FAIL (`kind` undefined)

- [ ] **Step 3: Implement `claimJobs`** (`lib/queue.mjs`)

No topo: `import { isPhoto, PHOTO_CHANNELS } from './kinds.mjs';`. Substituir de `const jobs = [];` até o fim do `for` externo por:

```js
  const jobs = [];
  // O n8n junta as fotos de um carrossel num nó Aggregate: dois carrosséis da mesma rede no mesmo ciclo
  // se misturariam. Por isso sai no máximo um trabalho de foto por rede a cada ciclo.
  const fotoNaRede = new Set();
  for (const c of db.contents) {
    if (!c.scheduledAt || Date.parse(c.scheduledAt) > now) continue;
    if (c.media?.state !== 'ready') continue;
    const kind = c.kind || 'video', photo = isPhoto(kind);
    for (const n of c.channels || []) {
      if (!networks.includes(n) || !AUTOMATED.includes(n)) continue;
      if (photo && (!PHOTO_CHANNELS.includes(n) || fotoNaRede.has(n))) continue;
      const p = c.posts[n] ??= { status: 'pending', attempts: 0 };
      if (p.status !== 'pending') continue;
      if (jobs.length >= limit) break;
      if (photo) fotoNaRede.add(n);
      Object.assign(p, { status: 'queued', attempts: (p.attempts || 0) + 1, claimedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), error: '' });
      jobs.push({
        jobId: `${c.id}:${n}`, contentId: c.id, network: n, kind, title: c.title, text: textFor(c, n), hashtags: c.hashtags || '',
        images: photo ? (c.images || []).map(i => i.rendition) : [],
        filePath: photo ? '' : String(renditionPath ? renditionPath(c) : c.media.rendition).split('\\').join('/'), thumbPath: c.media.thumb, fileName: photo ? '' : c.media.rendition || c.file,
        duration: c.media.duration || 0, bytes: c.media.bytes || c.bytes || 0, scheduledAt: c.scheduledAt,
      });
      syncStatus(c);
    }
  }
```

(manter `db.automation = …` e `return jobs;` em seguida.)

- [ ] **Step 4: Write the failing HTTP test** (novo `test(...)` no fim de `tests/server.test.mjs`)

```js
test('fotos: carrossel aceita 2–10 JPG/PNG/WebP só na Meta, edição não troca tipo e share serve JPG', async () => {
  fs.writeFileSync(path.join(temporary, 'automation-secrets.json'), JSON.stringify({ bridgeToken: token }));
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
  const form = (kind, n, channels, nome = 'f.jpg', corpo = jpg) => { const f = new FormData(); f.append('kind', kind); f.append('title', 'Fotos'); f.append('channels', JSON.stringify(channels)); for (let i = 0; i < n; i++) f.append('images', new Blob([corpo], { type: 'image/jpeg' }), nome); return f; };
  assert.equal((await request('/api/contents', { method: 'POST', body: form('carousel', 1, ['instagram']) })).status, 400);
  assert.equal((await request('/api/contents', { method: 'POST', body: form('carousel', 2, ['youtube']) })).status, 400);
  assert.equal((await request('/api/contents', { method: 'POST', body: form('image', 1, ['instagram'], 'f.jpg', Buffer.from('nao e foto')) })).status, 400);
  assert.equal((await request('/api/contents', { method: 'POST', body: form('image', 1, ['instagram'], 'f.gif') })).status, 400);
  const ok = await request('/api/contents', { method: 'POST', body: form('carousel', 3, ['instagram', 'facebook', 'linkedin']) });
  assert.equal(ok.status, 201); assert.equal(ok.body.kind, 'carousel'); assert.equal(ok.body.images.length, 3); assert.equal(ok.body.file, '');
  const patch = { title: 'Fotos', caption: '', hashtags: '', channels: ['instagram', 'youtube'], scheduledAt: '' };
  assert.equal((await request('/api/contents/' + ok.body.id, json('PATCH', patch))).status, 400);
  const patched = await request('/api/contents/' + ok.body.id, json('PATCH', { ...patch, channels: ['facebook'], kind: 'video' }));
  assert.equal(patched.status, 200); assert.equal(patched.body.kind, 'carousel');
  // Servidor de compartilhamento entrega JPG com o tipo certo.
  const { createShareToken } = await import('../lib/media.mjs');
  fs.writeFileSync(path.join(temporary, 'renditions', 'teste-1.jpg'), jpg);
  const r = await fetch(shareBase + '/share/' + createShareToken('teste-1.jpg', token));
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg');
  // Excluir apaga os originais das fotos.
  assert.equal((await request('/api/contents/' + ok.body.id, { method: 'DELETE' })).status, 200);
  for (const img of ok.body.images) assert.ok(!fs.existsSync(path.join(temporary, 'videos', img.file)));
});
```

- [ ] **Step 5: Run** `node --test tests/server.test.mjs` → FAIL

- [ ] **Step 6: Implement in `server.mjs`**

Imports: `import { kindError, isPhoto } from './lib/kinds.mjs';`

Multer (substituir a definição de `upload`):

```js
const VIDEO_EXT = ['.mp4', '.mov', '.webm'], PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()) }), limits: { fileSize: 500 * 1024 * 1024, files: 10, fields: 14, fieldSize: 20000 }, fileFilter: (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const ok = file.fieldname === 'video' ? VIDEO_EXT.includes(ext) : file.fieldname === 'images' && PHOTO_EXT.includes(ext);
  if (!ok) return cb(Object.assign(new Error(file.fieldname === 'images' ? 'Envie fotos JPG, PNG ou WebP.' : 'Envie um vídeo MP4, MOV ou WebM.'), { status: 400 }));
  cb(null, true);
} });
// Confere o conteúdo real do arquivo (não só a extensão).
function sniff(file) {
  const fd = fs.openSync(file, 'r'); const h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0); fs.closeSync(fd);
  if (h.toString('ascii', 4, 8) === 'ftyp' || h.readUInt32BE(0) === 0x1a45dfa3) return 'video';
  if ((h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) || h.readUInt32BE(0) === 0x89504e47 || (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP')) return 'image';
  return '';
}
```

`POST /api/contents` (substituir a rota inteira):

```js
app.post('/api/contents', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'images', maxCount: 10 }]), (req, res, next) => {
  const files = [...(req.files?.video || []), ...(req.files?.images || [])];
  try {
    const kind = clean(req.body.kind, 20) || 'video';
    const fields = contentFields(req.body);
    const photos = req.files?.images || [];
    const erro = kindError(kind, fields.channels, isPhoto(kind) ? photos.length : null);
    if (erro) bad(erro);
    const base = { id: randomUUID(), kind, ...fields, createdAt: new Date().toISOString(), source: { type: 'upload', url: '', importedCaption: '' }, media: { state: 'pending', rendition: '', thumb: '', duration: 0, width: 0, height: 0, error: '' } };
    let item;
    if (isPhoto(kind)) {
      if (req.files?.video) bad('Para fotos, não envie vídeo junto.');
      for (const f of photos) { if (sniff(f.path) !== 'image') bad('Uma das fotos não é um JPG, PNG ou WebP válido.'); if (f.size > 30 * 1024 * 1024) bad('Cada foto deve ter até 30 MB.'); }
      const images = photos.map(f => ({ file: f.filename, originalName: clean(f.originalname, 200), bytes: f.size, rendition: '', width: 0, height: 0 }));
      item = syncStatus({ ...base, file: '', images, originalName: images[0].originalName, bytes: images.reduce((t, i) => t + i.bytes, 0) });
    } else {
      const f = req.files?.video?.[0];
      if (!f) bad('Selecione um vídeo.');
      if (photos.length) bad('Para vídeo, não envie fotos junto.');
      if (sniff(f.path) !== 'video') bad('O arquivo não é um vídeo MP4, MOV ou WebM compatível.');
      item = syncStatus({ ...base, file: f.filename, images: [], originalName: clean(f.originalname, 200), bytes: f.size });
    }
    store.change(d => { d.contents.unshift(item); store.log(d, `${isPhoto(kind) ? (kind === 'carousel' ? 'Carrossel' : 'Imagem') : 'Vídeo'} adicionado: ${item.title}`); });
    prepareContent(item.id);
    res.status(201).json(item);
  } catch (error) { for (const f of files) fs.rmSync(f.path, { force: true }); next(error); }
});
```

`prepareContent` (substituir a função) e helper novo:

```js
function prepareContent(id) {
  if (preparing.has(id)) return;
  const c = store.db.contents.find(x => x.id === id);
  if (!c || (!c.file && !c.images?.length)) return;
  if (media.tools().missing.length) { store.change(d => { const x = d.contents.find(y => y.id === id); x.media.state = 'error'; x.media.error = 'Ferramentas de vídeo ausentes. Execute automation/install-tools.ps1.'; }); return; }
  preparing.add(id);
  store.change(d => { const x = d.contents.find(y => y.id === id); x.media.state = 'preparing'; x.media.error = ''; });
  const work = isPhoto(c.kind) ? preparePhotos(c) : media.prepare(path.join(uploadDir, c.file), renditionDir, id).then(out => ({ media: out }));
  work.then(out => {
    store.change(d => { const x = d.contents.find(y => y.id === id); if (!x) return; if (out.images) x.images = out.images; x.media = { ...x.media, state: 'ready', error: '', ...out.media }; store.log(d, `Mídia preparada: ${x.title}`); });
  }).catch(error => {
    store.change(d => { const x = d.contents.find(y => y.id === id); if (!x) return; x.media.state = 'error'; x.media.error = String(error.stderr || error.message).split('\n').filter(Boolean).slice(-1)[0] || 'Falha ao preparar a mídia.'; store.log(d, `Falha ao preparar: ${x.title}`); });
  }).finally(() => preparing.delete(id));
}
async function preparePhotos(c) {
  const images = [];
  for (const [i, img] of c.images.entries()) images.push({ ...img, ...(await media.preparePhoto(path.join(uploadDir, img.file), renditionDir, `${c.id}-${i + 1}`, c.kind)) });
  return { images, media: { rendition: '', thumb: images[0].rendition, width: images[0].width, height: images[0].height, duration: 0, bytes: images.reduce((t, i) => t + i.bytes, 0) } };
}
```

`POST /api/contents/:id/prepare`: trocar `if (!c.file)` por `if (!c.file && !c.images?.length)`.

`PATCH /api/contents/:id`: depois de `const fields = contentFields(req.body, c);` acrescentar `const erro = kindError(c.kind || 'video', fields.channels, null); if (erro) bad(erro);` (o `kind` do corpo é ignorado: `contentFields` não o devolve, então o tipo nunca muda).

`DELETE /api/contents/:id`: substituir o laço de arquivos por:

```js
  for (const f of [c.file && path.join(uploadDir, c.file), c.media?.rendition && path.join(renditionDir, c.media.rendition), c.media?.thumb && path.join(renditionDir, c.media.thumb), ...(c.images || []).flatMap(i => [i.file && path.join(uploadDir, i.file), i.rendition && path.join(renditionDir, i.rendition)])]) if (f) fs.rmSync(f, { force: true });
```

Claim (`/api/automation/claim`), substituir o bloco `if (job.network === 'instagram') { ... }` por:

```js
      if (job.network === 'instagram' && !job.integrations.igUserId) { store.change(d => applyResult(d, { contentId: job.contentId, network: job.network, status: 'failed', error: 'Informe o ID da conta do Instagram em Redes sociais.' })); continue; }
      // Instagram (vídeo e foto) e Facebook (foto) buscam a mídia por link público temporário.
      const photo = isPhoto(job.kind);
      if (job.network === 'instagram' || (photo && job.network === 'facebook')) {
        try {
          const base = await media.ensureTunnel(SHARE_PORT, path.join(dataDir, 'tunnel.log'));
          if (photo) job.imageUrls = job.images.map(f => base + '/share/' + media.createShareToken(f, shareSecret()));
          else job.publicUrl = base + '/share/' + media.createShareToken(job.fileName, shareSecret());
        } catch (error) { store.change(d => applyResult(d, { contentId: job.contentId, network: job.network, status: 'failed', error: 'Link temporário indisponível: ' + error.message })); continue; }
      }
```

`/api/automation/published`: no `.filter(([n, p]) => …)`, acrescentar `&& !(n === 'facebook' && isPhoto(c.kind))` (a coleta do Facebook usa campos de vídeo; post de foto fica sem coleta).

`shareApp.get('/share/:token')`: header passa a `{ 'Content-Type': /\.jpe?g$/i.test(data.file) ? 'image/jpeg' : 'video/mp4' }`.

Handler de erro (`app.use((error, …`): mensagens `error.code === 'LIMIT_FILE_SIZE' ? 'O arquivo deve ter até 500 MB.' : error.code === 'LIMIT_FILE_COUNT' ? 'Envie no máximo 10 fotos.' : …`.

- [ ] **Step 7: Run** `npm run check && npm test` → PASS (inclui o teste antigo de vídeo inválido → 400)

- [ ] **Step 8: Commit**

```bash
git add server.mjs lib/queue.mjs tests/fotos.test.mjs tests/server.test.mjs
git commit -m "Canal: painel aceita imagem e carrossel, prepara as fotos e entrega links ao n8n"
```

---

### Task 6: Mock da Meta com imagem e carrossel

**Files:**
- Modify: `automation/mock-platforms.mjs` (`redeDe`, `/media`, `/media_publish`, novas `/photos` e `/feed`)
- Test: `tests/simulacao.test.mjs`

**Interfaces:**
- Produces (contrato da Graph API): `POST /graph/:v/:ig/media {image_url[, is_carousel_item]}` → `{id}`; `{media_type:'CAROUSEL', children:'id1,id2', caption}` → `{id}` (estado via `GET ?fields=status_code`); `POST /graph/:v/:page/photos {url, published:false}` → `{id}`; `POST /graph/:v/:page/feed {message, attached_media:[{media_fbid}]}` → `{id:'<page>_<n>'}`.

- [ ] **Step 1: Write the failing test** (novo `test` em `tests/simulacao.test.mjs`)

```js
test('mock publica imagem e carrossel no Instagram e post de fotos no Facebook', async () => {
  await call('/__mock/limpar', { method: 'POST' });
  const foto = `${shareBase}/share/ok`;
  const espera = async id => { let s; for (let i = 0; i < 3; i++) s = await statusIG(id); return s.body.status_code; };
  const img = await call('/graph/v21.0/17841/media', { method: 'POST', body: { image_url: foto, caption: 'Oi' } });
  assert.equal(await espera(img.body.id), 'FINISHED');
  assert.match((await call(`/graph/v21.0/17841/media_publish?creation_id=${img.body.id}`, { method: 'POST' })).body.id, /^igm/);
  const filhos = [];
  for (let i = 0; i < 2; i++) filhos.push((await call('/graph/v21.0/17841/media', { method: 'POST', body: { image_url: foto, is_carousel_item: true } })).body.id);
  const ruim = await call('/graph/v21.0/17841/media', { method: 'POST', body: { media_type: 'CAROUSEL', children: filhos[0], caption: 'x' } });
  assert.equal(await espera(ruim.body.id), 'ERROR');
  const car = await call('/graph/v21.0/17841/media', { method: 'POST', body: { media_type: 'CAROUSEL', children: filhos.join(','), caption: 'x' } });
  assert.equal(await espera(car.body.id), 'FINISHED');
  const pub = await call(`/graph/v21.0/17841/media_publish?creation_id=${car.body.id}`, { method: 'POST' });
  assert.match((await call(`/graph/v21.0/${pub.body.id}?fields=permalink`)).body.permalink, /instagram\.com\/p\//);
  const ids = [];
  for (let i = 0; i < 2; i++) ids.push((await call('/graph/v21.0/663/photos', { method: 'POST', body: { url: foto, published: false } })).body.id);
  const feed = await call('/graph/v21.0/663/feed', { method: 'POST', body: { message: 'Oi', attached_media: ids.map(id => ({ media_fbid: id })) } });
  assert.match(feed.body.id, /^663_/);
  assert.equal((await call('/graph/v21.0/663/feed', { method: 'POST', body: { message: 'x', attached_media: [{ media_fbid: 'naoexiste' }] } })).status, 400);
  await modo('facebook', 'recusado');
  assert.equal((await call('/graph/v21.0/663/photos', { method: 'POST', body: { url: foto, published: false } })).status, 400);
  await modo('facebook', 'ok');
  assert.deepEqual((await call('/__mock/estado')).body.publicacoes.map(p => p.rede), ['instagram', 'instagram', 'facebook']);
});
```

- [ ] **Step 2: Run** `node --test tests/simulacao.test.mjs` → FAIL

- [ ] **Step 3: Implement** (`automation/mock-platforms.mjs`)

Em `redeDe`, antes de `if (/\/media(_publish)?$/.test(p)) return 'instagram';`:

```js
    if (/\/(photos|feed)$/.test(p)) return 'facebook';
```

Substituir `app.post('/graph/:v/:igUserId/media', …)` por:

```js
  app.post('/graph/:v/:igUserId/media', async (req, res) => {
    const b = req.body || {};
    const id = novoId('igc');
    const carrossel = b.media_type === 'CAROUSEL';
    const o = { rede: 'instagram', tipo: b.is_carousel_item ? 'item' : 'container', formato: carrossel ? 'carrossel' : b.image_url ? 'imagem' : 'reel', consultas: 0, status_code: 'IN_PROGRESS', status: 'In progress', legenda: String(b.caption || '') };
    estado.objetos.set(id, o);
    if (carrossel) {
      const filhos = String(b.children || '').split(',').filter(Boolean);
      o.download = filhos.length >= 2 && filhos.length <= 10 && filhos.every(f => estado.objetos.get(f)?.tipo === 'item');
      o.motivo = o.download ? '' : 'children inválidos: precisa de 2 a 10 itens de carrossel';
    } else {
      const url = String(b.video_url || b.image_url || '');
      try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); await r.body?.cancel(); o.download = r.ok; o.motivo = r.ok ? '' : `HTTP ${r.status}`; } catch (error) { o.download = false; o.motivo = error.message; }
    }
    res.json({ id });
  });
```

Em `media_publish`, depois de `const id = novoId('igm');`: `const link = (c.formato === 'reel' ? 'https://www.instagram.com/reel/' : 'https://www.instagram.com/p/') + id + '/';` e usar `link` nos dois lugares onde hoje está `'https://www.instagram.com/reel/' + id + '/'`.

Novas rotas, depois de `/rupload/video-reels/:videoId`:

```js
  // ---------- Meta: Facebook fotos ----------
  app.post('/graph/:v/:pageId/photos', async (req, res) => {
    if (recusado(req)) return res.status(400).json({ error: { message: 'Photo could not be processed (simulação).', type: 'GraphMethodException', code: 324, error_user_msg: 'Foto não aceita (simulação).' } });
    const url = String(req.body?.url || '');
    try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); await r.body?.cancel(); if (!r.ok) throw new Error('HTTP ' + r.status); }
    catch (error) { return res.status(400).json({ error: { message: `Could not fetch photo URL (${error.message}) (simulação).`, code: 100 } }); }
    const id = novoId('fbp');
    const publicada = req.body?.published !== false;
    estado.objetos.set(id, { rede: 'facebook', tipo: 'foto', publicada });
    if (!publicada) return res.json({ id });
    const post = req.params.pageId + '_' + id;
    publicar('facebook', post, { fotos: 1, url: 'https://www.facebook.com/' + post });
    res.json({ id, post_id: post });
  });
  app.post('/graph/:v/:pageId/feed', (req, res) => {
    const anexos = (req.body?.attached_media || []).map(a => String(a.media_fbid || ''));
    if (!anexos.length || !anexos.every(f => estado.objetos.get(f)?.tipo === 'foto')) return res.status(400).json({ error: { message: 'Invalid attached_media (simulação).', type: 'GraphMethodException', code: 100 } });
    const id = req.params.pageId + '_' + novoId('');
    publicar('facebook', id, { fotos: anexos.length, url: 'https://www.facebook.com/' + id });
    res.json({ id });
  });
```

- [ ] **Step 4: Run** `node --test tests/simulacao.test.mjs && npm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add automation/mock-platforms.mjs tests/simulacao.test.mjs
git commit -m "Canal: simulador da Meta com imagem, carrossel e post de fotos do Facebook"
```

---

### Task 7: Fluxos do n8n para fotos

**Files:**
- Modify: `automation/create-workflows.mjs`, `automation/workflows.json` (regenerado)
- Test: `tests/simulacao.test.mjs`

**Interfaces:**
- Consumes: trabalho com `kind`, `imageUrls`, `text`, `integrations.{igUserId,pageId}` (Task 5); rotas do mock (Task 6).
- Produces: saídas `instagram-fotos` (4) e `facebook-fotos` (5) no switch "Por rede"; resultado `published` com URL `https://www.instagram.com/p/…` ou `https://www.facebook.com/<page>_<id>`.

- [ ] **Step 1: Write the failing test** (novo `test` em `tests/simulacao.test.mjs`)

```js
test('fluxo de publicação tem os ramos de fotos e todas as ligações apontam para nós existentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-sim-'));
  execFileSync(process.execPath, [path.join(root, 'automation', 'create-workflows.mjs'), '--simulate'], { env: { ...process.env, NGD_DATA_DIR: dir, NGD_MOCK_URL: 'http://127.0.0.1:1' }, stdio: 'pipe' });
  const fluxos = JSON.parse(fs.readFileSync(path.join(dir, 'workflows.simulado.json'), 'utf8'));
  const pub = fluxos.find(w => w.id === 'ngdPublishQueue01');
  const nomes = new Set(pub.nodes.map(n => n.name));
  for (const n of ['IGF: trabalho', 'IGF: criar carrossel', 'IGF: criar imagem', 'IGF: publicar', 'FBF: trabalho', 'FBF: enviar foto', 'FBF: publicar post', 'Registrar sucesso Instagram fotos', 'Registrar sucesso Facebook fotos']) assert.ok(nomes.has(n), n);
  for (const [de, saida] of Object.entries(pub.connections)) { assert.ok(nomes.has(de), de); for (const ramo of saida.main) for (const l of ramo) assert.ok(nomes.has(l.node), `${de} → ${l.node}`); }
  const porRede = pub.nodes.find(n => n.name === 'Por rede');
  assert.deepEqual(porRede.parameters.rules.values.map(v => v.outputKey), ['youtube', 'facebook', 'instagram', 'tiktok', 'instagram-fotos', 'facebook-fotos']);
  assert.equal(pub.connections['Por rede'].main.length, 6);
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run** `node --test tests/simulacao.test.mjs` → FAIL

- [ ] **Step 3: Implement** (`automation/create-workflows.mjs`)

Ajudante (perto de `splitOut`):

```js
const aggregate = (name, position, field) => ({ id: slug(name), name, type: 'n8n-nodes-base.aggregate', typeVersion: 1, position, parameters: { fieldsToAggregate: { fieldToAggregate: [{ fieldToAggregate: field }] }, options: {} } });
```

`resultBody` e `failBody` passam a receber o trabalho (padrão `JOB`); a lista de mensagens de `failBody` continua **exatamente** a atual:

```js
const resultBody = (network, extra, job = JOB) => `={{ JSON.stringify({ contentId: ${job}.contentId, network: '${network}', ${extra} }) }}`;
const failBody = (network, job = JOB) => resultBody(network, `status: 'failed', error: String([/* lista atual, sem mudança */].find(v => v) || 'Falha não informada.').slice(0, 900)`, job);
```

Constantes (o painel manda no máximo um trabalho de foto por rede por ciclo, então `.first()` é seguro):

```js
const IGJ = "$('IGF: trabalho').first().json";
const FBJ = "$('FBF: trabalho').first().json";
```

Switch "Por rede":

```js
  switchNode('Por rede', pos(3, 1), "={{ $json.network + (['image', 'carousel'].includes($json.kind) ? '-fotos' : '') }}", ['youtube', 'facebook', 'instagram', 'tiktok', 'instagram-fotos', 'facebook-fotos']),
```

Nós novos (fim de `publishNodes`):

```js
  // Instagram fotos (imagem única ou carrossel)
  setNode('IGF: trabalho', pos(4, 8), [], true),
  ifNode('IGF: é carrossel?', pos(5, 8), "={{ $json.kind === 'carousel' }}"),
  splitOut('IGF: dividir fotos', pos(6, 7.5), 'imageUrls'),
  http('IGF: criar item', pos(7, 7.5), { method: 'POST', url: `=${GRAPH}/{{ ${IGJ}.integrations.igUserId }}/media`, auth: 'meta', body: '={{ JSON.stringify({ image_url: $json.imageUrls, is_carousel_item: true }) }}', timeout: 300000 }),
  aggregate('IGF: juntar itens', pos(8, 7.5), 'id'),
  ifNode('IGF: itens ok?', pos(9, 7.5), `={{ ($json.id || []).filter(Boolean).length === ${IGJ}.imageUrls.length }}`),
  http('IGF: criar carrossel', pos(10, 7.5), { method: 'POST', url: `=${GRAPH}/{{ ${IGJ}.integrations.igUserId }}/media`, auth: 'meta', body: `={{ JSON.stringify({ media_type: "CAROUSEL", children: $json.id.join(","), caption: ${IGJ}.text }) }}`, timeout: 300000 }),
  http('IGF: criar imagem', pos(6, 8.5), { method: 'POST', url: `=${GRAPH}/{{ $json.integrations.igUserId }}/media`, auth: 'meta', body: '={{ JSON.stringify({ image_url: $json.imageUrls[0], caption: $json.text }) }}', timeout: 300000 }),
  setNode('IGF: contêiner', pos(11, 8), [['containerId', '={{ $json.id || "" }}']]),
  ifNode('IGF criou?', pos(12, 8), '={{ !!$json.containerId && !$json.error }}'),
  wait('IGF: aguardar', pos(13, 7.5), 5),
  http('IGF: consultar estado', pos(14, 7.5), { method: 'GET', url: `=${GRAPH}/{{ $('IGF: contêiner').first().json.containerId }}`, auth: 'meta', query: { fields: 'status_code,status' } }),
  switchNode('IGF: estado', pos(15, 7.5), '={{ $json.status_code === "FINISHED" ? "ok" : ($json.status_code === "IN_PROGRESS" && $runIndex < 25) ? "wait" : "fail" }}', ['ok', 'wait', 'fail']),
  http('IGF: publicar', pos(16, 7), { method: 'POST', url: `=${GRAPH}/{{ ${IGJ}.integrations.igUserId }}/media_publish`, auth: 'meta', query: { creation_id: "={{ $('IGF: contêiner').first().json.containerId }}" }, timeout: 300000 }),
  http('IGF: obter link', pos(17, 7), { method: 'GET', url: `=${GRAPH}/{{ $json.id }}`, auth: 'meta', query: { fields: 'permalink' } }),
  ifNode('IGF publicou?', pos(18, 7), '={{ !!$json.permalink && !$json.error }}'),
  panel('Registrar sucesso Instagram fotos', pos(19, 6.5), 'result', resultBody('instagram', "status: 'published', externalId: $json.id, url: $json.permalink", IGJ)),
  panel('Registrar falha Instagram fotos', pos(19, 8.5), 'result', failBody('instagram', IGJ)),
  panel('Registrar foto recusada Instagram', pos(10, 6.5), 'result', resultBody('instagram', "status: 'failed', error: 'Uma das fotos do carrossel não foi aceita pelo Instagram.'", IGJ)),

  // Facebook fotos: cada foto sobe sem publicar e um post único junta todas (vale para 1 foto também)
  setNode('FBF: trabalho', pos(4, 10), [], true),
  splitOut('FBF: dividir fotos', pos(5, 10), 'imageUrls'),
  http('FBF: enviar foto', pos(6, 10), { method: 'POST', url: `=${GRAPH}/{{ ${FBJ}.integrations.pageId }}/photos`, auth: 'meta', body: '={{ JSON.stringify({ url: $json.imageUrls, published: false }) }}', timeout: 300000 }),
  aggregate('FBF: juntar fotos', pos(7, 10), 'id'),
  ifNode('FBF: fotos ok?', pos(8, 10), `={{ ($json.id || []).filter(Boolean).length === ${FBJ}.imageUrls.length }}`),
  http('FBF: publicar post', pos(9, 9.5), { method: 'POST', url: `=${GRAPH}/{{ ${FBJ}.integrations.pageId }}/feed`, auth: 'meta', body: `={{ JSON.stringify({ message: ${FBJ}.text, attached_media: $json.id.map(id => ({ media_fbid: id })) }) }}`, timeout: 300000 }),
  ifNode('FBF publicou?', pos(10, 9.5), '={{ !!$json.id && !$json.error }}'),
  panel('Registrar sucesso Facebook fotos', pos(11, 9), 'result', resultBody('facebook', "status: 'published', externalId: $json.id, url: 'https://www.facebook.com/' + $json.id", FBJ)),
  panel('Registrar falha Facebook fotos', pos(11, 10.5), 'result', failBody('facebook', FBJ)),
  panel('Registrar foto recusada Facebook', pos(9, 11), 'result', resultBody('facebook', "status: 'failed', error: 'Uma das fotos não foi aceita pelo Facebook.'", FBJ)),
```

Ligações novas (acrescentar à lista de `connect([...])` do fluxo `publish`):

```js
  ['Por rede', 'IGF: trabalho', 4], ['Por rede', 'FBF: trabalho', 5],
  ['IGF: trabalho', 'IGF: é carrossel?'], ['IGF: é carrossel?', 'IGF: dividir fotos', 0], ['IGF: é carrossel?', 'IGF: criar imagem', 1],
  ['IGF: dividir fotos', 'IGF: criar item'], ['IGF: criar item', 'IGF: juntar itens'], ['IGF: juntar itens', 'IGF: itens ok?'],
  ['IGF: itens ok?', 'IGF: criar carrossel', 0], ['IGF: itens ok?', 'Registrar foto recusada Instagram', 1],
  ['IGF: criar carrossel', 'IGF: contêiner'], ['IGF: criar imagem', 'IGF: contêiner'], ['IGF: contêiner', 'IGF criou?'],
  ['IGF criou?', 'IGF: aguardar', 0], ['IGF criou?', 'Registrar falha Instagram fotos', 1],
  ['IGF: aguardar', 'IGF: consultar estado'], ['IGF: consultar estado', 'IGF: estado'],
  ['IGF: estado', 'IGF: publicar', 0], ['IGF: estado', 'IGF: aguardar', 1], ['IGF: estado', 'Registrar falha Instagram fotos', 2],
  ['IGF: publicar', 'IGF: obter link'], ['IGF: obter link', 'IGF publicou?'], ['IGF publicou?', 'Registrar sucesso Instagram fotos', 0], ['IGF publicou?', 'Registrar falha Instagram fotos', 1],
  ['FBF: trabalho', 'FBF: dividir fotos'], ['FBF: dividir fotos', 'FBF: enviar foto'], ['FBF: enviar foto', 'FBF: juntar fotos'], ['FBF: juntar fotos', 'FBF: fotos ok?'],
  ['FBF: fotos ok?', 'FBF: publicar post', 0], ['FBF: fotos ok?', 'Registrar foto recusada Facebook', 1],
  ['FBF: publicar post', 'FBF publicou?'], ['FBF publicou?', 'Registrar sucesso Facebook fotos', 0], ['FBF publicou?', 'Registrar falha Facebook fotos', 1],
```

Nota "Como funciona": "busca no painel os vídeos vencidos" → "busca no painel os vídeos e fotos vencidos".

- [ ] **Step 4: Run** `node --test tests/simulacao.test.mjs` → PASS

- [ ] **Step 5: Regenerar os fluxos versionados** — `node automation/create-workflows.mjs --only-bridge` e **apagar** `data/n8n-import-credential.json` logo depois, sem importar (credenciais reais do n8n não podem ser sobrescritas). `git diff --stat automation/workflows.json`: só o fluxo de publicação muda.

- [ ] **Step 6: Run** `npm test` → PASS

- [ ] **Step 7: Commit**

```bash
git add automation/create-workflows.mjs automation/workflows.json tests/simulacao.test.mjs
git commit -m "Canal: fluxo do n8n publica imagem e carrossel no Instagram e no Facebook"
```

---

### Task 8: Painel — escolher tipo, enviar fotos e ver no cartão

**Files:**
- Modify: `public/index.html` (editor), `public/app.js` (editor, cartão, registro manual), `public/style.css`

**Interfaces:**
- Consumes: `POST /api/contents` com `kind` e `images` (Task 5); `c.kind`, `c.images[].rendition`.

- [ ] **Step 1: Editor (`public/index.html`)** — logo antes de `<div id="file-area">`:

```html
<fieldset id="kind-area"><legend>Tipo de conteúdo</legend><div class="kind-picker"><label><input type="radio" name="kind" value="video" checked>Vídeo</label><label><input type="radio" name="kind" value="image">Imagem</label><label><input type="radio" name="kind" value="carousel">Carrossel</label></div></fieldset>
```

e logo depois do `</div>` de `file-area`:

```html
<div id="photo-area" hidden><label class="upload-zone" for="photos"><span class="upload-symbol">↑</span><strong id="photos-label">Escolha a foto</strong><span>JPG, PNG ou WebP · até 30 MB cada · o painel gera a versão certa para o Instagram (1080×1350 no carrossel)</span><input type="file" id="photos" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"></label><ol id="photo-list" class="photo-list"></ol></div>
```

- [ ] **Step 2: Lógica (`public/app.js`)**

Variáveis do topo: `let photos = [], photoUrls = [];` e `const PHOTO_NETS = ['instagram', 'facebook', 'linkedin'];`.

Funções novas (antes de `openEditor`):

```js
function editingKind(){ return editing ? (state.contents.find(c=>c.id===editing)?.kind||'video') : ($('#content-form').elements.kind.value||'video'); }
function applyKind(){ const k=editingKind(), photo=k!=='video'; $('#kind-area').hidden=!!editing; $('#file-area').hidden=!!editing||photo; $('#photo-area').hidden=!!editing||!photo; $('#video').required=!editing&&!photo; $('#photos').multiple=k==='carousel'; $('#photos-label').textContent=k==='carousel'?'Escolha de 2 a 10 fotos (na ordem do carrossel)':'Escolha a foto'; $('#content-form').querySelectorAll('[name=channels]').forEach(el=>{const off=photo&&!PHOTO_NETS.includes(el.value);el.disabled=off;if(off)el.checked=false;el.closest('label').classList.toggle('is-disabled',off);el.closest('label').title=off?'Fotos ainda não são publicadas nesta rede.':'';}); }
function renderPhotos(){ photoUrls.forEach(u=>URL.revokeObjectURL(u)); photoUrls=photos.map(f=>URL.createObjectURL(f)); $('#photo-list').innerHTML=photos.map((f,i)=>`<li><img src="${photoUrls[i]}" alt=""><span>${i+1}. ${esc(f.name)}</span><button type="button" class="button secondary small" data-remove-photo="${i}">Remover</button></li>`).join(''); }
```

Em `openEditor`, depois da linha que monta `#channel-picker`: `photos=[]; renderPhotos(); applyKind();`. Esconder `#video-preview` quando `c && c.kind!=='video'`. Em `#media-info`, se `c && c.kind!=='video'`, mostrar `` `${c.images.length} foto${c.images.length>1?'s':''}${c.media?.state==='ready'?` preparada${c.images.length>1?'s':''} em ${c.media.width}×${c.media.height}`:c.media?.error?` com erro: ${c.media.error}`:' em preparo'}.` ``; senão, o texto atual de vídeo.

Ouvintes (junto dos do editor):

```js
$('#content-form').addEventListener('change',e=>{ if(e.target.name==='kind'){ photos=[]; renderPhotos(); applyKind(); } });
$('#photos').addEventListener('change',()=>{ const novas=[...$('#photos').files]; photos=editingKind()==='carousel'?[...photos,...novas].slice(0,10):novas.slice(0,1); $('#photos').value=''; renderPhotos(); const t=$('#content-form').elements.title; if(!t.value&&photos[0]) t.value=photos[0].name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' '); });
$('#photo-list').addEventListener('click',e=>{ const b=e.target.closest('[data-remove-photo]'); if(!b) return; photos.splice(Number(b.dataset.removePhoto),1); renderPhotos(); });
```

No `submit` do `#content-form`: declarar `const k=editingKind();` logo depois de `const wasNew=!editing;`. No ramo de criação, antes do código do vídeo:

```js
if(k!=='video'){ if(k==='image'&&photos.length!==1) throw new Error('Escolha 1 foto.'); if(k==='carousel'&&(photos.length<2||photos.length>10)) throw new Error('O carrossel precisa de 2 a 10 fotos.'); if(photos.some(f=>f.size>30*1024*1024)) throw new Error('Cada foto deve ter até 30 MB.'); data.append('kind',k); photos.forEach(f=>data.append('images',f)); }
else { /* código atual do vídeo, inalterado */ }
```

Toast final: `toast(wasNew ? (k!=='video' ? 'Fotos salvas. Preparando a versão do Instagram…' : 'Vídeo salvo. Preparando a versão 9:16…') : 'Conteúdo salvo.')`.

Cartão (`card`): em `card-badges`, depois de `mediaBadge(c)`, acrescentar ``${c.kind==='carousel'?`<span class="badge">Carrossel · ${c.images.length} fotos</span>`:c.kind==='image'?'<span class="badge">Imagem</span>':''}``. Em `MEDIA.error`, rótulo `'Erro no vídeo'` → `'Erro na mídia'`.

Registro manual (`openManual`), depois do bloco do `dl`:

```js
dl.dataset.label ??= dl.textContent;
const extra = $('#manual-photos') || (() => { const p=document.createElement('p'); p.id='manual-photos'; dl.after(p); return p; })();
if(c.kind!=='video'&&c.images?.length){ dl.href='/media/prepared/'+encodeURIComponent(c.images[0].rendition); dl.download='foto-1.jpg'; dl.hidden=false; dl.textContent=c.images.length>1?`Baixar foto 1 de ${c.images.length}`:'Baixar foto'; extra.innerHTML=c.images.slice(1).map((im,i)=>`<a href="/media/prepared/${encodeURIComponent(im.rendition)}" download="foto-${i+2}.jpg">Foto ${i+2}</a>`).join(' · '); }
else { dl.textContent=dl.dataset.label; extra.innerHTML=''; }
```

- [ ] **Step 3: Estilo (`public/style.css`, no fim)**

```css
.kind-picker{display:flex;gap:16px;flex-wrap:wrap}
.channel-picker label.is-disabled{opacity:.45;cursor:not-allowed}
.photo-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}
.photo-list li{display:grid;grid-template-columns:56px 1fr auto;align-items:center;gap:12px}
.photo-list img{width:56px;height:70px;object-fit:cover;border-radius:6px;border:1px solid #e2e6ea}
.photo-list span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

- [ ] **Step 4: Run** `npm run check && npm test` → PASS

- [ ] **Step 5: Verificar no navegador** (`http://localhost:3210/#contents` → Novo conteúdo):
  - Carrossel: escolher 3 fotos, remover 1, ver YouTube e TikTok desativados, salvar **sem data** (rascunho, nada publica). Cartão: "Carrossel · 2 fotos" → "Pronto para publicar", capa em 4:5.
  - `http://localhost:3210/media/prepared/<id>-1.jpg` em 1080×1350.
  - Imagem: 1 foto paisagem → preparada na proporção original.
  - Vídeo continua igual.
  - Console sem erro de CSP. Apagar os rascunhos de teste no fim.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "Painel: novo conteúdo com tipo Imagem e Carrossel, miniaturas e selo no cartão"
```

---

### Task 9: Instalar no n8n real e conferir de ponta a ponta

**Files:** nenhum código novo (só documentação no fim).

- [ ] **Step 1: Backup** — `cp data/n8n/.n8n/database.sqlite data/backup/n8n-database-antes-fotos-$(date +%Y%m%d-%H%M).sqlite` e `cp data/dashboard.json data/backup/dashboard-antes-fotos.json`.

- [ ] **Step 2: Simulação completa** — `automation/simular.ps1` (mock + fluxos simulados); no painel, um carrossel de 2 fotos e uma imagem com Instagram+Facebook → "Publicar agora". Esperado: os dois "Publicado" com links `instagram.com/p/…` e `facebook.com/663…_…`; `GET http://127.0.0.1:3212/__mock/estado` mostra 2 publicações por rede. Voltar ao normal com `automation/start-local.ps1 -Reiniciar` e reimportar os fluxos reais (Step 3). **Antes**, conferir no `simular.ps1` se ele isola os dados (`NGD_DATA_DIR`); se não isolar, fazer esta simulação só depois de 10/10, quando a fila de vídeos terminar, ou pular para o Step 3.

- [ ] **Step 3: Importar o fluxo real**

```powershell
node automation/n8n.mjs import:workflow --input=automation/workflows.json
node automation/n8n.mjs publish:workflow --id=ngdPublishQueue01
& automation/start-local.ps1 -Reiniciar
```

Em `http://localhost:5678`: "NGD · Publicar fila" ativo; nós de fotos com a credencial **NGD · Meta (token da Página)** e o YouTube com a credencial já reconectada.

- [ ] **Step 4: Fila intacta** — `GET /api/state`: os vídeos de 01–10/10 continuam `planned`, `kind: 'video'`, mesmas datas e textos; teste de conexão de YouTube, Facebook e Instagram em Redes sociais continua verde.

- [ ] **Step 5: Publicação real só com autorização** — perguntar ao usuário se quer um post real de teste (carrossel de 2 fotos da NGD). Só com "sim": criar, "Publicar agora", conferir os links no Instagram e na Página grande.

- [ ] **Step 6: Registro** — seção "Fotos (imagem e carrossel)" em `docs/sistema-central-ngd.md`: tipos, formato 1080×1350, redes, uma foto por rede por ciclo, coleta de métricas sem posts de foto do Facebook.

```bash
git add docs/sistema-central-ngd.md
git commit -m "Canal: documenta publicação de imagem e carrossel"
```
