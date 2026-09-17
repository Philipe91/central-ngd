# Automação local da NGD

## Endereços

- Painel: http://localhost:3210
- n8n Community: http://localhost:5678
- Servidor de compartilhamento (só para o Instagram, via túnel temporário): 127.0.0.1:3211

Os serviços escutam apenas em 127.0.0.1. Não há domínio, hospedagem ou plano pago.

## Abrir e iniciar

`Iniciar-NGD.ps1` na pasta do projeto inicia os dois serviços e abre o painel. `automation/start-local.ps1` faz o mesmo sem abrir o navegador e instala as ferramentas portáteis se faltarem. Os processos rodam ocultos e param quando o computador desliga.

## Primeiro acesso

No primeiro acesso ao n8n crie a conta de administrador local (e-mail e senha só do n8n neste computador). Os fluxos e as credenciais importados ficam na conta do proprietário.

## Fluxos instalados

| Fluxo | Gatilho | O que faz |
|---|---|---|
| **NGD · Verificar conexão do painel** | webhook `ngd-local-health` | Responde ao painel para confirmar a ponte |
| **NGD · Publicar fila** | a cada 5 min, webhook `ngd-publish-now`, manual | Busca no painel os vídeos vencidos e prontos (`/api/automation/claim`), publica por rede (YouTube, Facebook Reels, Instagram Reels, TikTok) e devolve link ou erro (`/api/automation/result`) |
| **NGD · Testar conexão** | webhook `ngd-test-connection` | Faz uma consulta "quem sou eu" na rede pedida e responde `{connected, account, error}` |
| **NGD · Coletar resultados** | todo dia às 7h, webhook `ngd-collect-metrics`, manual | Busca métricas das publicações automáticas e grava no painel (`/api/automation/metrics`) |

Todos os webhooks exigem o cabeçalho `X-NGD-Automation` com o token da credencial **NGD · comunicação local**. Os nós de rede usam `continueOnFail`: erros de plataforma viram falha registrada no painel, não execução travada. Se o n8n não responder em 30 minutos, o próprio painel marca o trabalho como falho.

## Credenciais (preencher no n8n → Credenciais)

| Credencial | Tipo | Valor |
|---|---|---|
| NGD · comunicação local | Header Auth | já preenchida (token gerado em `data/automation-secrets.json`) |
| NGD · YouTube (Google OAuth2) | YouTube OAuth2 | Client ID + Client Secret do Google Cloud, depois "Sign in with Google" |
| NGD · Meta (token da Página) | Header Auth | nome `Authorization`, valor `OAuth <token longo da Página>` |
| NGD · TikTok (access token) | Header Auth | **não é mais usada** (fica como reserva). O TikTok é conectado no painel, que guarda chave, segredo e tokens em `data/automation-secrets.json` e manda o token renovado em cada trabalho (`tiktokToken` no claim, no teste e na coleta) |

O passo a passo de cada plataforma está na aba Redes sociais do painel. Nenhum fluxo precisa ser editado: as credenciais já estão ligadas aos nós pelo ID. O retorno da autorização do TikTok chega em `/tiktok/callback` no servidor de compartilhamento (3211), pelo túnel temporário; o endereço muda a cada reinício do painel e só é usado na autorização (uma vez por ano).

## Configuração instalada

- n8n 2.39.6 em `.runtime/n8n`, separado das dependências do painel.
- Fuso `America/Sao_Paulo`; banco SQLite e arquivos em `data/n8n/.n8n`.
- `N8N_RESTRICT_FILE_ACCESS_TO` aponta para `data/renditions`: o n8n só lê os vídeos preparados.
- Chave persistente em `data/automation-secrets.json` (criptografa as credenciais no banco).
- Retenção de execuções: sete dias, até mil execuções. Dados binários em disco. Diagnóstico desligado.
- Logs em `data/n8n.log`, `data/n8n-error.log`, `data/dashboard.log`, `data/dashboard-error.log`, `data/tunnel.log`.

## Reproduzir a instalação (outro computador)

```powershell
npm.cmd install --prefix .runtime/n8n n8n@2.39.6 --omit=dev --no-audit --no-fund --prefer-online --legacy-peer-deps
node automation/n8n.mjs --version          # cria data/automation-secrets.json
node automation/create-workflows.mjs       # gera workflows.json e o arquivo temporário de credenciais
node automation/n8n.mjs import:credentials --input=data/n8n-import-credential.json
node automation/n8n.mjs import:workflow --input=automation/workflows.json
foreach ($id in 'ngdLocalHealth01','ngdPublishQueue01','ngdTestConnection01','ngdCollectMetrics01') { node automation/n8n.mjs publish:workflow --id=$id }
Remove-Item data/n8n-import-credential.json
```

Depois disso, reinicie o n8n (`Iniciar-NGD.ps1`).

Atualizar os fluxos depois de mudar `create-workflows.mjs`: gere com `--only-bridge` para não sobrescrever as credenciais já preenchidas, importe os fluxos, **repita o `publish:workflow` dos quatro IDs** (a importação volta o fluxo para rascunho) e reinicie o n8n.

## Modo simulado (testar sem contas reais)

`automation/mock-platforms.mjs` é um servidor local (127.0.0.1:3212) que imita as APIs do YouTube, da Meta (Facebook e Instagram) e do TikTok. Com ele a automação inteira roda de ponta a ponta — claim no painel, leitura do vídeo, upload, espera de processamento, link de volta e métricas — sem token nenhum e sem nada sair para a internet.

```powershell
.utomation\simular.ps1              # liga: gera data/workflows.simulado.json, importa, publica e reinicia tudo com o mock
.utomation\simular.ps1 -Desligar    # volta aos fluxos reais de automation/workflows.json
```

No modo simulado o Instagram usa o servidor de compartilhamento local (`NGD_SHARE_PUBLIC_URL=http://127.0.0.1:3211`) em vez do túnel do cloudflared, e o nó nativo do YouTube é trocado por uma chamada HTTP ao mock. As credenciais do n8n e o banco não são alterados; os fluxos ganham uma nota "MODO SIMULADO".

Controle do mock (por rede ou `todas`):

```powershell
Invoke-RestMethod http://127.0.0.1:3212/__mock/estado                                   # modos, publicações simuladas e últimas chamadas
Invoke-RestMethod http://127.0.0.1:3212/__mock/modo -Method Post -ContentType application/json -Body '{"rede":"tiktok","modo":"auth"}'
```

Modos: `ok` publica e devolve link; `auth` responde token inválido no formato da plataforma; `recusado` simula vídeo rejeitado (YouTube e Facebook na hora, Instagram no contêiner, TikTok no status). Os erros chegam ao painel pela mesma rota da produção, então servem para conferir se a mensagem fica legível.

## Backup e manutenção

Guarde juntos o banco do n8n (`data/n8n/.n8n`) e `data/automation-secrets.json`. Para backup consistente pare os dois serviços e copie a pasta `data`. Não apague a pasta de dados para atualizar o n8n; faça backup antes, mantenha as variáveis de `n8n.mjs` e teste os fluxos de novo.
