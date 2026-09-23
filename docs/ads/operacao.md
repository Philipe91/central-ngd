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

## A aba Dashboard

Primeira aba do módulo. Responde uma pergunta só: os anúncios estão trazendo lead, lead bom e pedido de orçamento?

No topo ficam os filtros de período (7, 30 ou 90 dias, todo o período, ou um intervalo escolhido a dedo) e o de campanha. Trocar qualquer um dos dois refaz os indicadores, os gráficos e as tabelas juntos. O padrão é 30 dias e todas as campanhas.

Duas contagens de tempo convivem na tela, e é importante não confundir:

- **Evolução da captação** usa a data em que a coisa aconteceu. O lead entrou no dia 3 e foi qualificado no dia 7: ele aparece no dia 3 na linha de leads e no dia 7 na de qualificados. Serve para ver o ritmo.
- **Funil dos leads** e **Resultados por campanha** usam os leads que nasceram no período e até onde cada um chegou até hoje. Serve para ver quanto daquela safra andou.

Por isso os números das duas partes não batem, e somar os dois dá resultado errado. Passar o mouse no título de cada bloco mostra essa explicação.

Quando os dados vierem do script de demonstração, a Dashboard avisa em faixa amarela no topo. Número fictício nunca se passa por resultado real.

## O ciclo do dia a dia

1. **Catálogo**: cadastre o produto e envie a foto. O painel gera a versão 1080x1080 com fundo branco e guarda o original.
2. **Campanhas e links**: crie a campanha e copie os dois links. Use o link de WhatsApp no botão do anúncio e o link do site quando a pessoa for para a loja.
3. Monte o anúncio no Gerenciador da Meta usando a imagem quadrada e o link copiado. O painel não cria anúncio. O passo a passo completo, para uma pessoa ou para um agente, está em `docs/ads/criar-anuncio-rascunho.md`; ele termina em rascunho, sem publicar.
4. **Leads**: quando alguém chamar, registre com o código que veio na mensagem, no formato `[ref MP-001]`. Vá mudando o estágio conforme a conversa anda: Novo lead, Contato iniciado, Qualificado, Orçamento pedido, Proposta enviada, Fechado ou Perdido.
5. A tela de leads mostra lado a lado o que a Meta atribui e o que a NGD observou.

O anúncio da NGD não vende sozinho: ele capta contato e gera pedido de orçamento. Por isso o painel mede leads, leads qualificados, pedidos de orçamento, propostas e o custo de cada um deles. Valor de venda e receita não aparecem na tela. O estágio "Fechado" existe e não pede valor nenhum.

## Conectar a Meta (quando houver token)

Ainda não está conectada. Quando o token de leitura existir, ele e o identificador da conta são salvos em `data/ads-secrets.json`, fora do git. A partir daí o painel lê gasto, impressões, cliques e leads atribuídos, e nada mais: o código que escreve na plataforma não existe.

## Backup

O banco fica em `data/ads.sqlite`, fora do git, só neste computador. A rota de backup grava uma cópia em `data/backup/` e mantém as sete últimas. Leads guardam nome e telefone, então esse arquivo nunca deve ser copiado para o outro PC.

## Limites conhecidos

- Sem gasto registrado, os indicadores de custo aparecem como traço, não como zero.
- Quem avança continua contado nas etapas por onde passou: um lead que virou orçamento segue somando na conta de qualificados.
- Lead sem código de referência entra no total da NGD, mas não é ligado a nenhuma campanha.
- O número da plataforma e o da NGD contam coisas diferentes e nunca devem ser somados.
