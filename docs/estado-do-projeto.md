# Central NGD: estado do projeto

Documento de repasse, escrito para outro agente de IA ou pessoa técnica que vai continuar o trabalho sem ter acompanhado a construção. Lido por pessoas, não chamado por código. Estado em 22/09/2026.

Repositório: `Philipe91/central-ngd` (privado). Pasta no PC da loja: `C:\projetos\MidiasNGD`.

---

## 1. O que é

Painel local que resolve duas coisas para a gráfica NGD Núcleo Gráfico Digital (comunicação visual B2B, Brasília):

1. **Módulo de vídeos** (em produção): publica um vídeo da loja no YouTube, Instagram, Facebook e TikTok a partir de um único cadastro.
2. **Módulo Mídia Paga** (novo, somente leitura): catálogo de produtos com imagens padronizadas, campanhas com código de referência, funil de leads e comparação entre o que a plataforma de anúncios atribui e o que a loja observou.

Restrição que moldou tudo: **orçamento zero para ferramentas**. Nada de assinatura, hospedagem ou serviço pago. Tudo roda no PC da loja.

## 2. Pilha técnica e restrições que não podem ser quebradas

- **Node 24.13.0**, fixado em `package.json` (`engines: >=24.13.0 <25`).
- **Duas dependências de produção apenas**: `express@5` e `multer@2`. Não instalar mais nada sem justificativa forte.
- **Front-end sem build e sem framework**: HTML, CSS e JavaScript puro em `public/`, servido estático.
- **Roda offline**: o painel escuta só em `127.0.0.1`. Nada de CDN para fonte, ícone ou biblioteca.
- **Content-Security-Policy com `style-src 'self'`**: o navegador **ignora atributo `style="..."` no HTML**. Valores dinâmicos precisam ir em `data-*` e ser aplicados por JavaScript depois de inserir o HTML (ver `paint()` em `public/charts.js`). Não afrouxar essa política.
- **SQLite embutido do Node** (`node:sqlite`) para o módulo novo, em vez de `better-sqlite3`, para evitar dependência nativa que exigiria compilador no Windows. Sai um aviso de recurso experimental, silenciado nos scripts npm.
- **ffmpeg vendorizado** em `.runtime/tools` faz vídeo e imagem. Por isso não entrou `sharp`.
- **`data/` nunca vai para o git**: dados, segredos, vídeos, banco.
- **Valores financeiros em centavos inteiros**, nunca ponto flutuante. Datas em texto ISO.

## 3. Estrutura

```
server.mjs                 rotas do painel, ponte com o n8n, monta /api/ads em uma linha
lib/store.mjs              dados do módulo de vídeos: data/dashboard.json, escrita atômica
lib/queue.mjs              fila por rede, estados, montagem do texto publicado
lib/media.mjs              ffmpeg, ffprobe, yt-dlp, túnel cloudflared, token de compartilhamento
lib/tiktok-auth.mjs        OAuth do TikTok com renovação automática
lib/ads/db.mjs             SQLite do módulo novo: 10 tabelas, migrações, backup, auditoria
lib/ads/catalog.mjs        produtos e imagens
lib/ads/images.mjs         ffmpeg: foto vira 1080x1080 com fundo branco, original preservado
lib/ads/meta.mjs           cliente da Meta SOMENTE GET + sincronização idempotente
lib/ads/funnel.mjs         campanhas com código, links rastreados, leads, estágios, duas verdades
lib/ads/routes.mjs         express.Router montado em /api/ads
public/                    interface: app.js, ads.js, charts.js, theme.css, style.css, fonts/
automation/                gerador dos fluxos do n8n, mock das plataformas, scripts PowerShell,
                           ads-demo.mjs (dados de demonstração)
tests/                     20 testes, rodados por `npm test`
docs/                      este documento, auditoria, operação, decisões
data/                      fora do git
```

## 4. Módulo de vídeos: como funciona

