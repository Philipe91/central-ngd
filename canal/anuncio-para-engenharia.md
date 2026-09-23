# Da sessão do anúncio para a engenharia

Escreva aqui o que a engenharia precisa saber ou fazer no painel. Recado novo vai no topo.

<!-- modelo:
## AAAA-MM-DD · anúncio → engenharia
Fiz: ...
Preciso: ...
Travou: ...
-->

## 2026-09-23 · anúncio → engenharia · RELATÓRIO MP-104

**Resumo:** o MP-104 é um **carrossel que leva ao site**, não um anúncio de WhatsApp. O dono da loja
escolheu esse formato (modelo da Zago Calçados: cada card abre a página do produto). Por isso **não existe
mensagem pré-preenchida com `[ref MP-104]`**: o rastreamento é por **UTM + `ngd_ref`** nos links.

Fiz:

1. **Código:** `MP-104`, gerado no painel (`POST /api/ads/campaigns/manual`, nome "Carrossel produtos (site)",
   objective `LINK_CLICKS`). Está no nome da campanha, do conjunto e do anúncio na Meta.
2. **WhatsApp pré-preenchido:** não há. O destino é Site. O único WhatsApp no anúncio é o complemento padrão
   da Meta ("Apps de mensagens → WhatsApp +55 61 9649-8279"), um botão dentro do navegador do app, **sem
   mensagem com ref**. Um lead que vier por esse botão chega sem origem. Para o painel, o sinal é o
   `ngd_ref=MP-104` na URL de chegada ao site.
3. **Imagens:** vieram de `catalogo-meta/carrossel-manual/01..10-*.jpg` (1080×1080, fundo branco; o 10 mantém
   o cenário). Eu subi as 10 para a biblioteca da conta na Meta, com os mesmos nomes de arquivo. Origem das
   fotos: as originais em alta de `NGDSITE\media\products\` escolhidas pelo dono em
   `catalogo-meta/escolher-capas.html`. Scripts: `montar_carrossel.py` (lê `~/Downloads/escolha-capas.json`).
4. **Produtos (ordem dos cards), sem preço** (a loja mostra "Sob consulta"):

   | Card | Produto | slug |
   |---|---|---|
   | 1 | Totem Triedro em Poliondas | totem-triedro-em-poliondas |
   | 2 | Display de Chão | display-de-chao |
   | 3 | Display de Mão | display-recortado-mao-gigante |
   | 4 | Totem Elíptico | totem-eliptico-em-poliondas |
   | 5 | Banner Rollup | banner-rollup |
   | 6 | Totem Réplica em Poliondas | totem-replica-em-poliondas |
   | 7 | Cubo Promocional em Poliondas | cubo-promocional-em-poliondas |
   | 8 | Totem Triangular | totem-triangular |
   | 9 | Lixeira Personalizada em Poliondas | lixeira-personalizada-em-poliondas |
   | 10 | Placa de Campo em Poliondas | placa-de-campo-poliondas |

   Nome, descrição e link de cada um também estão em `catalogo-meta/produtos.json`.
5. **Formato:** Carrossel, 10 cards, na ordem acima. Desliguei "Destacar cartão do carrossel" (a ordem não
   muda) e "Cartão final do perfil". Ficaram ligados: Retoques visuais, Descrição dinâmica, Aprimorar CTA,
   Comentários relevantes. "Opções de exibição de formato" = Mídia única, Carrossel, Coleção (padrão da Meta).
6. **Configuração:**
   - Campanha `MP-104 Carrossel produtos (site)`: objetivo **Tráfego**, orçamento no conjunto.
   - Conjunto `MP-104 Brasilia e entorno - Site`: destino **Site**, meta "visualizações da página de
     destino", **Brasília +40 km**, 18+, posicionamentos Advantage+, **R$ 20,00/dia** (a Meta não aceita
     orçamento vazio), início 23/09/2026, sem término.
   - Anúncio `MP-104 Carrossel 10 produtos`: Página "NGD Núcleo Gráfico Digital - Sinalização e Comunicação
     Visual" + Instagram @ngdgrafica; botão **Saiba mais**.
7. **Links (todos com UTM):**
   - Card: `https://nucleografico.com.br/loja/produto/<slug>/?utm_source=meta&utm_medium=paid&utm_campaign=MP-104&ngd_ref=MP-104`
   - "Ver mais" geral: `https://nucleografico.com.br/loja/?utm_source=meta&utm_medium=paid&utm_campaign=MP-104&ngd_ref=MP-104`
   - O campo "Parâmetros de URL" da seção Rastreamento ficou vazio, para não duplicar.
8. **Estado:** **rascunho**, nada publicado. Não cliquei em Publicar em nenhum momento. No "Publicar itens de
   rascunho?" cliquei em Fechar. Não toquei nos rascunhos que já existiam nem em "Descartar rascunhos". Os +3
   no contador (8 → 11) são a campanha, o conjunto e o anúncio do MP-104.

Preciso:

- Que o painel conte a chegada ao site com `ngd_ref=MP-104` (ou `utm_campaign=MP-104`) como origem do lead,
  porque neste anúncio não há mensagem de WhatsApp com ref.
- Se quiserem o `[ref MP-104]` no WhatsApp também: o botão "Chamar no WhatsApp" das páginas de produto do site
  teria que ler o `ngd_ref` da URL e colocá-lo na mensagem. Isso é mudança no NGDSITE, e não mexi lá.
- Para cadastrar os produtos no painel: use os 10 JPGs de `catalogo-meta/carrossel-manual/` e o
  `produtos.json`. Preço: nenhum.

Travou:

- Nada na Meta. Pendente com o dono: orçamento final, se a região vira o Brasil todo, e a troca da Página do
  anúncio para a Página de 1.600 seguidores, quando o Danilo receber o acesso a ela.
