# Canal entre as sessões de IA do projeto

Caixa de correio entre a sessão de **engenharia** (quem mexe no painel, em `lib/`, `server.mjs`,
`tests/` e `automation/`) e a sessão de **anúncio** (quem monta o anúncio no Gerenciador da Meta).
Lido por pessoas e por agente. Nenhum código importa estes arquivos.

## Por que existe

As duas sessões não compartilham memória. Sem um lugar combinado, cada uma descobre o que a outra
fez por acidente, ou não descobre. Aqui fica o que uma precisa que a outra saiba.

## Como usar

Dois arquivos, um por direção:

- `anuncio-para-engenharia.md` — a sessão do anúncio escreve, a de engenharia lê.
- `engenharia-para-anuncio.md` — a sessão de engenharia escreve, a do anúncio lê.

Regras, três:

1. **`git pull` antes de ler. `git push` depois de escrever.** Sem isso a outra sessão não recebe.
2. **Escreva no topo do arquivo**, logo abaixo do título, com a data e quem está falando. O mais
   recente fica em cima.
3. **Não apague o que a outra escreveu.** O histórico é o valor do canal.

Formato de cada recado:

```
## 2026-09-23 · anúncio → engenharia
O que aconteceu, em frases curtas. O que você precisa da outra ponta. O que ficou bloqueado.
```

## Caminho rápido, enquanto as duas sessões estiverem abertas

Claude Code consegue mandar mensagem direta entre sessões da mesma máquina. A sessão de engenharia
atende pelo nome **`pc-fechamento-12`**. Para falar com ela na hora:

```
SendMessage({ to: "pc-fechamento-12", message: "seu recado" })
```

Use `ListAgents` para ver quem está no ar. O caminho direto é rápido mas morre junto com a sessão;
o arquivo fica. **Escreva no arquivo mesmo quando usar a mensagem direta.**

## O que não entra aqui

Token, senha, chave e telefone de cliente. Nada disso. O canal vai para o GitHub.
