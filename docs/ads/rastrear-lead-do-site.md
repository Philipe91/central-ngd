# Rastrear o lead que chega pelo site

O anúncio MP-104 é um carrossel que leva ao site, não ao WhatsApp. Este documento explica o que
falta para o lead chegar identificado no painel, e entrega o arquivo pronto. Lido por pessoas.

## O problema, em uma frase

Quem clica no anúncio chega ao site com `?ngd_ref=MP-104` na URL. Se depois clicar em "Chamar no
WhatsApp", a mensagem sai limpa, sem marca nenhuma, e quem atende não sabe de onde a pessoa veio.
A corrente quebra no último elo.

## A corrente inteira

1. **Anúncio** → cada card leva a `.../produto/<slug>/?utm_source=meta&utm_medium=paid&utm_campaign=MP-104&ngd_ref=MP-104`
2. **Site** → precisa guardar esse `ngd_ref` e colocá-lo na mensagem do botão de WhatsApp. **É o passo que falta.**
3. **WhatsApp** → a mensagem chega escrita "... [ref MP-104]"
4. **Painel** → quem atende registra o lead com esse código, e o anúncio passa a ter dono

Os passos 1, 3 e 4 já funcionam. Só o 2 não existe.

## A solução

Um arquivo de 60 linhas, sem biblioteca e sem requisição de rede: `docs/ads/ngd-ref.js`.

Ele lê o `ngd_ref` da URL, guarda no navegador de quem visita por 30 dias e, em qualquer link de
WhatsApp da página, acrescenta `[ref MP-104]` no fim da mensagem. Funciona também para botão que
aparece depois, porque carimba no clique.

**Como instalar**, quem cuida do site faz uma vez:

1. Copie `ngd-ref.js` para a pasta de scripts do site, por exemplo `/js/ngd-ref.js`.
2. No template que vale para todas as páginas, antes de fechar o `body`, acrescente:

```html
<script src="/js/ngd-ref.js" defer></script>
```

**Como testar:** abra `https://nucleografico.com.br/loja/?ngd_ref=MP-104`, navegue até um produto e
clique em "Chamar no WhatsApp". A mensagem tem de terminar com `[ref MP-104]`.

## Cuidados que já estão no arquivo

- Só aceita código no formato do painel, `MP-000`. Qualquer outro texto na URL é ignorado, para
  ninguém conseguir injetar frase na mensagem por link.
- Não carimba duas vezes o mesmo link.
- Em navegação privada, onde guardar dá erro, ele segue funcionando na mesma visita.
- Não coleta nome, telefone nem qualquer dado da pessoa. Guarda um código de campanha, e nada mais.

## Enquanto o site não muda

O anúncio pode rodar assim mesmo, mas o painel vai contar menos leads do que o real. Nesse meio
tempo, quem atende pode perguntar "viu a gente onde?" e registrar o código à mão. É frágil e
depende de gente lembrar, por isso vale fazer a mudança no site antes de subir o anúncio.

## Observação sobre o botão do WhatsApp dentro da Meta

O anúncio tem o complemento padrão "Apps de mensagens → WhatsApp". Quem chega por esse botão não
passa pelo site, então não recebe carimbo nenhum. Esse caminho continua sem origem. Se ele importar,
a saída é desligar o complemento no anúncio e deixar só o site.