Fluxo: vídeo entra por upload ou por link do Instagram (yt-dlp) → ffmpeg gera 1080x1920 H.264/AAC com fundo desfocado quando não é 9:16, mais uma capa → a pessoa preenche título, legenda, hashtags, redes e data → o n8n busca a fila a cada 5 minutos, ou na hora pelo botão → publica em cada rede → devolve link ou erro → uma vez por dia coleta métricas.

Painel em `127.0.0.1:3210`. Servidor de compartilhamento em `3211` (só o Instagram precisa: a Meta baixa o vídeo por um link público temporário, servido por túnel cloudflared com token assinado de 2 horas, aberto só durante a publicação). n8n Community local em `5678`, com 4 fluxos gerados por `automation/create-workflows.mjs`. Painel e n8n conversam por um token no cabeçalho `X-NGD-Automation`.

Estado das contas:

| Rede | Conta | Situação |
|---|---|---|
| YouTube | canal Núcleo Gráfico (@nucleografico), conta ngd@nucleografico.com.br, marca "NGD" | publicando |
| Instagram | @ngdgrafica | publicando |
| Facebook | Página "NGD Núcleo Gráfico Digital - Sinalização e Comunicação Visual" | publicando |
| TikTok | @growth2782, app em sandbox | automação pronta; só publica com a conta privada até a revisão do app |
| LinkedIn | — | manual assistido |

Armadilhas já descobertas na prática, que devem ser respeitadas:

1. A conta Google tem **dois canais** de YouTube. O login OAuth precisa escolher a marca certa, senão publica no canal errado e vazio.
2. O app do Google ficou em modo **"Testando"**, o que faz a autorização do YouTube vencer a cada 7 dias. Pendência: completar a página de Branding no Google Cloud e publicar o app.
3. A Meta mudou o envio de Reels: o endereço de upload vem na resposta da fase inicial. O caminho fixo antigo retorna erro.
4. O nó do YouTube no n8n 2.x devolve `uploadId`, não `id`. Ler só `id` faz um envio bem-sucedido ser marcado como falha.
5. A Página oficial do Facebook com 1,6 mil seguidores **não tem administrador conhecido**. Decisão tomada: seguir com a Página pequena.
6. Música de artista famoso derruba Short no YouTube por direitos autorais. Um vídeo já foi bloqueado assim.
7. O TikTok exige marcar publicação promocional como conteúdo comercial da própria marca (`brand_organic_toggle`), senão aplica advertência.

## 5. Módulo Mídia Paga: o que existe

**Decisão de escopo**, tomada com um agente arquiteto: recorte pequeno e útil. LinkedIn Ads ficou fora (a aprovação da API leva semanas e costuma ser negada). Pixel e Conversions API viraram especificação, porque o site da loja está em outro repositório e de tecnologia desconhecida. Vinte tabelas propostas viraram dez.

**Etapa 1, pronta**: catálogo de produtos (código normalizado, preço em centavos, status) e pipeline de imagem. A foto entra em qualquer proporção e sai 1080x1080 com fundo branco, sem cortar nem esticar, com o original guardado e hash registrado.

**Etapa 2, pronta**:
- Campanhas com **código de referência** (`MP-001`). O painel gera o link do site com UTMs e um link `wa.me` com mensagem pronta terminando em `[ref MP-001]`.
- Leads com estágios (`lead`, `contato`, `qualificado`, `orcamento`, `proposta`, `venda`, `perdido`), histórico de mudanças e valores.
- **Duas verdades separadas**: o que a plataforma atribui e o que a loja observou, lado a lado, nunca somadas.
- Cliente da Meta **somente leitura**, com paginação, token mascarado e sincronização idempotente por (campanha, dia). Existe teste que falha se alguém colocar POST, PUT ou DELETE nesse arquivo.

**Regra de produto importante**: quando não há gasto registrado, os indicadores de custo devolvem vazio e a tela mostra um traço, não zero. Mostrar zero sugeriria que o cliente foi adquirido de graça.

**O que o módulo deliberadamente não faz**: não cria, não pausa, não altera orçamento e não apaga campanha. Esse código não existe, nem escondido atrás de chave de funcionalidade.

