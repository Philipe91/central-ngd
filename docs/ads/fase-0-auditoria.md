# Auditoria inicial — Módulo Mídia Paga NGD

Fase 0 do prompt mestre. Nenhum arquivo do sistema foi alterado para produzir este documento.
Data: 22/09/2026. Repositório: `Philipe91/central-ngd`, pasta `C:\projetos\MidiasNGD`.

---

## 1. Estado atual encontrado

- Branch `main`, sincronizada com o GitHub. Árvore limpa antes desta auditoria.
- Node **24.13.0**. Dependências de produção: **apenas `express@5` e `multer@2`**. Nenhuma dependência de front-end.
- `npm test`: **14 testes, todos passando** (`node --test tests/*.test.mjs`).
- Sistema em uso real desde 17/09: publica em YouTube, Instagram, Facebook e TikTok. Dois vídeos reais no ar.
- O painel roda em `127.0.0.1:3210` e envia cabeçalho de segurança rígido (ver item 4, achado importante).

## 2. Arquitetura real do projeto

```
server.mjs            rotas do painel + ponte com o n8n (header X-NGD-Automation)
lib/store.mjs         "banco": data/dashboard.json, escrita atômica com .bak
lib/queue.mjs         fila por rede, estados, montagem do texto publicado
lib/media.mjs         ffmpeg, ffprobe, yt-dlp, túnel cloudflared, tokens de compartilhamento
lib/tiktok-auth.mjs   OAuth do TikTok com renovação automática
public/charts.js      gráficos SVG sem biblioteca (feito hoje, na aba Resultados)
public/               HTML, CSS e JS puro, sem build
automation/           gerador dos 4 fluxos do n8n, mock das plataformas, scripts PowerShell
data/                 fora do git: dados, segredos, vídeos, banco do n8n
```

Fluxo de publicação: painel prepara o vídeo com ffmpeg → n8n busca a fila a cada 5 min → publica por rede → devolve link ou erro → coleta métricas 1x/dia.

## 3. Componentes que podem ser reaproveitados

| Componente | Como serve ao módulo novo |
|---|---|
| Padrão de segredos (`data/automation-secrets.json`, fora do git) | Mesmo padrão para `data/ads-secrets.json` |
| `lib/tiktok-auth.mjs` | Modelo pronto de OAuth com renovação, trava e desconexão em erro |
| `automation/mock-platforms.mjs` + `simular.ps1` | Ganha rotas do Graph API e o módulo inteiro roda sem conta real |
| `public/charts.js` | Rosca, barras e comparativos já prontos e no padrão visual |
| ffmpeg vendorizado | Faz o pipeline de imagem 1080x1080 sem dependência nova |
| Padrão de testes (`node --test`, dados temporários) | Mesmo comando cobre o módulo novo |
| Navegação e tokens de CSS do painel | A aba "Mídia paga" nasce igual ao resto |

## 4. Diferenças entre o repositório e o contexto recebido

Pontos do prompt mestre que precisam de correção ou ressalva:

1. **`better-sqlite3` não é necessário.** Este Node 24 traz **`node:sqlite` embutido** (`DatabaseSync`, transações, WAL, `backup()`). Evita dependência nativa que exigiria Visual Studio Build Tools em dois PCs Windows. Sai um `ExperimentalWarning`, contornável no script npm.
2. **`sharp` não é necessário.** O ffmpeg já está no projeto e resolve 1080x1080 com fundo branco, inclusive PNG com transparência.
3. **Achado de segurança relevante**: o painel envia `Content-Security-Policy: style-src 'self'`. Na prática, **atributo `style=""` no HTML é ignorado pelo navegador**. Descobri isso hoje, implementando os gráficos: valores dinâmicos precisam ir em `data-*` e ser aplicados por JavaScript. Qualquer tela do módulo novo tem de seguir essa regra. A política não deve ser afrouxada.
4. **As cerca de 20 tabelas propostas são grandes demais para o MVP.** Proposta reduzida no item 6.
5. **A seção 11 do documento antigo (impulsionar vídeo) está descartada**, conforme instruído.
6. **LinkedIn Ads não é viável agora**: a Marketing Developer Platform exige aprovação que leva semanas e é frequentemente negada, e o custo por clique é alto para uma gráfica local. Recomendo tirar do MVP.
7. **`claude-ads` não é biblioteca para embutir.** Ver item 8.

