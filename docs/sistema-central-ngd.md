# Central NGD: o que este sistema faz

Documento de visão geral, escrito para quem chega de fora (pessoa ou agente de IA) e precisa entender o sistema antes de mexer nele. Estado em 22/09/2026.

---

## 1. Em uma frase

A Central NGD pega um vídeo da gráfica NGD, prepara ele no formato certo e publica sozinho no YouTube, Instagram, Facebook e TikTok, tudo rodando no PC da loja, sem nenhum serviço pago.

## 2. Por que existe

A loja produz vídeos (bastidores, produtos, aplicações) e precisava publicar em várias redes. Fazer isso à mão significa exportar em formatos diferentes, reescrever legenda, entrar em quatro aplicativos e repetir tudo. O sistema faz esse trabalho repetitivo e deixa para a pessoa só o que é decisão: qual vídeo, qual texto, quando.

Restrição que moldou todo o projeto: **orçamento zero**. Nada de assinatura, hospedagem ou API paga. Por isso tudo é local e as ferramentas são gratuitas.

## 3. As peças

| Peça | O que é | Onde roda |
|---|---|---|
| **Painel** | Site local onde a pessoa trabalha. Node.js + Express, sem framework de front-end | `http://localhost:3210` (só 127.0.0.1) |
| **n8n** | Motor de automação (Community, grátis). Executa os fluxos que falam com as redes | `http://localhost:5678` |
| **Servidor de compartilhamento** | Entrega o arquivo de vídeo por link temporário assinado; só o Instagram precisa disso | `127.0.0.1:3211` |
| **Ferramentas portáteis** | ffmpeg (renderiza), ffprobe (lê o vídeo), yt-dlp (importa do Instagram), cloudflared (link público temporário) | `.runtime/tools` |

Tudo sobe com um clique no atalho **Central NGD** da área de trabalho, que chama `automation/start-local.ps1`. O atalho **Parar NGD** encerra.

## 4. O caminho de um vídeo

```
vídeo (upload ou link do Instagram)
   ↓  ffmpeg
versão 1080x1920 + capa  (data/renditions)
   ↓  pessoa preenche título, legenda, hashtags, redes, data
fila  (status "pendente" por rede)
   ↓  n8n busca a cada 5 min, ou "Publicar agora"
publica em cada rede, uma por vez
   ↓
link da publicação volta para o painel
   ↓  1x por dia
métricas (views, curtidas, comentários, compartilhamentos)
```

**Preparo**: o ffmpeg converte para 1080x1920 em H.264/AAC. Se o vídeo original não for 9:16, ele entra centralizado sobre um fundo desfocado do próprio vídeo. Uma capa JPG é extraída junto.

**Importação do Instagram**: cola-se o link de um Reels e o yt-dlp baixa o arquivo. Serve também para YouTube, TikTok e Facebook.

**Fila**: cada rede marcada no conteúdo vira um "trabalho" independente, com estado próprio (pendente → na fila → publicado ou falhou). Se uma rede falha, as outras seguem, e a falha tem botão "Tentar de novo" só para aquela rede. Trabalho parado há mais de 30 minutos volta a pendente sozinho.

**Textos**: por padrão todas as redes recebem legenda + hashtags. Dá para escrever um texto diferente para uma rede específica (o TikTok, por exemplo, precisa de legenda sem hashtag de assunto proibido). O sistema não repete hashtag que já esteja na legenda e remove marcas de negrito em Markdown, que nenhuma rede interpreta.

## 5. Como cada rede publica

| Rede | Caminho técnico | Autenticação | Observações |
|---|---|---|---|
| **YouTube** | YouTube Data API v3, upload direto do arquivo | OAuth2 do Google, guardado no n8n | Sai como Short público e notifica inscritos. Cota de cerca de 6 envios por dia |
| **Facebook** | Graph API, Reels em três fases: start, upload do arquivo, finish | Token de Página da Meta (não expira), no n8n | Vídeos até 90 s |
| **Instagram** | Graph API: cria contêiner REELS a partir de um **link público**, espera processar, publica | Mesmo token da Meta | Único que precisa do túnel: o cloudflared sobe um endereço temporário e o arquivo é servido com token assinado válido por 2 h, só durante a publicação |
| **TikTok** | Content Posting API: init, upload do arquivo, consulta de status | Token gerido **pelo painel**, renovado sozinho | Marca a publicação como conteúdo comercial da própria marca. Enquanto o app não passa pela revisão do TikTok, só publica em conta privada |
| **LinkedIn** | Sem API aberta para vídeo | — | Manual assistido: o painel entrega o vídeo pronto e a legenda para copiar |

Cada rede tem também um teste de conexão ("quem sou eu") que o painel dispara e mostra a conta detectada ou o erro devolvido pela plataforma.

## 6. Onde ficam as coisas

```
C:\projetos\MidiasNGD\
├── server.mjs              rotas do painel e da ponte com o n8n
├── lib/
│   ├── store.mjs           banco de dados em JSON, escrita atômica
│   ├── queue.mjs           fila por rede, estados, montagem do texto
│   ├── media.mjs           ffmpeg, yt-dlp, túnel, tokens de compartilhamento
│   └── tiktok-auth.mjs     token do TikTok (autorização e renovação)
├── public/                 interface (HTML, CSS e JS sem build)
├── automation/
│   ├── create-workflows.mjs   gera os fluxos do n8n
│   ├── workflows.json         os 4 fluxos, versionados
│   ├── mock-platforms.mjs     imita as APIs para testar sem contas reais
│   └── *.ps1                  iniciar, parar, simular, instalar ferramentas
├── docs/                   este documento e os registros de cada etapa
├── tests/                  14 testes automatizados (npm test)
└── data/                   NÃO vai para o git
    ├── dashboard.json          todos os conteúdos e o histórico
    ├── automation-secrets.json chaves e tokens
    ├── videos/                 originais
    ├── renditions/             versões 9:16 prontas
    └── n8n/                    banco do n8n
```

