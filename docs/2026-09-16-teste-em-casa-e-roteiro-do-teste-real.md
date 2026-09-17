# Teste em casa (16/09/2026) e roteiro do teste real na loja (17/09/2026)

Registro do que foi feito no PC de casa na noite de 16/09, o que a simulação provou, o que foi corrigido, e o passo a passo para o teste real na loja com as contas da NGD.

## 1. Resumo em uma frase

A automação inteira (painel → n8n → plataformas → painel) foi validada de ponta a ponta com um mock local das plataformas, dois bugs dos fluxos reais foram corrigidos e tudo está no commit `0dd1f25` em `main`. Falta só o que exige as contas da loja: credenciais, IDs e o teste real.

## 2. O que foi instalado no PC de casa

| Item | Onde | Observação |
|---|---|---|
| Repositório | `D:\PROJETOS CLAUDE\MidiaNGD e Agora\central-ngd` | clone limpo, Node 24.15, Git 2.54 |
| Ferramentas portáteis | `.runtime\tools` | ffmpeg 98 MB, ffprobe 98 MB, yt-dlp 17 MB, cloudflared 52 MB |
| n8n 2.39.6 | `.runtime\n8n` | 2075 pacotes, 12 min de download |
| Segredos | `data\automation-secrets.json` | chave de criptografia + token da ponte, gerados aqui (diferentes dos da loja) |
| Credenciais no n8n | banco em `data\n8n\.n8n` | ponte preenchida; Meta e TikTok com placeholder `COLE_AQUI_...`; YouTube vazio |
| Fluxos | 4 importados e publicados | `ngdLocalHealth01`, `ngdPublishQueue01`, `ngdTestConnection01`, `ngdCollectMetrics01` |

Os 6 comandos do bloco "Reproduzir a instalação" de `automation/README.md` funcionaram como escritos. Nenhuma correção no README foi necessária.

