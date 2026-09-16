# Distribuição automática NGD · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um vídeo entra no painel (upload ou link do Instagram), é padronizado, e o n8n local publica nas redes escolhidas no horário planejado, devolvendo link, erro e métricas ao painel.

**Architecture:** O servidor Express local guarda o estado em `data/dashboard.json` e oferece rotas de ponte autenticadas por token; o n8n Community roda os fluxos de publicação usando credenciais que só ele conhece; ffmpeg/yt-dlp/cloudflared portáteis fazem conversão, importação e o link público temporário que a API do Instagram exige.

**Tech Stack:** Node 22 (ESM), Express 5, multer, `node:test`; n8n 2.39.6 em `.runtime/n8n`; ffmpeg 9, yt-dlp, cloudflared em `.runtime/tools`; front em JS puro sem build.

**Spec:** `docs/superpowers/specs/2026-09-16-distribuicao-automatica-design.md`

## Global Constraints

- Custo zero: nenhum serviço pago, nenhuma API de IA.
- Serviços escutam só em 127.0.0.1; a única exposição é o túnel cloudflared temporário para `/share/:token`.
- Credenciais de redes ficam só no n8n. O painel nunca recebe senha ou token social.
- Visual do painel é mantido; `style.css` só ganha classes novas.
- Datas em ISO 8601 UTC no disco; exibição em `pt-BR` no fuso do computador.
- Textos da interface em PT-BR, sem prometer publicação que não aconteceu.

---

### Task 1: `lib/store.mjs` (persistência + migração)

**Files:** Create `lib/store.mjs`; Modify `server.mjs`; Test `tests/store.test.mjs`.

**Interfaces:** `createStore(dataDir)` → `{ get db(), change(fn), log(d, msg) }`; `migrateContent(content)` garante `source`, `media`, `texts`, `hashtags`, `posts` (entrada `pending` por rede em `channels`).

- [ ] Teste: registro antigo (sem `posts`) carregado do disco ganha `posts.youtube.status === 'pending'` e `media.state === 'ready'` (usa o arquivo original quando não há renderização).
- [ ] Implementar; `npm test`; commit.

### Task 2: `lib/media.mjs` (ferramentas, probe, prepare, import, share, tunnel)

**Files:** Create `lib/media.mjs`; Test `tests/media.test.mjs` (auto-ignora sem ffmpeg).

**Interfaces:** `tools()` → `{ ffmpeg, ffprobe, ytdlp, cloudflared, missing[] }`; `probe(file)` → `{ duration, width, height, hasAudio }`; `prepare(inputPath, outDir, id)` → `{ rendition, thumb, duration, width, height }`; `importVideo(url, outDir, id, { cookies })` → `{ file, title, description, duration }`; `createShareToken(file, secret, ttlMs)` / `verifyShareToken(token, secret)`; `ensureTunnel(port)` → `Promise<publicBaseUrl>`.

- [ ] Teste: `verifyShareToken` aceita token válido, rejeita expirado e adulterado.
- [ ] Teste condicional: vídeo sintético 2 s (`testsrc`), `prepare` produz 1080x1920 e capa.
- [ ] Implementar; commit.

### Task 3: `lib/queue.mjs` (fila por rede)

**Files:** Create `lib/queue.mjs`; Test `tests/queue.test.mjs`.

**Interfaces:** `AUTOMATED = ['youtube','facebook','instagram','tiktok']`; `syncStatus(content)`; `claimJobs(db, now)` → jobs (sem `publicUrl`; o servidor acrescenta); `applyResult(db, { contentId, network, status, url, externalId, error })`; `expireStuck(db, now, ttlMs)`.

- [ ] Testes: claim ignora não vencidos, mídia não pronta e linkedin; marca `queued`; segundo claim não repete; result `published` deriva `status`; preso > 30 min vira `failed`.
- [ ] Implementar; commit.

### Task 4: Rotas do servidor

**Files:** Modify `server.mjs`; Test `tests/server.test.mjs`.

- [ ] Ponte: `claim`, `result`, `connection`, `published`, `metrics`, `prepare` (mantida).
- [ ] Painel: `import`, `contents/:id/prepare`, `publish`, `retry`, `manual`, `networks/:n/test`, `media/thumb`.
- [ ] Servidor de share na 3211 (`/share/:token`).
- [ ] Testes: 401 sem token; `manual` grava url; `publish` sem n8n responde com fila marcada e aviso.
- [ ] Commit.

### Task 5: Fluxos do n8n

**Files:** Modify `automation/create-workflows.mjs`; regenerar `automation/workflows.json`; Modify `automation/README.md`.

- [ ] Gerar 4 fluxos (verificar conexão, publicar fila, testar conexão, coletar resultados).
- [ ] Importar, publicar, reiniciar n8n; confirmar no editor pelo navegador que os nós não acusam parâmetro inválido.
- [ ] Commit.

### Task 6: Painel

**Files:** Modify `public/app.js`, `public/index.html`, `public/style.css`.

- [ ] Conteúdos: capa, estado da mídia, chips por rede, publicar agora, importar do Instagram.
- [ ] Editor: hashtags, textos por rede.
- [ ] Redes: estado real, testar conexão, campos extra, guia.
- [ ] Automações: fila, executar agora, túnel.
- [ ] Resultados e visão geral com dados reais.
- [ ] Verificar no navegador; commit.

### Task 7: Documentação e inicialização

**Files:** Modify `README.md`, `automation/README.md`, `automation/start-local.ps1`.

- [ ] Checklist do que só o usuário faz (Google Cloud, Meta, TikTok).
- [ ] Commit final.
