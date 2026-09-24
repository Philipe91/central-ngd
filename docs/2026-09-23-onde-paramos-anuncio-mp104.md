# Onde paramos: anúncio MP-104 e Páginas do Facebook (23/09/2026)

Leia isto para retomar. Resumo: o anúncio está **pronto, em rascunho**; falta a Meta liberar o
**controle total** da Página de 1,6 mil seguidores para o Danilo e conectar o Instagram a ela.

## 1. Anúncio MP-104 (Meta): pronto, em RASCUNHO

- Conta de anúncios: **CA - NGD - Principal** (`act=580068942617118`), portfólio atual NGD `106674360918788`.
- Campanha `MP-104 Carrossel produtos (site)`: objetivo Tráfego.
- Conjunto `MP-104 Brasilia e entorno - Site`: destino Site, Brasília +40 km, 18+, Advantage+, **R$ 20/dia**
  (a Meta não aceita vazio), sem data de término.
- Anúncio `MP-104 Carrossel 10 produtos`: carrossel de 10 cards, botão **Saiba mais**, cada card leva à
  página do produto com `?utm_source=meta&utm_medium=paid&utm_campaign=MP-104&ngd_ref=MP-104`.
- Identidade: Página **NGD Núcleo Gráfico** (facebook.com/ngdgrafica, 1,6 mil, ID 663854180311679) +
  Instagram **@ngdgrafica**. WhatsApp que a Meta puxou da Página nova: +55 61 9649-8102 (antes 9649-8279);
  **confirmar qual número o comercial usa**.
- Desligados: "Cartão final do perfil" e "Destacar cartão do carrossel" (a ordem fica fixa).
- **Nunca foi publicado.** Não mexer nos 8 rascunhos de outra pessoa nem em "Descartar rascunhos".
- Link direto do editor:
  `https://adsmanager.facebook.com/adsmanager/manage/ads/edit/standalone?act=580068942617118&business_id=106674360918788&selected_campaign_ids=120247297884890160&selected_adset_ids=120247297884880160&selected_ad_ids=120247297884870160`

**Falta decidir antes de publicar:** orçamento final, região (Brasília ou Brasil) e aprovação do superior.

## 2. Documentos (Claude Docs)

- Aprovação para o superior: **Anúncio Carrossel NGD — MP-104**: https://claude.ai/artifact/XMH9Eay5tX4UBTT3Q1ZKhv
  (já atualizado com a Página de 1,6 mil). Precisa **compartilhar** pelo menu antes de enviar.
- Tutorial para a Carol: **Como passar o acesso da Página do Facebook da NGD**: https://claude.ai/artifact/WzRbiVKE2BDCDKfKWtbMu5

## 3. Arquivos do carrossel (este repositório)

- Pasta: `catalogo-meta/`
  - `carrossel-manual/01..10-*.jpg`: os 10 cards (1080×1080), já enviados à biblioteca da conta.
  - `carrossel-manual/ROTEIRO.md`: títulos, links e texto do anúncio.
  - `escolher-capas.html`: página para trocar as capas; exporta `~/Downloads/escolha-capas.json`.
  - `montar_carrossel.py`: refaz os cards a partir da escolha (`MANTER_FUNDO` = placa de campo com cenário).
  - `produtos.json`: os 12 produtos da loja (nome, descrição, link).
