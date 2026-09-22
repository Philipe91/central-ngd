# Redesign do painel: SaaS Dashboard UI Kit

Referência: [SaaS Dashboard UI Kit](https://penpot.app/penpothub/libraries-templates/saas-dashboard-ui-kit), autor "SaaS Design", Penpot Hub.
Os valores abaixo foram lidos do próprio arquivo `.penpot` (componentes, tipografias, sombras), não estimados a partir de imagem.

## Pastas

- `before/`: as 8 páginas do painel antes do redesign, 1440px, página inteira (commit `dc1d69c`).
- `kit/`: miniaturas dos frames do kit (dashboard, dashboard com menu recolhido, tasks, contacts, chat, styleguide).
- `after/`: o mesmo enquadramento de `before/`, preenchido a cada etapa.

## Etapa 0: ponto de partida

- `npm run check`: ok. `npm test`: 20 testes, 20 passaram.
- Painel em `127.0.0.1:3210`, oito rotas: overview, contents, calendar, networks, automations, results, midia, settings.

### Por que o painel atual parece "feito por IA"

A cor já é do kit desde o commit `4de67d1`; o que denuncia é a estrutura:

| No painel hoje | No kit |
| --- | --- |
| Sobretítulo em caixa alta ("CENTRAL DE CONTEÚDO") + título de marketing + subtítulo em toda página | Sem cabeçalho de página. A barra do topo é uma busca; a ação principal fica sozinha à direita |
| Cartão "workspace" e rótulo "GERENCIAR" no menu | Menu limpo: perfil no topo, itens, divisor, Settings, "Toggle sidebar" no rodapé |
| Quatro cartões KPI com ícone no canto e frase explicativa | Cartões grandes com título + filtro "Show: This week ▾" no cabeçalho e o conteúdo real dentro |
| Etiquetas em pílula com fundo claro | Etiquetas retangulares, cor cheia, 11px |
| Trilha numerada "1 → 2 → 3", checklist "Primeiros passos", rodapé com slogan | Nada disso: a tela mostra dados |
| Cantos 8 a 12px, sombra difusa | Canto 4px, sombra `0 6px 18px rgba(0,0,0,.06)` |
| Gráficos de barra finos | Área com degradê, grade tracejada, marcador com balão; rosca grossa com o percentual grande e colorido no centro |

### Medidas extraídas do `.penpot`

- **Tipografia (Poppins):** Large 56/500 · H1 20/500 · H2 18/500 · H3 15/500 · Subtitle1 14/500 · Subtitle2 13/500 · Body1 13/400 · Body2 12/400 · Small1 12/500 (+0,2px) · Small2 11/500 · Small3 10/400 · Button 13/600. Espaçamento entre letras 0,1px na maioria.
- **Cantos:** 4px em quase tudo (95 ocorrências), 2px em miúdos, 12px só em 2 casos.
- **Sombras:** cartão `0 6px 18px rgba(0,0,0,.06)` (e a variante lateral `6px 0 18px` do menu); botão primário `0 4px 10px rgba(16,156,241,.24)`; hover `0 8px 16px rgba(52,175,249,.2)`; pressionado `0 2px 6px rgba(9,142,223,.3)`; menu suspenso `0 0 16px rgba(0,0,0,.14)`.
- **Ícones:** 52 componentes, grade 20×20 (menu) e 24×24 (outros), traço 1,4px, cor `#c2cfe0` inativo e `#109cf1` ativo. Convertidos para SVG em `currentColor`. Os que o painel precisa e o kit não tem (calendário, gráfico, enviar, baixar, automação) são desenhados na mesma grade e no mesmo traço.

### Contraste: onde o kit falha (WCAG AA, mínimo 4,5:1 para texto normal)

| Par | Razão | Uso permitido |
| --- | --- | --- |
| cinza `#90a0b7` sobre branco | 2,66 | só ícone e borda; texto secundário usa `#707683` (4,56) |
| branco sobre azul `#109cf1` | 2,98 | o botão primário precisa de um azul mais escuro para o texto |
| branco sobre vermelho `#f7685b` | 2,96 | idem, etiqueta vermelha escurece |
| branco sobre verde `#2ed47a` | 1,94 | etiqueta verde escurece |
| branco sobre amarelo `#ffb946` | 1,71 | etiqueta amarela usa texto `#192a3e` (8,52) |

A saída é manter a cor do kit como identidade (ícones, barras, gráficos, bordas) e ter um tom escurecido de cada uma para quando houver texto em cima.

## Etapas 1 a 4: sistema visual e vitrine

Arquivos novos, sem tocar no painel atual (index.html, app.js, ads.js, charts.js, style.css e theme.css seguem iguais):

- `public/ui/kit.css`: cores com nome por função e componentes do kit, todos com prefixo `k-` (casca com menu de 256px e barra de busca de 60px, cartão com filtro "Mostrar: … ▾", cartão de item, faixa de dias, barra de progresso, etiqueta 84×22, botões, campo com linha embaixo, tabela de linha 64px, legenda de bolinha vazada, janela, aviso).
- `public/ui/icons.js`: 41 ícones, 14 KB. Os do kit convertidos do `.penpot`; os que faltavam desenhados na mesma grade 20×20 e traço 1,4px. `icon(nome, {size, label})`.
- `public/ui/charts.js`: área com degradê, linha, colunas com topo arredondado, barras horizontais, rosca de anel fino com número grande no centro, minigráfico e legenda. SVG puro, desenhado na largura real do cartão (o texto fica em 12px de verdade) e redesenhado se ela mudar; balão escuro que segue o mouse. Cores em atributos `fill`/`stroke`, que a CSP permite.
- `public/kit.html` + `public/ui/kit-demo.js`: a vitrine. Abre em `http://127.0.0.1:3210/kit.html` e mostra Visão geral, Conteúdos, Resultados e Componentes com os dados reais de `/api/state`. Gráficos de tendência usam números de exemplo, com isso escrito na tela, porque a base ainda tem 3 conteúdos.

Desvio do plano, de propósito: as cores novas ficaram no próprio `ui/kit.css`, e não em `theme.css`, para o painel atual não mudar enquanto a vitrine não é aprovada. `theme.css` e `style.css` saem na Etapa 8.

### Contraste de todos os pares usados

| Par | Cores | Razão | Mínimo |
| --- | --- | --- | --- |
| Título | #192a3e sobre branco | 14,56 | 4,5 |
| Título de cartão e tabela | #323c47 sobre branco | 11,21 | 4,5 |
| Menu e rótulos | #334d6e sobre branco | 8,65 | 4,5 |
| Corpo e eixos | #4c5862 sobre branco | 7,29 | 4,5 |
| Texto secundário | #707683 sobre branco | 4,56 | 4,5 |
| Rótulo "Mostrar:" | #6a707e sobre branco | 4,96 | 4,5 |
| Placeholder | #6b7788 sobre branco | 4,55 | 4,5 |
| Link e item ativo | #0d7cc0 sobre branco | 4,51 | 4,5 |
| Botão primário | branco sobre #0d7cc0 (hover #0b6fae: 5,39) | 4,51 | 4,5 |
| Etiqueta Publicado | branco sobre #1d874d | 4,54 | 4,5 |
| Etiqueta Com falha | branco sobre #c35248 | 4,54 | 4,5 |
| Etiqueta Rascunho | #192a3e sobre #ffb946 | 8,52 | 4,5 |
| Etiqueta Planejado | branco sobre #8457f1 | 4,55 | 4,5 |
| Etiqueta Manual | #4c5862 sobre #ebeff2 | 6,31 | 4,5 |
| Balão do gráfico | branco sobre #192a3e | 14,56 | 4,5 |
| Filtros sobre o fundo | #334d6e sobre #f5f6f8 | 8,00 | 4,5 |
| Linha de gráfico e ícone ativo | #109bf0 sobre branco | 3,01 | 3 (objeto gráfico) |

O ícone inativo `#c2cfe0` (1,58) é decorativo: sempre vem com o nome do item ao lado. O azul `#109bf0` fica a uma unidade do `#109cf1` do kit, diferença que não se vê, mas que leva a linha de 2,98 para 3,01.
