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

A saída é manter a cor do kit como identidade (ícones, barras, gráficos, bordas) e ter um tom escurecido de cada uma para quando houver texto em cima. Os valores finais ficam na Etapa 1, com a tabela completa.
