# NGD · Central de conteúdo

Painel local da NGD Núcleo Gráfico Digital para distribuir vídeos da loja no YouTube Shorts, Facebook Reels, Instagram Reels, TikTok e LinkedIn. Instagram: https://www.instagram.com/ngdgrafica/

Tudo roda neste computador, sem serviço pago: painel (Node/Express), n8n Community, ffmpeg, yt-dlp e cloudflared portáteis.

## Abrir

Atalho **Central NGD** na área de trabalho, ou `Iniciar-NGD.ps1` na pasta do projeto. Ele sobe o painel (http://localhost:3210) e o n8n (http://localhost:5678) em segundo plano e abre o navegador. Os dois serviços escutam só em 127.0.0.1.

Primeira instalação em outro computador:

```powershell
npm install
.\automation\install-tools.ps1     # baixa ffmpeg, yt-dlp e cloudflared em .runtime\tools
# instalar o n8n e importar os fluxos: veja automation\README.md
```

## Como usar no dia a dia

1. **Conteúdos → Importar do Instagram**: cole o link de um Reels da loja. O painel baixa o vídeo, guarda o original em `data/videos` e gera a versão 1080x1920 com capa em `data/renditions`. Também aceita upload de MP4/MOV/WebM.
2. **Editar**: título, legenda, hashtags, redes de destino, legenda diferente por rede (opcional) e data/hora.
3. **Publicar**: com data marcada, o n8n publica sozinho quando chega a hora (confere a cada 5 minutos). "Publicar agora" dispara na hora.
4. **Acompanhar**: cada rede mostra Pendente → Publicando → Publicado (com link) ou Falhou (com o motivo e botão "Tentar de novo"). A aba Automações lista a fila.
5. **Resultados**: uma vez por dia o n8n busca visualizações, curtidas, comentários e compartilhamentos das publicações automáticas.
6. **LinkedIn**: "Registrar publicação" baixa o vídeo preparado, copia a legenda e guarda o link depois que você posta pelo app.

## O que só você pode fazer: conectar as contas

O painel e os fluxos já estão prontos, mas cada rede exige credenciais que só o dono da conta gera. A aba **Redes sociais** tem o passo a passo de cada uma. Resumo:

| Rede | Onde gerar | Onde colar |
|---|---|---|
| YouTube | Google Cloud: projeto + YouTube Data API v3 + cliente OAuth (redirecionamento `http://localhost:5678/rest/oauth2-credential/callback`) | n8n → Credenciais → **NGD · YouTube (Google OAuth2)** → ID, segredo e "Sign in with Google" |
| Facebook Reels | developers.facebook.com: app + Graph API Explorer → token longo da Página | n8n → **NGD · Meta (token da Página)** → valor `OAuth SEU_TOKEN`; ID da Página no painel |
| Instagram Reels | Mesmo token da Meta; ID da conta comercial | ID no painel (Redes sociais → Instagram) |
| TikTok | developers.tiktok.com: app + Login Kit + Content Posting API (Direct Post). Até a revisão, use o **Sandbox** do app com a conta da loja como usuária de teste; a conta precisa estar como **privada** | Painel → Redes sociais → TikTok: client key e secret do sandbox → **Conectar TikTok** (o painel renova o token sozinho por 1 ano) |
| LinkedIn | Sem API aberta para vídeo | Publicação manual assistida |

Depois de colar, clique em **Testar conexão** na aba Redes sociais. O painel mostra a conta detectada ou o erro devolvido pela plataforma.

Instagram: para publicar, a API da Meta precisa baixar o vídeo por um link público. O painel abre um túnel temporário do cloudflared (sem conta) só durante a publicação, servindo apenas o arquivo com um token assinado válido por 2 horas.

## Estrutura

- `server.mjs`: rotas do painel e da ponte com o n8n; `lib/store.mjs` (dados), `lib/media.mjs` (ffmpeg, yt-dlp, túnel), `lib/queue.mjs` (fila por rede).
- `public/`: interface (HTML, CSS e JS sem build).
- `automation/`: n8n (`n8n.mjs` inicia com as variáveis certas; `create-workflows.mjs` gera `workflows.json`).
- `docs/superpowers/`: desenho e plano desta etapa.
- `data/`: `dashboard.json` (+ `.bak`), vídeos, renderizações, banco do n8n, logs, `cookies/instagram.txt` (opcional, para Reels que exigem login).

## Revisão do app do TikTok (para publicar em conta pública)

Enquanto o app "Central NGD" não é aprovado pelo TikTok, a API só publica em **conta privada** (erro `unaudited_client_can_only_post_to_private_accounts`) e só para as contas de teste do Sandbox. Com a conta da loja pública, o TikTok fica em modo manual: no conteúdo, use "Registrar publicação" (baixa o vídeo pronto, copia a legenda, você posta pelo app e cola o link). As outras redes continuam automáticas.

Como pedir a revisão (grátis; costuma levar de 3 a 10 dias úteis, às vezes mais se pedirem ajustes):

1. No portal (developers.tiktok.com → app Central NGD → aba **Production**), preencher: ícone 1024x1024, categoria, descrição, URL de Termos de Serviço e de Política de Privacidade (páginas reais no site da loja), plataforma Web com a URL do site, produtos Login Kit e Content Posting API com Direct Post, escopos `user.info.basic, video.upload, video.publish`.
2. Antes de gravar a demonstração, o painel precisa cumprir as regras de publicação do TikTok: mostrar o nome da conta que vai postar, deixar escolher a privacidade de cada vídeo entre as opções que a API devolve, os botões de comentário, dueto e stitch, e a marcação de conteúdo comercial. Isso ainda não existe no painel e é uma tarefa pequena a fazer antes da submissão.
3. Gravar um vídeo (mp4, até 50 MB) mostrando o fluxo inteiro: conectar a conta no painel, escolher o vídeo, preencher os campos acima, publicar e o vídeo aparecendo no TikTok. Anexar em "App review" com a explicação de cada produto e escopo.
4. Enviar (**Submit for review**) e acompanhar os comentários da revisão no próprio portal. Motivos comuns de recusa: vídeo que não mostra o fluxo completo, links de termos ou privacidade que não abrem, tela sem as opções de privacidade.
5. Depois da aprovação: no painel, trocar a client key e o client secret pelos de **Production**, clicar em "Reautorizar", mudar a privacidade das publicações para "Público" e voltar a marcar o TikTok nos conteúdos.

## Backup e limites

Copie a pasta `data` inteira com os serviços parados. Guarde `data/automation-secrets.json` junto com o banco do n8n: sem a chave, as credenciais salvas não abrem. O painel não tem login e não deve ser exposto à rede.

Limites conhecidos: YouTube permite cerca de 6 envios por dia com a cota padrão da API; Facebook Reels aceita vídeos de até 90 s; TikTok recebe até 64 MB por envio nesta versão e publica privado até a auditoria do app; métricas dependem do que cada API expõe.

## Verificação

`npm run check` confere a sintaxe. `npm test` roda os testes (dados temporários, inclusive uma renderização real com ffmpeg quando as ferramentas estão instaladas).

Para testar a automação inteira sem contas reais, `.utomation\simular.ps1` liga um mock local das plataformas (ver `automation/README.md`, seção "Modo simulado"); `-Desligar` volta ao modo real.