## 7. Os quatro fluxos do n8n

1. **Verificar conexão do painel**: responde que a ponte está viva.
2. **Publicar fila**: roda a cada 5 minutos, ou quando o painel chama. Busca os trabalhos vencidos e prontos, separa por rede e publica.
3. **Testar conexão**: consulta simples em cada rede para confirmar a credencial.
4. **Coletar resultados**: uma vez por dia às 7h, busca as métricas das publicações feitas pela automação.

O painel e o n8n conversam por um token local (cabeçalho `X-NGD-Automation`). Nenhuma porta é aberta para a internet.

## 8. O que o sistema deliberadamente não faz

- Não tem login: é de uso local e não deve ser exposto na rede.
- Não edita vídeo além do enquadramento 9:16. Corte, legenda na tela e trilha são feitos antes, no editor de vídeo.
- Não escolhe horário "ideal" nem gera texto sozinho.
- Não publica no LinkedIn nem no TikTok público (este último até a revisão do app).
- Não guarda nada na nuvem. Se o PC da loja estiver desligado, nada é publicado.

## 9. Dois computadores

O código fica no GitHub (`Philipe91/central-ngd`). Os dados, o n8n, as credenciais e os vídeos ficam **só no PC da loja**, que é quem publica. O PC de casa clona o repositório e roda o painel vazio, para mexer em código; existe um modo simulado (`automation/simular.ps1`) que imita as APIs das redes para testar a automação inteira sem tocar em conta nenhuma.

Regra: `git pull` antes de começar, `git push` ao terminar, nunca copiar a pasta `data` entre os PCs.

## 10. Estado atual das contas

| Rede | Conta | Situação |
|---|---|---|
| YouTube | canal Núcleo Gráfico (@nucleografico) | publicando |
| Instagram | @ngdgrafica | publicando |
| Facebook | Página "NGD Núcleo Gráfico Digital - Sinalização e Comunicação Visual" | publicando |
| TikTok | @growth2782 | automação pronta, aguardando revisão do app para publicar em conta pública |

Detalhes, pendências e armadilhas conhecidas estão em `docs/2026-09-17-onde-paramos.md`.

---

# 11. A função nova: anúncios

Esta parte é planejamento, ainda não existe no sistema. Serve para a conversa sobre o que é possível.

## 11.1 Duas coisas diferentes

É importante separar, porque o esforço é muito diferente:

**A. Impulsionar uma publicação que já existe** ("boost"). Pega o Reel que o sistema acabou de publicar e coloca dinheiro nele para alcançar mais gente. É o caminho mais curto e o que mais combina com o que o sistema já faz: ele já sabe o ID de cada publicação em cada rede.

**B. Criar campanhas de verdade**, com estrutura de campanha, conjunto de anúncios, público, criativos, orçamento e otimização. É montar um gerenciador de anúncios dentro do painel. É um projeto separado, bem maior.

Recomendo começar por A e só depois avaliar B.

## 11.2 O que cada plataforma exige

| Rede | API | Exigências |
|---|---|---|
| **Meta** (Facebook + Instagram) | Marketing API | App com a permissão `ads_management` **aprovada em revisão**, verificação do negócio (documento da empresa), conta de anúncios e forma de pagamento. O app "Central NGD" já existe, mas hoje só tem permissões de publicação |
| **Google Ads** (YouTube) | Google Ads API | Token de desenvolvedor aprovado pelo Google, conta Google Ads com histórico. A aprovação costuma exigir explicar o uso e demora |
| **TikTok** | TikTok Marketing API (TikTok for Business) | Conta business, app de marketing aprovado, separado do app de publicação que já temos |

Em todas, a **verba do anúncio é custo real da loja**. A regra de orçamento zero continua valendo para as ferramentas, não para a mídia paga.

## 11.3 Por onde eu começaria

1. **Meta primeiro**. É onde a loja tem presença (Página + Instagram), e a mesma API que já usamos ganha um módulo novo. O bloqueio é burocrático: verificação do negócio e revisão da permissão de anúncios, que leva dias.
2. **Escopo mínimo que já dá resultado**: no painel, ao lado de cada publicação já no ar, um botão "Impulsionar" com três campos (verba total, duração em dias, objetivo). O sistema cria a campanha simples, acompanha o gasto e mostra o resultado junto com as métricas orgânicas que já coleta.
3. **Depois**, se fizer sentido: público salvo, criativo próprio para anúncio (diferente do orgânico), teste A/B de legenda, e aí sim a estrutura completa.

## 11.4 O que o sistema já tem pronto que ajuda

- ID e link de cada publicação em cada rede, guardados por conteúdo.
- Token da Meta funcionando, com a Página e a conta do Instagram já identificadas.
- Fila com estados e repetição, que serve igual para "trabalho de anúncio".
- Coleta diária de métricas, onde os números pagos entram ao lado dos orgânicos.
- Modo simulado, que permite desenvolver e testar o módulo de anúncios sem gastar um centavo.

## 11.5 O que vai precisar de decisão sua

- Quem é o dono da conta de anúncios e qual cartão paga.
- Verba máxima que o painel pode comprometer sozinho (um teto é obrigatório: um botão que gasta dinheiro precisa de limite e de confirmação).
- Se o anúncio vai sair pela Página atual ou pela Página de 1,6 mil seguidores, que hoje não tem administrador conhecido.
- Objetivo: mais alcance, mais mensagens no WhatsApp, ou visitas ao site.
