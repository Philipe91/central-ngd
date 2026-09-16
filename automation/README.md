# Automação local da NGD

## Endereços

- Painel: http://localhost:3210
- n8n Community: http://localhost:5678

Os serviços escutam apenas em 127.0.0.1. Não há domínio, hospedagem ou plano pago.

## Abrir e iniciar

Use `Iniciar-NGD.ps1` na pasta do projeto para iniciar os dois serviços e abrir o painel. O script `automation/start-local.ps1` faz a mesma inicialização sem abrir uma janela do navegador. Os processos rodam ocultos, mas os serviços deixam de funcionar quando o computador é desligado.

## Primeiro acesso

No primeiro acesso ao n8n, crie sua conta de administrador local com seu próprio e-mail e senha. Essa senha não é a senha do Instagram. Nenhuma conta foi criada em seu nome e nenhum acesso social foi cadastrado pela instalação.

Os fluxos importados usam a conta proprietária inicial do n8n e devem aparecer após concluir o cadastro. A credencial **NGD · comunicação local** é exclusiva da comunicação entre painel e n8n; não é um acesso de rede social.

## Fluxos incluídos

1. **NGD · Verificar conexão do painel**: responde a uma chamada local autenticada. O painel usa esse fluxo para mostrar a conexão real.
2. **NGD · Preparar fila local (sem publicar)**: confere o planejamento a cada cinco minutos e reconstrói as pendências por vídeo e rede, sem duplicar registros. Também pode ser executado manualmente no editor.

As duas automações são de preparação. Não baixam vídeos do Instagram, não publicam, não coletam métricas e não contêm conectores sociais prontos. Cada publicador ainda requer implementação, permissões e um teste real após configurar a conta. Aprovação de aplicativos e endereços de retorno exigidos pelas plataformas serão tratados nessa etapa, sem expor automaticamente o computador à internet.

## Configuração instalada

- n8n 2.39.6 em `.runtime/n8n`, separado das dependências do painel.
- Fuso `America/Sao_Paulo`.
- Banco SQLite e arquivos do n8n em `data/n8n/.n8n`.
- Chave persistente em `data/automation-secrets.json`, usada para criptografar credenciais no banco.
- Token da comunicação local armazenado fora do código e nunca retornado ao navegador.
- Retenção de execuções: sete dias, até mil execuções.
- Dados binários em disco e diagnóstico de uso desativado.
- Logs em `data/n8n.log`, `data/n8n-error.log`, `data/dashboard.log` e `data/dashboard-error.log`.

## Backup e manutenção

Guarde juntos o banco do n8n e `data/automation-secrets.json`; sem a chave as credenciais salvas não podem ser recuperadas. Para backup consistente de toda a pasta `data`, pare os dois serviços primeiro. O botão de exportar planejamento no painel não exporta credenciais ou vídeos.

Não apague a pasta de dados para atualizar o n8n. Faça backup antes de atualizar, mantenha as variáveis de `n8n.mjs` e teste os dois fluxos novamente.

## Reproduzir instalação

O pacote vem do registro oficial npm. Nesta instalação foi necessário `--legacy-peer-deps` para resolver conflitos de dependências opcionais do pacote. A versão fica fixada e o lockfile fica em `.runtime/n8n`.

```powershell
npm.cmd install --prefix .runtime/n8n n8n@2.39.6 --omit=dev --no-audit --no-fund --prefer-online --legacy-peer-deps
node automation/n8n.mjs --version
node automation/create-workflows.mjs
node automation/n8n.mjs import:credentials --input=data/n8n-import-credential.json
node automation/n8n.mjs import:workflow --input=automation/workflows.json
node automation/n8n.mjs publish:workflow --id=ngdLocalHealth01
node automation/n8n.mjs publish:workflow --id=ngdPrepareQueue01
```

Importar novamente substitui os fluxos com esses IDs. Não faça isso depois de personalizá-los sem exportar uma cópia. Remova o arquivo temporário `data/n8n-import-credential.json` após importar a credencial com sucesso. Os comandos de publicação acima ativam fluxos dentro do n8n local; não publicam conteúdos na internet.
