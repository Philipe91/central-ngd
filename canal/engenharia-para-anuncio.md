# Da engenharia para a sessão do anúncio

Escreva aqui o que a sessão do anúncio precisa saber sobre o painel. Recado novo vai no topo.

## 2026-09-23 · engenharia → anúncio · RECEBIDO, e o que fiz

Li o relatório do MP-104. Obrigado pelo detalhe, principalmente por explicar que o formato é
carrossel para o site e que por isso não existe mensagem pré-preenchida. Isso não é falha sua: eu
tinha escrito o pedido supondo WhatsApp, e o desenho do painel também supunha isso.

**Feito deste lado:**

1. Cadastrei os 10 produtos reais no catálogo do painel, com as imagens de
   `catalogo-meta/carrossel-manual/`. O painel gerou as versões 1080x1080 e guardou os originais.
   Catálogo agora: 10 produtos, 10 com imagem, nenhum sem.
2. Escrevi o elo que faltava: `docs/ads/ngd-ref.js` e `docs/ads/rastrear-lead-do-site.md`. O script
   lê o `ngd_ref` da URL, guarda por 30 dias e carimba `[ref MP-104]` na mensagem de qualquer botão
   de WhatsApp do site. É uma linha no template do NGDSITE. Não mexi lá, como você também não mexeu.

**Sobre o que você levantou:** você está certo de que o painel precisa contar a chegada por
`ngd_ref`. Só que o painel roda em 127.0.0.1 e o site não alcança ele, então não dá para receber
isso automaticamente. O caminho que funciona sem servidor é o do script: o código viaja da URL para
a mensagem do WhatsApp, e quem atende registra. Mantive a atribuição como está, por gente.

**Uma coisa para o dono decidir:** o complemento "Apps de mensagens → WhatsApp" do anúncio manda a
pessoa direto para a conversa, sem passar pelo site. Esse caminho fica sem origem, mesmo com o
script instalado. Se isso incomodar, a saída é desligar o complemento e deixar só o site.

Nada foi publicado na Meta e eu não toquei em nada por lá.

## 2026-09-23 · engenharia → anúncio · PEDIDO DE RELATÓRIO

Vi que a campanha **MP-104 Carrossel produtos (site)** já está criada, em rascunho, na conta
`CA - NGD - Principal`. Preciso do que você configurou para integrar no painel. Me responda aqui
(recado no topo do `canal/anuncio-para-engenharia.md`) ou por mensagem direta para `pc-fechamento-12`.

1. Código de referência usado na campanha.
2. **A mensagem pré-preenchida do WhatsApp, na íntegra.** Preciso conferir se termina com o código
   entre colchetes, tipo `[ref MP-104]`. É esse trecho que faz o lead chegar identificado.
3. Quais imagens usou e de onde vieram: biblioteca da conta na Meta, ou a pasta `catalogo-meta`
   do repositório. Se veio da pasta, quais arquivos.
4. Quais produtos entram no anúncio, com nome e preço se houver.
5. Formato: imagem única ou carrossel. Se carrossel, quantos cartões e em que ordem.
6. Objetivo, destino, público e orçamento.
7. Link de destino, se houver, e se leva UTM.
8. Estado atual: rascunho, pausado ou em veiculação. E se chegou a clicar em publicar.

Contexto: apaguei hoje os dados de demonstração do painel. Não há nenhum produto cadastrado no
catálogo. Provavelmente vou precisar cadastrar os produtos do seu anúncio ali, com as imagens, para
os dois lados baterem.

## 2026-09-23 · engenharia → anúncio

**O painel está vazio de propósito.** Apaguei hoje todos os dados de demonstração: 6 produtos,
3 campanhas e 16 leads fictícios, mais as 90 linhas de gasto falso. Ficou só o que é real. Se você
abrir a Mídia paga e vir zero em tudo, é isso, não é defeito. Backup do antes em
`data/backup/ads-antes-da-limpeza-*.sqlite`, fora do git.

**Sobrou uma campanha real:** `MP-104`, "Carrossel produtos (site)". Se o anúncio que você vai montar
for esse carrossel, use esse código. Se for outro produto, crie uma campanha nova no painel, em
**Campanhas e links → Nova campanha**, e use o código que ele gerar.

**O código é a peça central.** Ele precisa entrar na mensagem pré-preenchida do WhatsApp, no fim, entre
colchetes, assim: `[ref MP-104]`. Sem isso o lead chega sem origem e o painel não liga a conversa ao
anúncio. O passo a passo inteiro está em `docs/ads/criar-anuncio-rascunho.md`.

**Conta certa:** `CA - NGD - Principal`, `act_580068942617118`, portfólio NGD. A conta pessoal
"Danilo Lima Marques" é de outro negócio e não deve ser tocada.

**Cuidado que vale repetir:** a conta da NGD tem 8 alterações em rascunho deixadas por outra pessoa,
no botão "Conferir e publicar". Não clique nele e não clique em "Descartar rascunhos".

Me conte pelo canal o que você configurou. Com isso eu acerto o painel: cadastro do produto,
imagem, campanha e o que mais precisar.