## 5. Arquitetura proposta para o MVP

Objetivo único e verificável: **saber quanto a NGD gasta em Meta Ads e quantos leads, orçamentos e vendas reais aquilo gerou**, com catálogo de produtos e imagens padronizadas para montar os anúncios à mão no Gerenciador.

```
lib/ads/
  db.mjs          node:sqlite, migrações numeradas, backup diário
  catalog.mjs     produtos e imagens
  images.mjs      pipeline ffmpeg 1080x1080, original preservado
  meta-client.mjs somente GET, base URL configurável (aponta ao mock no modo simulado)
  sync.mjs        coleta idempotente por (campanha, dia)
  funnel.mjs      leads e estágios
  rules.mjs       recomendações determinísticas, sem IA
  routes.mjs      um express.Router()
server.mjs        ganha UMA linha: app.use('/api/ads', adsRouter)
public/ads/       tela própria, importando public/charts.js
data/ads.sqlite   fora do git; data/ads-secrets.json para o token
```

Nada em `store.mjs`, `queue.mjs`, `media.mjs`, `tiktok-auth.mjs` ou `workflows.json` é tocado. O n8n não participa: leitura de API é Node direto.

**Somente leitura.** O código que escreve na plataforma não existe no MVP, nem atrás de flag.

## 6. Modelo de dados inicial proposto

Dez tabelas. Dinheiro em centavos inteiros. Datas ISO. `raw_json` guarda o que a API devolver a mais.

```
schema_migrations   version, applied_at
products            sku único, nome, categoria, descrição, preço, status
product_images      produto, tipo (original|quadrada), caminho, dimensões, sha256
ad_accounts         plataforma, id externo, nome, moeda
campaigns           conta, id externo, nome, objetivo, status, orçamento, ref_code único
daily_metrics       campanha + dia únicos: gasto, impressões, cliques, leads da plataforma
leads               origem, campanha, ref_code, contato, estágio, valor orçado, valor ganho
lead_events         histórico de mudança de estágio
recommendations     regra, campanha, payload, estado (rascunho|aprovada|rejeitada)
sync_runs           início, fim, sucesso, linhas, mensagem
audit_log           ação, entidade, payload
```

Chave do desenho: `daily_metrics` sempre por upsert em (campanha, dia). É isso que permite re-sincronizar os últimos dias sempre que o PC liga, sem duplicar. Venda não é tabela separada: é `estágio = venda` com valor e data.

## 7. Tracking e atribuição propostos

Sem tocar no site, o que já dá para fazer:

- Cada campanha recebe um **código curto** (`MP-042`). O painel gera o link do site com UTMs padronizadas e um link `wa.me` com mensagem pronta terminando em `[ref MP-042]`.
- O vendedor vê o código na conversa do WhatsApp e registra o lead com ele. Esse é o elo entre o anúncio e a venda real, e não depende de Pixel.
- As duas verdades ficam separadas na tela: o que a Meta atribui e o que a NGD observou. Nunca somadas.

Vira especificação escrita, sem código: Pixel, Conversions API, Insight Tag, consentimento e deduplicação. Motivo: **o site está em outro repositório e não sabemos a tecnologia dele**. Uma ressalva honesta: a Conversions API não pode rodar neste painel, porque `127.0.0.1` não é alcançável pelo site; ela tem de rodar no servidor do site.

## 8. Integrações e permissões necessárias

**Meta Marketing API (leitura)**: a permissão `ads_read` funciona **sem revisão de app** se o usuário tiver papel no app e papel na conta de anúncios. Caminho viável: manter o app em desenvolvimento e usar token longo de 60 dias, renovável. Token permanente exigiria Portfólio Empresarial.

**claude-ads** (`AgriciDaniel/claude-ads`): avaliado. É Python 3.11/3.12, licença MIT, cerca de 9,5 mil estrelas, 124 commits, integra 12 plataformas, opera somente leitura com aprovação humana. **Não é uma biblioteca para embutir num painel Node**: é um conjunto de skills e agentes feito para ser usado pelo Claude. Recomendação: usar **ao lado**, não dentro. Ele cobre auditoria e planejamento de campanha; nosso painel cobre o que ele não tem, que é o catálogo da NGD, o funil comercial por WhatsApp e a receita confirmada. Instalar é um passo separado e não altera o painel nem suas dependências.

