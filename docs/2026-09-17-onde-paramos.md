# Onde paramos (17/09/2026, fim do dia na loja)

## Para iniciar o sistema (um clique)

Na área de trabalho do PC da loja: **Central NGD**. Ele sobe o painel e o n8n em segundo plano e abre http://localhost:3210. Espere até um minuto para a aba Automações mostrar "n8n conectado". Para parar tudo: **Parar NGD** (ou `automation\stop-local.ps1`).

Se abrir o painel e o n8n não conectar: clique de novo em Central NGD (ele reaproveita o que já está rodando) ou rode `automation\start-local.ps1 -Reiniciar`.

## O que está funcionando

| Rede | Conta | Como publica | Estado |
|---|---|---|---|
| YouTube | canal **Núcleo Gráfico** (@nucleografico), conta ngd@nucleografico.com.br, marca "NGD" | automático (Short público, notifica inscritos) | OK, vídeo real publicado |
| Instagram | **@ngdgrafica** | automático (Reel público, via link temporário) | OK, vídeo real publicado |
| Facebook | Página **"NGD Núcleo Gráfico Digital - Sinalização e Comunicação Visual"** (pequena, ID 624749137386814) | automático (Reel público) | OK, vídeo real publicado |
| TikTok | @growth2782 (app em sandbox) | manual até a revisão do app ("Registrar publicação" no conteúdo) | automação testada, mas só publica com a conta privada |
| LinkedIn | — | manual assistido | — |

Primeiro vídeo real: "MÃO GIGANTE PERSONALIZADA" (17/09) → YouTube https://youtube.com/shorts/3kPtVrk_p4A · Instagram https://www.instagram.com/reel/DdZjGwuk3ev/ · Facebook https://www.facebook.com/reel/1773733823865857.

## Como publicar um vídeo

1. Painel → Conteúdos → **Novo conteúdo** → escolher o arquivo (MP4/MOV, até 90 s para caber no Facebook, gravado em pé).
2. Título, legenda e hashtags (não precisa repetir as hashtags na legenda; o painel junta e não duplica). Marcar as redes: YouTube, Instagram, Facebook. **Não marcar TikTok** enquanto a conta estiver pública.
3. Salvar e **Publicar agora**, ou colocar data e hora para o n8n publicar sozinho.
4. Acompanhar em Automações. Cada rede volta com o link ou o erro; "Tentar de novo" refaz só aquela rede.
5. TikTok: no conteúdo, "Registrar publicação" → baixar o vídeo preparado, copiar a legenda, postar pelo app e colar o link.

## Decisões tomadas hoje

- **Facebook**: a Página oficial "NGD Núcleo Gráfico" (facebook.com/ngdgrafica, 1,6 mil seguidores) não é administrada por nenhuma conta da loja (nem danilograff, nem ngd@nucleografico, nem Ngd Growth). Sem o administrador original não há como publicar nela. **Decisão: seguir com a Página pequena**, que já está ligada ao @ngdgrafica. Se um dia aparecer o administrador da grande: ele adiciona Danilo Lima Marques com controle total, e o token e o ID são trocados em 5 minutos (roteiro em README, seção Facebook). Vale encurtar o nome da Página pequena para "NGD Núcleo Gráfico" em Configurações → Nome.
- **YouTube**: o app do Google ficou em modo **"Testando"** (externo) para aceitar o canal de marca. Nesse modo a autorização vence a cada **7 dias**: se o YouTube aparecer "não conectado", refazer "Sign in with Google" no n8n escolhendo a marca **NGD**. Para não vencer: completar a página Branding no Google Cloud (nome, e-mail, domínio, links de termos e privacidade) e clicar em "Publicar app"; o aviso "app não verificado" continua, mas o token para de expirar.
- **TikTok**: conta @growth2782 pública. A automação só funciona com a conta privada enquanto o app "Central NGD" não passa pela revisão do TikTok (roteiro no README, seção "Revisão do app do TikTok"). Antes de submeter, o painel precisa da tela de opções por vídeo (privacidade, comentários, dueto, stitch, conteúdo comercial).

## Pendências (ordem sugerida)

1. Google Cloud: completar Branding e publicar o app para o YouTube não pedir login toda semana.
2. Facebook: procurar o administrador da Página de 1,6 mil (e-mails de facebookmail.com em ngd@nucleografico.com.br; "Esqueci a senha" com o e-mail e com o telefone (61) 99649-0102; perguntar ao dono quem postava em 2020).
3. TikTok: tela de opções por vídeo no painel → gravar vídeo demo → submeter o app à revisão → trocar para chaves de produção e "Reautorizar".
4. Acesso remoto ao painel da loja (Tailscale grátis ou Chrome Remote Desktop), para operar de casa.
5. Manutenção: apagar a credencial "NGD · TikTok (access token)" no n8n (sem uso); apagar os posts errados (Short no canal NucleoGraficoDigital e, se quiser, o Reel da Página pequena com hashtags duplicadas).
6. Editar à mão a legenda do primeiro Reel no Instagram (saiu com hashtags repetidas e "**").

## Dois PCs

Código no GitHub (Philipe91/central-ngd). Dados, n8n, credenciais e vídeos só no PC da loja. Antes de mexer em qualquer PC: `git pull`; ao terminar: `git push`. Nunca copiar `data/` entre PCs. Em casa o painel roda vazio e sem n8n (ou com o modo simulado, `automation\simular.ps1`).

## Onde estão as chaves

- n8n → Credenciais: YouTube (OAuth Google) e Meta (token de Página, sem expiração).
- `data/automation-secrets.json` (fora do git): token da ponte, chave do n8n e chave/segredo/tokens do TikTok.
- Painel → Redes sociais: IDs da Página do Facebook e da conta do Instagram, privacidade do TikTok.
- Google Cloud: projeto `central-ngd` (org nucleografico.com.br). Meta: app "Central NGD" (id 1428327089169450, no perfil danilograff). TikTok: app "Central NGD" (id 7686481285971331092), sandbox "NGD teste".
