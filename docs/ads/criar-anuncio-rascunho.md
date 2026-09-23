# Criar um anúncio na Meta e deixar pronto, sem publicar

Texto de instrução para um agente que vai montar o anúncio no Gerenciador de Anúncios da NGD. Lido por pessoas e por agente, não chamado por código. Copie daqui para baixo.

---

## Tarefa

Criar **um anúncio novo** na conta de anúncios da NGD, configurar tudo corretamente e **parar antes de publicar**. Deixe salvo como rascunho.

## Limites que não podem ser quebrados

1. **Não publique.** Não clique em "Publicar", "Conferir e publicar" nem em nada que confirme gasto. Quem aperta esse botão é o dono da loja, com o valor na tela.
2. **Não toque nos rascunhos que já existem.** A conta tem alterações pendentes no botão "Conferir e publicar", feitas por outra pessoa. Não clique nele e não clique em "Descartar rascunhos".
3. **Não troque de conta de anúncios.** A conta pessoal "Danilo Lima Marques" tem campanhas de outro negócio e não deve ser tocada.
4. **Não digite senha.** Se aparecer pedido de login ou confirmação de identidade, pare e peça para a pessoa fazer.
5. **Não altere, pause nem apague** campanha, conjunto ou anúncio que já exista.
6. Se algo não bater com estas instruções, pare e pergunte em vez de improvisar.

## Passo 0: pegar o código de rastreamento no painel

O anúncio só serve se o lead chegar identificado. O código vem do painel local, não é inventado.

1. Abra `http://localhost:3210/#midia` e vá na aba **Campanhas e links**.
2. Se já existir a campanha desta ação, anote o **código** dela, no formato `MP-004`.
3. Se não existir, clique em **Nova campanha**, dê um nome e salve. O painel gera o código.
4. Clique em **WhatsApp** na linha da campanha para copiar o link pronto. Guarde o texto da mensagem, que termina em `[ref MP-004]`.

## Passo 1: abrir a conta certa

Vá direto para:

```
https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=580068942617118
```

Confirme no alto da tela que está escrito **CA - NGD - Principal**. Se não estiver, use o seletor de conta e escolha o portfólio **NGD – Núcleo Gráfico Digital**.

## Passo 2: campanha

1. Clique no botão verde **Criar**.
2. Objetivo: **Cadastros**.
3. Nome da campanha: o código do painel seguido de uma descrição curta, por exemplo `MP-004 Placas de campo`.
4. Orçamento: **diário**, com o valor que a pessoa informar. Se ela não informar, deixe o campo em branco e avise no relatório final.

## Passo 3: conjunto de anúncios

1. Destino da conversão: **WhatsApp**.
2. Selecione a Página da NGD e o número de WhatsApp da loja.
3. Público: localização, idade e interesses conforme combinado. Sem orientação, use Brasília e entorno e registre isso como suposição.
4. Posicionamentos: deixe **Advantage+** ligado, salvo pedido em contrário.

## Passo 4: anúncio

1. Identidade: Página da NGD e conta do Instagram da loja.
2. Formato: **Imagem única**.
3. Clique em **Adicionar mídia**, depois **Selecionar imagem**, e escolha na **biblioteca da conta**. As imagens já estão lá; não suba arquivo novo sem pedir.
4. Preencha texto principal, título e descrição.
5. Chamada para ação: **Enviar mensagem**.
6. **Mensagem pré-preenchida do WhatsApp**: este é o passo que faz o rastreamento funcionar. O texto tem de terminar com o código entre colchetes, exatamente assim:

```
Olá! Vim pelo anúncio e quero um orçamento. [ref MP-004]
```

Sem esse trecho, o lead chega anônimo e o painel não consegue ligar a conversa ao anúncio.

## Passo 5: parar

Revise a prévia e **feche sem publicar**. A Meta guarda como rascunho. Confirme que o anúncio ficou desativado ou em rascunho, e não em veiculação.

## Relatório final

Ao terminar, escreva:

- o código da campanha usado e o nome dado a ela;
- qual imagem foi escolhida;
- o texto, o título e a mensagem pré-preenchida, na íntegra;
- público e orçamento configurados;
- o que ficou faltando a pessoa decidir;
- confirmação explícita de que nada foi publicado e de que nenhum rascunho alheio foi tocado.

## Depois, fora da Meta

Lembre a pessoa de definir o **teto de gasto na própria conta da Meta**, em Configurações de pagamento. O limite do painel local não vale nada se este computador estiver desligado.