- Fotos originais em alta: `C:\projetos\NGD\NGDSITE\media\products\` (só copiar, nunca editar o NGDSITE).
- Painel: campanha **MP-104** criada em Mídia paga (manual, "Carrossel produtos (site)").
- Relatório para a engenharia: `canal/anuncio-para-engenharia.md`, commit local `0c09240`.
  **Falta `git push`** (foi bloqueado aqui; rodar `git push` manualmente).

## 4. Páginas do Facebook: onde travou

| Página | Link | Seguidores | Situação |
|---|---|---|---|
| NGD Núcleo Gráfico | facebook.com/ngdgrafica | 1,6 mil | Do portfólio **antigo** `225559398223639` ("NGD NÚCLEO GRÁFICO DIGITAL"). Danilo tem acesso **parcial** (conteúdo, mensagens, anúncios, insights). WhatsApp já conectado. **Instagram não conectado.** |
| NGD Núcleo Gráfico Digital - Sinalização e Comunicação Visual | facebook.com/nucleograficodigital | 16 | Do portfólio atual. Ainda com o @ngdgrafica conectado. Desativar **só no fim**, com confirmação. |

- A conta da Carol ("Carol Lima Sobrancelhas") está logada no Chrome e administra o portfólio antigo.
- Tentativa feita: portfólio antigo → Parceiros → Adicionar → "Conceder a um parceiro acesso" → ID
  `106674360918788` → Página NGD Núcleo Gráfico → **Acesso total**. Passou pelas verificações (SMS e e-mail),
  mas a Meta respondeu duas vezes **"Não foi possível atribuir ativos — tente novamente mais tarde"**.
  Nada foi alterado.

## 4b. Atualização do fim do dia (23/09)

- O compartilhamento via Parceiros falhou **3 vezes** ("Não foi possível atribuir ativos"), mesmo com os
  códigos de SMS e e-mail. **Abandonado**: o usuário só quer que o Danilo poste e anuncie (isso ele já
  consegue com o acesso parcial) e que o Instagram fique ligado à Página de 1,6 mil.
- Caminho que funciona: **conta da Carol** → Trocar para a Página NGD Núcleo Gráfico →
  `facebook.com/settings/?tab=linked_instagram` → Conectar conta → Conectar → mensagens do Instagram na
  Caixa de Entrada **ligado** → Continuar. Aí a Meta abre uma **janela do Instagram pedindo login do
  @ngdgrafica** (senha e confirmação). **Parou aqui**: o usuário faz amanhã, com o chefe presente.
- Depois de conectar: conferir em Contas vinculadas se aparece @ngdgrafica, e trocar o token do n8n.

## 4c. 24/09: Instagram CONECTADO à Página de 1,6 mil

- Pela conta da Carol → Business Suite da Página → "Conectar o Instagram" → login @ngdgrafica →
  **Trocar de Página** (vem marcado "Manter"!) → Confirmar → Adicionar. A parte do portfólio deu erro
  ("Não foi possível adicionar… a uma conta comercial"), mas a **conexão ficou feita**: Contas vinculadas mostra
  "Connected Instagram @ngdgrafica". O Instagram NÃO foi para o portfólio antigo (melhor assim).
- Conexão "com alguns recursos": para post cruzado e insights comparados, falta "Analisar conexão" (senha do IG).
- O @ngdgrafica saiu da Página antiga (16).
- Falta: logar o Chrome de volta como **Danilo** e conferir o MP-104 (identidade Página 1,6 mil + @ngdgrafica).
- **Central NGD:** o n8n usa token da Página antiga (624749137386814) para Facebook e Instagram. O Instagram
  agora está ligado à Página 663854180311679 → gerar token novo dessa Página e trocar no n8n.

## 5. Próximos passos, em ordem

1. **Tentar de novo o compartilhamento** (passo acima) daqui a algumas horas ou amanhã.
   Alternativa: portfólio antigo → Pessoas → Convidar o **e-mail do Danilo** como administrador.
2. No portfólio atual (`106674360918788`), dar **controle total** da Página ao Danilo.
3. Conectar o Instagram @ngdgrafica à Página de 1,6 mil: como a Página → Configurações → Contas vinculadas
   → Instagram → Conectar conta (pode pedir login do Instagram; quem digita é o usuário).
4. Conferir o número de WhatsApp do anúncio (8102 ou 8279).
5. Superior aprova o documento → definir orçamento/região → publicar (quem clica é o dono).
6. **Antes de desativar a Página antiga:** a Central NGD (n8n) publica vídeos na Página pequena
   (ID 624749137386814) com um token de Página dela. Gerar um token novo para a Página de 1,6 mil
   (ID 663854180311679) e trocar no n8n, senão as publicações automáticas no Facebook param.
7. Só então **desativar** (não excluir) a Página antiga de 16 seguidores.

Regras: não publicar sem ordem explícita; senha, código de SMS/e-mail e chave de acesso são sempre
digitados pelo usuário; não excluir nada.
