# NGD · Central de conteúdo

Painel local da NGD Núcleo Gráfico Digital. Instagram: https://www.instagram.com/ngdgrafica/

## Abrir

Com Node.js instalado, execute `npm install` na primeira instalação e `npm start` para iniciar. Acesse http://localhost:3210. No Windows, `Iniciar-NGD.ps1` inicia o painel e o n8n em segundo plano e abre o navegador. O atalho Central NGD na área de trabalho faz a mesma coisa. O servidor só escuta no próprio computador.

## Funcionalidades entregues

- Biblioteca com upload MP4, MOV e WebM de até 500 MB, reprodução, edição de título e legenda, busca e filtros.
- Seleção de redes e planejamento de data/hora no calendário, usando o fuso do computador.
- Cadastro dos links dos perfis, configurações da loja e exportação do planejamento.
- Verificação real do endereço local do n8n usando `/healthz`.
- Histórico das alterações e gravação em disco, sem depender do armazenamento do navegador.
- Layout responsivo e estados vazios honestos, sem métricas fictícias.

## Próxima etapa: integrações reais

O n8n Community 2.39.6 está instalado com fluxos locais de diagnóstico e preparação da fila. Não há OAuth social, coleta de métricas ou publicação automática nesta versão. Datas são planejamento local, não agendamentos enviados às redes. Salvar um link não autoriza acesso à conta. Os próximos passos são criar o administrador local no primeiro acesso ao n8n, configurar credenciais nas plataformas e implementar/testar os publicadores por rede. Consulte `automation/README.md` para operação e backup. Não inserir senhas de redes sociais no painel.

O visual usa uma marca tipográfica provisória com acentos de impressão CMY. O perfil do Instagram não pôde ser inspecionado automaticamente; não foram inferidos logo, cores oficiais, produtos ou métricas.

## Dados e backup

`data/dashboard.json` guarda os registros; `data/dashboard.json.bak` mantém a versão anterior; `data/videos/` guarda os vídeos. Copie toda a pasta `data` com o serviço parado para fazer um backup completo. A exportação pelo painel inclui só metadados. O arquivo de dados malformado interrompe a inicialização, evitando sobrescrever registros existentes. O painel não tem login e não deve ser exposto à internet ou à rede local sem implementar autenticação e HTTPS.

As credenciais futuras devem ficar no n8n. Nenhum serviço pago é usado pelo painel. Computador ligado, espaço em disco e internet continuam necessários conforme a operação.

## Verificação

`npm run check` verifica sintaxe. `npm test` usa dados temporários isolados para testar persistência, upload, edição, datas, mídia parcial, validações de perfis e bloqueio de origens externas. O teste de upload usa um cabeçalho mínimo de contêiner; não substitui validar a reprodução de um vídeo real da loja.
