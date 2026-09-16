# Central NGD · Distribuição automática de vídeos (desenho)

Data: 2026-09-16. Contexto: o painel e o n8n local já existem (entrega inicial). Este desenho cobre a etapa que faltava: importar vídeos, preparar o arquivo, publicar em cada rede pelo n8n e trazer resultado de volta ao painel. Orçamento: zero. Tudo roda no computador da loja.

## Objetivo

Colocar um vídeo uma vez (upload ou link do Instagram) e o sistema publicar nas redes escolhidas, no horário planejado, registrando link, falha e métricas por rede. O visual do painel é mantido.

## Fora de escopo

- Hospedagem externa, serviços pagos, API de IA paga.
- LinkedIn automático (a API exige aprovação de parceiro). Fica como "manual assistido".
- TikTok público antes da auditoria do app (a API só permite privado). O fluxo publica como privado até a auditoria; o painel avisa.
- Geração automática de legenda por modelo de linguagem.

## Componentes

### 1. Ferramentas portáteis (`.runtime/tools`)

`automation/install-tools.ps1` baixa ffmpeg/ffprobe, yt-dlp e cloudflared. Nenhum instalador, nenhum admin. Reproduzível no outro computador.

### 2. Servidor do painel (`server.mjs` + `lib/`)

Dividido em módulos:

- `lib/store.mjs`: leitura/gravação atômica de `data/dashboard.json`, migração de registros antigos, log de atividade.
- `lib/media.mjs`: caminhos das ferramentas, `probe` (ffprobe), `prepare` (renderização 1080x1920 H.264/AAC com fundo desfocado quando o vídeo não é 9:16, capa JPG), `importInstagram` (yt-dlp com metadados), tokens de compartilhamento temporário e túnel cloudflared sob demanda.
- `lib/queue.mjs`: reconciliação de estado por rede, `claim` de trabalhos vencidos, registro de resultado, expiração de trabalhos presos.

Modelo de conteúdo (datas em ISO 8601 UTC):

```
{
  id, title, caption, hashtags, channels[], scheduledAt, status,   // status: draft | planned | published | attention
  file, originalName, bytes, createdAt,
  source: { type: 'upload' | 'instagram', url, importedCaption },
  media:  { state: 'importing'|'preparing'|'ready'|'error', rendition, thumb, duration, width, height, error },
  texts:  { [network]: string },                                   // legenda específica por rede (opcional)
  posts:  { [network]: { status, url, externalId, error, attempts, updatedAt, claimedAt, metrics } }
}
```

Estados de `posts[rede].status`: `pending` → `queued` → `published` | `failed`; `manual` (LinkedIn, ou TikTok/qualquer rede quando o usuário publica pelo app e cola o link). `status` do conteúdo é derivado: `published` quando todas as redes escolhidas estão publicadas/manuais concluídas; `attention` quando alguma falhou.

Conexões: `connections[rede] = { connected, account, checkedAt, error }`, gravadas pelo teste de conexão.

Configurações por rede em `profiles[rede]`: link do perfil e, quando necessário, `pageId` (Facebook), `igUserId` (Instagram), `privacy` (TikTok).

Rotas novas (mesmas regras de origem local):

| Rota | Função |
|---|---|
| `POST /api/import` `{url}` | cria o conteúdo em estado `importing`, baixa via yt-dlp, prepara |
| `POST /api/contents/:id/prepare` | reprocessa a renderização |
| `POST /api/contents/:id/publish` `{networks?}` | marca pendente agora e aciona o webhook de publicação do n8n |
| `POST /api/contents/:id/retry` `{network}` | volta a rede para `pending` |
| `POST /api/contents/:id/manual` `{network,url}` | registra publicação manual |
| `POST /api/networks/:network/test` | aciona o teste de conexão no n8n e grava o resultado |
| `GET /media/thumb/:file` | capa |

Rotas da ponte (cabeçalho `X-NGD-Automation`):

| Rota | Função |
|---|---|
| `POST /api/automation/claim` | devolve trabalhos vencidos (`scheduledAt <= agora`, mídia pronta, rede automatizável) e marca `queued`. Para Instagram inclui `publicUrl` temporária |
| `POST /api/automation/result` | `{contentId, network, status, url, externalId, error}` |
| `POST /api/automation/connection` | `{network, connected, account, error}` |
| `GET /api/automation/published` | lista de publicações com `externalId` para coleta de métricas |
| `POST /api/automation/metrics` | `{items:[{contentId, network, views, likes, comments, shares}]}` |
| `POST /api/automation/prepare` | mantido: reconcilia e devolve resumo da fila |

