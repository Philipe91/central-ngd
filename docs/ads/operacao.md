# Mídia Paga: como operar

Documento curto de operação do módulo. Lido por pessoas, não chamado por código.

## Abrir

Atalho **Central NGD** na área de trabalho, depois **Mídia paga** no menu do painel.

## Dados de demonstração

Para ver o módulo cheio, treinar o uso ou desenhar a interface sem ter conta de anúncios:

```powershell
node automation/ads-demo.mjs            # insere 6 produtos, 3 campanhas, 30 dias de gasto e 16 leads
node automation/ads-demo.mjs --limpar   # remove só o que o script criou
```

Tudo que ele cria é marcado: produto com código começando em `DEMO-`, campanha com identificador `demo:` e lead com observação `[demo]`. A limpeza apaga apenas isso, então cadastro real nunca é tocado. Os números são sorteados com semente fixa, então rodar duas vezes dá o mesmo resultado.

## O ciclo do dia a dia

1. **Catálogo**: cadastre o produto e envie a foto. O painel gera a versão 1080x1080 com fundo branco e guarda o original.
2. **Campanhas e links**: crie a campanha e copie os dois links. Use o link de WhatsApp no botão do anúncio e o link do site quando a pessoa for para a loja.
3. Monte o anúncio no Gerenciador da Meta usando a imagem quadrada e o link copiado. O painel não cria anúncio.
4. **Leads**: quando alguém chamar, registre com o código que veio na mensagem, no formato `[ref MP-001]`. Vá mudando o estágio conforme a conversa anda e preencha o valor quando virar orçamento ou venda.
5. A tela de leads mostra lado a lado o que a Meta atribui e o que a NGD observou.

## Conectar a Meta (quando houver token)

Ainda não está conectada. Quando o token de leitura existir, ele e o identificador da conta são salvos em `data/ads-secrets.json`, fora do git. A partir daí o painel lê gasto, impressões, cliques e leads atribuídos, e nada mais: o código que escreve na plataforma não existe.

## Backup

O banco fica em `data/ads.sqlite`, fora do git, só neste computador. A rota de backup grava uma cópia em `data/backup/` e mantém as sete últimas. Leads guardam nome e telefone, então esse arquivo nunca deve ser copiado para o outro PC.

## Limites conhecidos

- Sem gasto registrado, os indicadores de custo aparecem como traço, não como zero.
- Lead sem código de referência entra no total da NGD, mas não é ligado a nenhuma campanha.
- O número da plataforma e o da NGD contam coisas diferentes e nunca devem ser somados.