**Dados de demonstração**: `node automation/ads-demo.mjs` povoa o módulo com 6 produtos, 3 campanhas, 30 dias de gasto e 16 leads, para avaliar a tela sem ter conta de anúncios. `--limpar` remove só o que ele criou. Números com semente fixa.

## 6. Estado das credenciais do módulo de anúncios

Nada conectado ainda. O que falta é decisão e burocracia do dono, não código:

1. Qual conta de anúncios da Meta e quem paga. Recomendação registrada: criar Portfólio Empresarial da NGD, com o dono como administrador e cartão da empresa, em vez de usar o perfil pessoal de um funcionário.
2. Token de leitura. A permissão `ads_read` funciona **sem revisão de app** se o usuário tiver papel no app e papel na conta de anúncios. O token de usuário longo dura 60 dias.
3. Teto de gasto precisa existir **na Meta**, não só no software: se o PC desligar, o único limite que vale é o da plataforma.
4. Quem registra os leads no painel e o que a loja considera "lead qualificado". Esse é o elo mais frágil: se ninguém anotar o código de referência que vem na conversa, a contabilidade da loja fica vazia e o módulo perde o sentido.

## 7. Dois computadores e duas sessões de IA

**Dois PCs**: o código fica no GitHub. Dados, n8n, credenciais e vídeos ficam **só no PC da loja**, que é quem publica. O PC de casa clona e roda o painel vazio, ou o modo simulado (`automation/simular.ps1`), que troca os fluxos para um mock local das plataformas. Regra: `git pull` antes, `git push` depois, nunca copiar `data/` entre máquinas.

**Duas sessões de IA trabalhando em paralelo**, com divisão de arquivos para não haver conflito:
- Sessão de design: dona de todo o `public/` e de `docs/design/**`.
- Sessão de engenharia: dona de `lib/`, `server.mjs`, `tests/` e `automation/`.
- Quem precisar cruzar a fronteira avisa antes. Cada etapa é um commit, com pull antes e push depois.

## 8. Verificação

`npm test` roda 20 testes, todos passando. Cobrem: fila e estados do módulo de vídeos, renderização real com ffmpeg, token do TikTok (renovação única, rotação, desconexão em erro), mock das quatro plataformas, migrações do banco novo, idempotência da coleta por (campanha, dia), validações do catálogo, geração da imagem 1080x1080 com canto branco verificado, códigos de referência, links, estágios do funil e a separação entre os dois números de conversão.

`npm run check` confere a sintaxe do servidor e dos arquivos do painel.

## 9. O que falta, em ordem

1. **YouTube**: completar Branding no Google Cloud e publicar o app, para a autorização parar de vencer a cada 7 dias.
2. **Meta Ads**: as quatro decisões da seção 6, depois conectar o token e rodar a primeira sincronização.
3. **Etapa 3 do Mídia Paga**: recomendações por regras determinísticas, em rascunho, com aprovar ou rejeitar e registro de auditoria. Sem IA generativa, sem execução automática. Depende de pelo menos duas semanas de dados reais.
4. **TikTok**: submeter o app à revisão para publicar em conta pública. Antes disso, o painel precisa da tela de opções por vídeo que a plataforma exige.
5. **Acesso remoto** ao painel da loja (Tailscale ou Chrome Remote Desktop), para operar de casa.
6. **Tracking no site**, depois de descobrir a tecnologia dele. Observação honesta: a Conversions API não pode rodar neste painel, porque `127.0.0.1` não é alcançável pelo site; teria de rodar no servidor do site.

## 10. Documentos relacionados

- `docs/sistema-central-ngd.md`: visão geral do módulo de vídeos.
- `docs/ads/fase-0-auditoria.md`: auditoria e arquitetura do módulo de anúncios.
- `docs/ads/operacao.md`: como operar o módulo de anúncios no dia a dia.
- `docs/2026-09-17-onde-paramos.md`: registro do primeiro dia em produção, com decisões e pendências.
- `README.md` e `automation/README.md`: instalação, credenciais e reprodução em outro computador.