Servidor de compartilhamento: um segundo app Express na porta 3211 serve apenas `/share/:token` (token assinado, 2 h). O cloudflared aponta para ele e gera um endereço `trycloudflare.com` temporário, iniciado só quando há trabalho de Instagram. Necessário porque a API do Instagram exige `video_url` público.

### 3. Fluxos do n8n (`automation/create-workflows.mjs` gera `workflows.json`)

1. **NGD · Verificar conexão do painel** (mantido).
2. **NGD · Publicar fila**: gatilho a cada 5 min + webhook `ngd-publish-now`. Chama `claim`, separa por trabalho, `Switch` por rede:
   - YouTube: lê o arquivo, nó YouTube (upload, público, categoria 22, não é para crianças), resultado `https://youtube.com/shorts/<id>`.
   - Facebook Reels: `video_reels` start → envio binário para `rupload.facebook.com` → finish com descrição e `PUBLISHED`. Credencial: cabeçalho `Authorization: OAuth <token de página>`.
   - Instagram Reels: cria contêiner `REELS` com `video_url` público → espera `FINISHED` → `media_publish` → busca `permalink`. Mesma credencial da Meta.
   - TikTok: `post/publish/video/init` com `FILE_UPLOAD` em um único pedaço (até 64 MB) → `PUT` no `upload_url` → consulta status. Credencial OAuth2 genérica. Privacidade `SELF_ONLY` até a auditoria.
   - Cada ramo termina em `result`. Falhas de nó vão para um nó comum "Registrar falha". Se o n8n não responder em 30 min, o servidor marca `failed` sozinho.
3. **NGD · Testar conexão**: webhook `ngd-test-connection` com `network`. `Switch` → chamada "quem sou eu" de cada rede com `continueOnFail` → responde `{connected, account, error}`. As credenciais são escolhidas pelo usuário dentro dos nós desse fluxo.
4. **NGD · Coletar resultados**: diário às 07:00 + manual. `published` → por rede busca contadores → `metrics`.

O usuário só precisa: criar as credenciais no n8n (com IDs/segredos que ele mesmo gera nos portais das plataformas) e selecioná-las nos nós. O painel mostra o passo a passo por rede.

### 4. Painel (`public/app.js`, `style.css` com poucas classes novas)

- Conteúdos: capa, estado da mídia, chips por rede com estado e link, "Publicar agora", "Importar do Instagram".
- Editor: campo de hashtags, legenda específica por rede (opcional), aviso de duração.
- Redes: estado real de conexão, conta detectada, botão "Testar conexão", campos extra (ID da página, ID do Instagram, privacidade do TikTok), guia de conexão.
- Automações: fila (conteúdo, rede, estado, tentativas, erro, ação), "Executar fila agora", situação do n8n e do túnel.
- Resultados: totais reais por rede e tabela por publicação. Sem dado, mostra "sem dados".
- Visão geral: contadores e checklist reais.

### 5. Tratamento de erros

- Importação/preparação: erro fica em `media.error` e o card mostra "Tentar novamente".
- Publicação: `posts[rede].error` com mensagem da plataforma; "Tentar novamente" volta para pendente.
- Trabalho preso em `queued` mais de 30 min: volta para `failed` com "sem resposta da automação".
- Ferramentas ausentes: rotas respondem 503 com instrução de rodar o instalador.

### 6. Testes

`tests/server.test.mjs` cobre: migração de registros antigos, `claim` só devolve trabalhos vencidos e prontos e não devolve LinkedIn, `result` atualiza estado e deriva o status do conteúdo, expiração de trabalho preso, publicação manual, rotas da ponte exigem token, tokens de compartilhamento expiram. ffmpeg/yt-dlp são testados por um teste que se auto-ignora quando as ferramentas não existem.

## Ordem de entrega

1. Ferramentas + git (feito).
2. Servidor: store, media, queue, rotas, testes.
3. Fluxos do n8n gerados, importados e ativados; validação no editor.
4. Painel.
5. Documentação e checklist do que só o usuário pode fazer (credenciais).
