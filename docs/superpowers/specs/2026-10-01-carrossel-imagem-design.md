# Carrossel e imagem no Instagram + Facebook (desenho)

Data: 01/10/2026 · Aprovado pelo usuário no chat.

## Objetivo
A Central NGD passa a publicar, além de vídeo, **imagem única** e **carrossel de fotos** no Instagram e na Página do
Facebook, com o mesmo fluxo de hoje: cadastrar, agendar (ou publicar agora), a fila do n8n publica e o painel guarda o link.

Fora desta etapa: Stories, carrossel com vídeo, slideshow para o YouTube, fotos no TikTok.

## Comportamento para o usuário
- "Novo conteúdo" pergunta o **tipo**: Vídeo (como hoje), Imagem (1 foto) ou Carrossel (2 a 10 fotos, na ordem escolhida,
  com miniaturas e opção de remover).
- Para Imagem/Carrossel só ficam disponíveis **Instagram, Facebook** e LinkedIn (manual). YouTube e TikTok ficam desativados.
- Legenda, hashtags, texto por rede, data/hora, "Publicar agora", falha/tentar de novo e registro manual funcionam igual.

## Formato das fotos (pesquisado em 01/10/2026)
- A API do Instagram aceita fotos de **4:5 a 1.91:1**, só **JPEG**. O 3:4 (1080×1440) existe no app desde 2025, mas não é
  garantido pela API. Todas as fotos do carrossel são cortadas no formato da primeira.
- **Carrossel:** todas as fotos viram **1080×1350 (4:5)**. Foto em outra proporção entra inteira, centralizada sobre o fundo
  desfocado da própria foto (mesma técnica dos vídeos), sem corte.
- **Imagem única:** mantém a proporção original se estiver entre 4:5 e 1.91:1 (largura 1080); fora disso, vira 1080×1350 como acima.
- Saída sempre JPG sRGB, qualidade alta, até 8 MB. Entrada aceita: JPG, PNG, WebP.

## Dados
- Conteúdo ganha `kind`: `'video' | 'image' | 'carousel'`. A migração marca os existentes como `'video'`.
- Fotos: `images: [{ file, rendition, width, height, bytes }]` na ordem. `media.thumb` = primeira foto preparada;
  `media.state` segue o mesmo ciclo (pending → preparing → ready | error).
- O servidor recusa canais fora de instagram/facebook/linkedin para `image`/`carousel`, e quantidade fora de 1 (imagem) ou 2–10 (carrossel).

## Publicação
- O trabalho entregue ao n8n leva `kind` e, para fotos, `imageUrls` (links temporários assinados, servidos pelo túnel que já
  existe para o Instagram, agora com `Content-Type: image/jpeg`).
- **Instagram imagem:** `POST /{ig}/media {image_url, caption}` → aguardar `FINISHED` → `media_publish` → `permalink`.
- **Instagram carrossel:** para cada foto `POST /{ig}/media {image_url, is_carousel_item:true}`; depois
  `POST /{ig}/media {media_type:CAROUSEL, children, caption}` → aguardar → `media_publish` → `permalink`.
- **Facebook imagem:** `POST /{page}/photos {url, message}` → link `facebook.com/{post_id}`.
- **Facebook carrossel:** cada foto `POST /{page}/photos {url, published:false}`; depois
  `POST /{page}/feed {message, attached_media:[{media_fbid}]}` → link `facebook.com/{id}`.
- Erros seguem o padrão atual: mensagem legível no painel, status `failed`, botão tentar de novo.

## Testes
- Unitários: migração (`kind`), validação de tipo/quantidade/canais, `claimJobs` com fotos, preparo das fotos
  (proporções 4:5, 1:1, 16:9 e muito alta), servidor de compartilhamento servindo JPG.
- Simulação: o mock da Meta ganha os endpoints de foto/carrossel e os fluxos são exercitados de ponta a ponta sem publicar.
- Os testes atuais continuam passando.
