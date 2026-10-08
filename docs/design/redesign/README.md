# Redesign da Central NGD — 6 de outubro de 2026

Implementação visual no sistema existente, sem framework, build, CDN ou dependência nova.

## Auditoria e mapa da interface

| Área | Arquivos e componentes | Dependências preservadas |
| --- | --- | --- |
| Shell | `index.html`, `style.css`, `theme.css`: sidebar, marca, header, container e footer | `#nav`, `#breadcrumb`, `#main`, rotas por hash e delegação de eventos |
| Operação | `app.js`: visão geral, biblioteca, calendário, redes, fila e configurações | `data-new`, `data-import`, `data-edit`, `data-publish`, `data-retry`, `data-delete`, `data-month`, `data-filter`, `data-test`, IDs e nomes dos formulários |
| Modais | `index.html` e estilos em `theme.css` | HTML original integralmente preservado; upload, preview, tipos, redes, datas e ações de fechar/salvar |
| Design system | `ui/kit.css`: famílias `k-card`, `k-kpi`, `k-btn`, `k-field`, `k-table`, `k-tabs`, `k-badge`, `k-product`, `k-chart` e primitivas de layout | Prefixo existente e escopo `k-scope` mantidos |
| Gráficos | `ui/charts.js` e `charts.js` | SVG local, `data-spec`, `data-kind`, `data-w`, `data-c`, `wire()` e `paint()` compatíveis com a CSP |
| Resultados | `resultados.js` | `resumoResultados()` intacta, estados reais, ação `#collect`, URLs e ausência de dados |
| Mídia paga | `ads.js`, `ads-dashboard.js` | `data-ads-*`, `data-dash-*`, IDs, campos `name`, botões `.primary` dos formulários e linhas `tr` ao redor dos selects dos leads |

As inconsistências principais eram as duas paletas e linguagens de campos, badges e tabelas; tipografia pequena; espaços amplos nos gráficos; falta de destaque operacional às falhas; ranking com títulos apertados; e comparação de comentários/compartilhamentos na escala das curtidas.

O maior risco era alterar hooks ou estrutura usados pelos eventos, especialmente os formulários e linhas dos leads. O trabalho concentrou-se em CSS, adicionando apresentação somente onde necessário. Os arquivos do servidor e de `lib/` foram comparados ao checkpoint e permaneceram idênticos. O polling de `app.js` e o HTML de `index.html` também foram comparados e preservados.

## Direção e mudanças

- Fundo frio `#f3f6fa`, branco, texto azul escuro `#182e49`, ação NGD `#205ca5`, bordas suaves e CMYK na assinatura da marca.
- Poppins local nos títulos principais e fonte do sistema para leitura operacional, tabelas e números. Nenhum download de fonte.
- Tokens `k-` como fonte compartilhada: `theme.css` usa aliases para compatibilidade com os componentes existentes. Radius, shadow, spacing, foco, tabelas, campos e estados unificados.
- Shell mais compacto, conteúdo largo em monitores grandes, estados ativos claros e sem animações de entrada repetidas pelo polling.
- Visão geral destaca planejamento e problemas; biblioteca mantém todos os metadados e ações; calendário distingue hoje e estados; redes destacam problemas de conexão.
- Fila mostra contagens por estado e causas de falha no topo, com a ação de tentar novamente existente; a lista completa e sua ordem permanecem disponíveis.
- Resultados: período das publicações registradas, última atualização, coleta diária às 7h, total e cobertura, domínio do gráfico com margem proporcional, tooltip com data e séries acessível por teclado, donut com total, valores e percentuais por rede, ranking numerado e tabela com números alinhados e cabeçalho sticky.
- Engajamento usa escala separada por indicador, compartilhada entre redes, com valores absolutos. Comentários não competem com curtidas na mesma escala. A legenda explica como comparar.
- A série de alcance continua somando visualizações por dia de publicação. A interface explicita que ela não é um histórico de crescimento diário, pois esses dados não existem.
- Mídia paga conserva foco em leads, qualificação e orçamento; catálogo, abas e formulários seguem o kit; o código de campanha reutiliza o mecanismo de copiar existente. Nenhuma métrica financeira nova.

## Validação

- `npm run check`: aprovado.
- `npm test`: 51 testes aprovados, zero falhas. Inclui upload, edição, planejamento, imagens, fila, contratos e publicação contra o mock isolado. Dois testes adicionais verificam as escalas independentes de engajamento e a apresentação segura de Resultados.
- 63 verificações de navegador no Chrome: oito telas em 1366×768, 1440×900, 1600×900, 1920×1080 e 390×844; modais de novo conteúdo/importação/edição, seleção de carrossel, filtros, busca, navegação de mês, tooltip por teclado, links e abas/formulários de Mídia paga.
- Zero erros JavaScript e zero transbordamentos horizontais de página nas verificações finais.
- Capturas reais estão nesta pasta; o registro está em `qa.json`.
- Preview separado com a CSP original, snapshot de `/api/state`, acesso somente GET a uma lista restrita de endpoints de Mídia paga e mídias locais. Todos os métodos de escrita foram bloqueados. A verificação `/api/n8n/status` foi bloqueada deliberadamente, aparecendo em `qa.json`; as capturas de Automações não certificam disponibilidade do serviço.
- Não houve upload, edição, exclusão, reenvio, coleta, teste de conexão externa nem publicação em produção. A verificação funcional dessas operações é pelos testes isolados; o funcionamento real de serviços externos não foi certificado por esta sessão.
- Conteúdos cadastrados, horários, integrações, endpoints, payloads, banco, backend e n8n não foram alterados pelo redesign.

## Como ver e reverter

Atualize a Central NGD com **Ctrl+F5**. Os arquivos estáticos são servidos pelo processo existente; não é necessário reiniciar a automação.

Checkpoint anterior: `C:\projetos\checkpoints\MidiasNGD-antes-redesign-20261006-165323`.
Para reverter apenas esta interface, restaure desse checkpoint os arquivos `public/theme.css`, `public/ui/kit.css`, `public/ui/charts.js`, `public/app.js`, `public/resultados.js`, `public/ads.js` e `public/ads-dashboard.js`. Isso não requer restaurar nem substituir dados de produção.