## 9. Riscos técnicos, financeiros, legais e operacionais

1. **Conta de anúncios em perfil pessoal de funcionário** concentra dinheiro, histórico e acesso numa pessoa. Recomendo Portfólio Empresarial da NGD, cartão da empresa, dono como administrador.
2. **Teto de gasto tem de existir na Meta**, não só no software. Se o PC desligar, o único limite que vale é o da plataforma.
3. **Página de 1,6 mil seguidores sem administrador conhecido.** Não bloqueia: os anúncios saem pela Página que já usamos.
4. **Registro manual de leads é o elo fraco.** Se ninguém anotar o código de referência, a verdade da NGD fica vazia e o módulo perde o sentido. Isso é processo, não software.
5. **LGPD**: nome e telefone de leads ficam em `data/ads.sqlite`, só no PC da loja, fora do git, com função de apagar. Esse banco nunca vai para o PC de casa.
6. **`node:sqlite` é experimental**: risco baixo com a versão do Node fixada; atualizar o Node passa a ser evento que exige rodar os testes.
7. **Site é caixa-preta**: sem saber a tecnologia, nenhum tracking pode ser prometido.
8. **Anúncio gasta dinheiro de verdade.** A regra de custo zero vale para as ferramentas, não para a mídia.

## 10. Plano por fases e critérios de aceite

**Etapa 0 — Decisões (sem código).** Pronto quando houver: verba mensal e teto definidos, conta de anúncios escolhida, token de leitura obtido e testado, 5 a 10 produtos prioritários listados, responsável por registrar leads definido e critério de "lead qualificado" escrito.

**Etapa 1 — Fundação.** Banco com as 10 tabelas, catálogo, pipeline de imagem, aba "Mídia paga" no painel. Pronto quando: migrações criam o banco em memória no teste, cadastro de produto funciona, upload gera a imagem 1080x1080 verificada por ffprobe sem destruir o original, os 14 testes atuais continuam passando e o módulo de vídeos segue publicando. **Não depende de credencial.**

**Etapa 2 — Meta somente leitura + funil.** Pronto quando: sincronizar duas vezes o mesmo período não duplica nada, a loja vê gasto por campanha dos últimos 30 dias, um lead registrado com o código cai na campanha certa, e a tela mostra lado a lado o que a Meta diz e o que a NGD observou.

**Etapa 3 — Recomendações por regras.** Três regras, em rascunho, com aprovar ou rejeitar e registro de auditoria. Nenhuma chamada de escrita existe no código. Um botão gera relatório em Markdown para colar numa conversa com a IA já contratada.

Depois do MVP, nesta ordem: tracking no site → hospedagem pública das imagens → escrita na plataforma → LinkedIn.

## 11. Arquivos prováveis da Fase 1 (nenhum alterado ainda)

Criar: `lib/ads/db.mjs`, `lib/ads/catalog.mjs`, `lib/ads/images.mjs`, `lib/ads/routes.mjs`, `public/ads/index.html`, `public/ads/ads.js`, `public/ads/ads.css`, `tests/ads-db.test.mjs`, `tests/ads-images.test.mjs`, `docs/ads/tracking-site.md`.
Alterar: `server.mjs` (uma linha), `public/index.html` (um link no menu), `package.json` (script e faixa de versão do Node).

## 12. Perguntas que o código não conseguiu responder

1. Qual conta de anúncios da Meta será usada e quem paga?
2. Verba mensal de teste e teto máximo?
3. Quem registra os leads no painel, e o que a NGD considera "lead qualificado"?
4. Quais 5 a 10 produtos entram primeiro no catálogo, e existem fotos deles?
5. Qual é a tecnologia do site e quem o mantém?
6. Objetivo inicial: conversa no WhatsApp, formulário ou visita ao site?
7. Ticket médio aproximado por linha de produto, para calcular retorno?

## 13. Recomendação objetiva do próximo passo

Começar pela **Etapa 1**, que não depende de nenhuma credencial nem de nenhuma decisão comercial, e responder as perguntas do item 12 em paralelo. Assim o catálogo e as imagens ficam prontos enquanto a burocracia da Meta anda.

> **Auditoria concluída. Nenhum arquivo, campanha, credencial ou dado real foi alterado. Aguardando autorização para a Fase 1.**