**Estado atual do PC de casa: modo SIMULADO ligado.** Os fluxos do n8n apontam para o mock. Para voltar aos fluxos reais aqui: `.\automation\simular.ps1 -Desligar`. A conta de administrador do n8n (http://localhost:5678) ainda não foi criada; ela é só o login da interface e não afeta a automação.

## 3. Teste sem credenciais (etapa 7 do roteiro da noite)

Um Reels público da NGD (`https://www.instagram.com/reel/Db_eABgzTKJ/`) foi importado e ficou pronto em 25 s (1080×1920, 34,5 s). "Publicar agora" nas 4 redes, sem nenhuma credencial:

| Rede | Resultado | Erro registrado |
|---|---|---|
| YouTube | Falhou em 1 s | Unable to sign without access token |
| Facebook | Falhou em 1 s | Informe o ID da Página do Facebook em Redes sociais. |
| Instagram | Falhou em 1 s | Informe o ID da conta do Instagram em Redes sociais. |
| TikTok | Falhou em 1 s | The access token is invalid or not found in the request. |

A fila não travou. Facebook e Instagram falham ainda no painel (sem ID); YouTube e TikTok chegam ao n8n e o erro vem do provedor.

## 4. Modo simulado (novo)

Um servidor local imita as APIs do YouTube, Meta (Facebook e Instagram) e TikTok para rodar a automação inteira sem token e sem nada sair para a internet.

- `automation/mock-platforms.mjs`: mock em `127.0.0.1:3212`. Modos por rede: `ok`, `auth` (token inválido) e `recusado` (vídeo rejeitado). Estado em `GET /__mock/estado`, troca de modo em `POST /__mock/modo` com `{"rede":"tiktok","modo":"auth"}` (ou `"todas"`). O Instagram simulado baixa o `video_url` de verdade, então o link temporário do painel é testado também.
- `node automation/create-workflows.mjs --simulate`: gera `data/workflows.simulado.json` apontando para o mock; o nó nativo do YouTube vira uma chamada HTTP. Não toca em `automation/workflows.json` nem nas credenciais.
- `lib/media.mjs`: se `NGD_SHARE_PUBLIC_URL` estiver definida, o Instagram usa esse endereço em vez de abrir o túnel do cloudflared.
- `automation/simular.ps1`: liga o modo (para tudo, gera, importa, publica os 4 fluxos, reinicia com o mock, espera o painel confirmar "conectado"). `-Desligar` importa os fluxos reais de volta.
- `automation/stop-local.ps1`: para painel, n8n, mock e cloudflared. Mata por linha de comando **e por porta** (3210, 3211, 3212, 5678, 5679).
- `automation/start-local.ps1`: ganhou `-Simular` e `-Reiniciar`.
- `tests/simulacao.test.mjs`: 4 testes novos. Suíte completa: 12 de 12.

### 4.1 Resultado da simulação completa

Reels importado, "Publicar agora" nas 4 redes com o mock em modo `ok`:

| Rede | Publicação | Link devolvido | Métricas coletadas |
|---|---|---|---|
| YouTube | Publicado | `https://youtube.com/shorts/yt...` | views, likes, comments |
| Facebook | Publicado | `https://www.facebook.com/reel/fbv...` | views, likes, comments |
| Instagram | Publicado | `https://www.instagram.com/reel/igm...` | views, likes, comments, shares |
| TikTok | Publicado | `https://www.tiktok.com/video/v...` | views, likes, comments, shares |

Tempo total: 80 s (o Instagram espera 20 s por consulta de processamento e o TikTok 15 s, como nos fluxos reais). O túnel apareceu como `simulated: true`, sem cloudflared. "Testar conexão" passou nas 4 redes. "Coletar resultados" gravou métricas nas 4.

Modos de falha (YouTube `recusado`, Facebook `auth`, Instagram `recusado`, TikTok `auth`), com "Tentar de novo" nas 4:

| Rede | Erro no painel |
|---|---|
| YouTube | The request metadata specifies an invalid video description. |
| Facebook | Invalid OAuth access token - Cannot parse access token |
| Instagram | Error: Media upload has failed with error code 2207026: unsupported video format (simulação) |
| TikTok | The access token is invalid or not found in the request. |

Nenhuma rede travou em "Publicando".

## 5. Bugs reais encontrados e corrigidos (já em `automation/workflows.json`)

1. **Mensagem de falha vazia no TikTok e opaca no Instagram.** A expressão de erro usava `??`, e o TikTok devolve `error: { code: "ok", message: "" }` mesmo quando o status é `FAILED`; o painel recebia "Falha não informada.". O Instagram com contêiner em `ERROR` devolvia o JSON inteiro. Agora a mensagem tenta, nesta ordem: `error.message`, `error.error_user_msg`, `data.fail_reason` (TikTok), `status` do contêiner (Instagram), e só por último o JSON bruto.
2. **"Testar conexão" do TikTok sempre dava "não conectado".** O fluxo tratava a existência de `error` como erro, e o TikTok sempre manda `error.code = "ok"` em resposta boa. Agora só é erro quando `error.code` é diferente de `"ok"`.

Esses dois ajustes estão no `workflows.json` versionado. **Na loja, os fluxos precisam ser reimportados** (seção 7, passo 3) para receber as correções.

## 6. Incidente da noite (resolvido, sem perda de dados da loja)

O painel iniciado à mão no começo da sessão (`node server.mjs`, sem caminho completo) ficou vivo escondido, e o Windows deixou um segundo painel escutar na mesma porta 3210. Consequências: um túnel cloudflared de verdade abriu durante o primeiro teste simulado (servia apenas `/share/<token assinado>`, foi encerrado), e o estado `data/dashboard.json` foi sobrescrito por uma cópia antiga, perdendo um conteúdo de teste. O painel de casa estava vazio antes, então nada seu foi afetado. O `stop-local.ps1` agora mata por porta para isso não repetir. Lição: iniciar sempre por `Iniciar-NGD.ps1` ou `start-local.ps1`, nunca `node server.mjs` à mão.

Outro aviso: `git status --ignored` demora minutos neste repo porque enumera os 2075 pacotes do n8n. Use `git status` simples.

## 7. Roteiro do teste real na loja (17/09)

Pré-requisitos: PC da loja com o projeto já instalado, as contas da NGD à mão e alguém que possa fazer login no Google, na Meta e no TikTok.

1. **Atualizar o código.** Na pasta do projeto: `git pull`. Se `package-lock.json` mudou, `npm ci`. (Não mudou hoje.)
2. **Confirmar que nada aponta para o mock.** `automation/workflows.json` não pode conter `127.0.0.1:3212` nem "Modo simulado". O teste `npm test` garante isso. Não rode `simular.ps1` na loja.
3. **Reimportar os fluxos com as correções**, na ordem do `automation/README.md`:
   ```powershell
   .\automation\stop-local.ps1
   node automation/n8n.mjs import:workflow --input=automation/workflows.json
   foreach ($id in 'ngdLocalHealth01','ngdPublishQueue01','ngdTestConnection01','ngdCollectMetrics01') { node automation/n8n.mjs publish:workflow --id=$id }
   .\Iniciar-NGD.ps1
   ```
   A importação **não** mexe nas credenciais já preenchidas. Espere até um minuto depois do `Iniciar-NGD.ps1`: o n8n ativa os fluxos com atraso e, nesse intervalo, a aba Automações pode dizer "não conectado".
4. **Verificar a ponte.** Painel → Automações → "Verificar n8n" deve mostrar conectado. No n8n (http://localhost:5678) os 4 fluxos aparecem ativos. Se algum estiver em rascunho, repita o `publish:workflow` e reinicie.
5. **Preencher credenciais no n8n** (menu Credenciais):
   - `NGD · YouTube (Google OAuth2)`: Client ID e Client Secret do Google Cloud, depois "Sign in with Google" com a conta do canal. Redirecionamento cadastrado: `http://localhost:5678/rest/oauth2-credential/callback`.
   - `NGD · Meta (token da Página)`: valor `OAuth <token longo da Página>`.
   - `NGD · TikTok (access token)`: valor `Bearer <access token>`.
6. **Preencher IDs no painel** (Redes sociais): ID da Página do Facebook e ID da conta comercial do Instagram. Sem eles, Facebook e Instagram falham antes de chegar ao n8n.
7. **Testar conexão** em cada rede no painel. Esperado: nome da conta em cada uma. O TikTok agora responde corretamente (bug 2 corrigido).
8. **Primeiro vídeo real.** Importe um Reels da loja, marque só **uma** rede (sugestão: YouTube, que devolve link imediato), "Publicar agora", acompanhe em Automações. Confira o link no navegador.
9. **Demais redes**, uma por vez, na ordem Facebook → TikTok → Instagram. O Instagram é o único que abre o túnel do cloudflared; exige internet estável e leva 20 s por consulta de processamento.
10. **Métricas.** Resultados → "Coletar agora". Os números só existem depois que as plataformas processam, então podem vir zerados no primeiro dia.
11. **Se algo falhar**, o erro aparece no chip da rede e em Automações. Com as correções de hoje ele deve ser a frase da plataforma, não JSON. "Tentar de novo" reprocessa só aquela rede.

## 8. O que esperar de cada plataforma

| Rede | Limite conhecido | Onde vai aparecer |
|---|---|---|
| YouTube | ~6 envios por dia com a cota padrão; publica como público | `youtube.com/shorts/<id>` |
| Facebook Reels | vídeos até 90 s | `facebook.com/reel/<id>` |
| Instagram Reels | precisa do túnel; token de 2 h para o arquivo | `instagram.com/reel/<id>` |
| TikTok | até 64 MB; publica **privado** (`SELF_ONLY`) até a auditoria do app | `tiktok.com/video/<id>` só após aprovação |

## 9. Reversão

- Fluxos: `git checkout f24d688 -- automation/workflows.json` e reimporte, se as correções causarem problema.
- Código: `git revert 0dd1f25`.
- Logo do NGDSITE (feito à parte, sem relação com o painel): originais em `D:\PROJETOS CLAUDE\NGDSITE\backups\logo_azul_original_2026-09-16`.

## 10. Pendências

- Decidir o acesso remoto ao painel da loja (Tailscale ou Chrome Remote Desktop).
- Criar a conta de administrador do n8n no PC de casa, se quiser ver os fluxos por lá.
- `shares` do YouTube e do Facebook chegam como 0 porque as APIs não expõem esse número; é comportamento esperado, não erro.
- Avisos de depreciação do n8n 2.39 em `automation/n8n.mjs` (`WEBHOOK_URL` → `N8N_WEBHOOK_URL`, `N8N_RUNNERS_*`): cosméticos por enquanto, não alterados.
