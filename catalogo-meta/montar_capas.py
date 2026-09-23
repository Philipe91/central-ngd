# Gera capas 1080x1080 JPG, produto centralizado em fundo branco (estilo anúncio de catálogo).
import glob, os, json
from PIL import Image, ImageChops
from rembg import remove

TAM, MARGEM = 1080, 0.08
# capas fotografadas em cenário: precisam de remoção de fundo
CENARIO = {'banner-rollup', 'lixeira-personalizada-em-poliondas', 'placa-de-campo-poliondas',
           'totem-replica-em-poliondas', 'totem-triangular', 'backdrop-para-eventos'}
# pórtico: foto externa, a remoção de fundo borra — mantém a foto inteira

def recorte_branco(im):
    rgb = im.convert('RGB')
    diff = ImageChops.difference(rgb, Image.new('RGB', rgb.size, (255, 255, 255))).convert('L')
    box = diff.point(lambda p: 255 if p > 40 else 0).getbbox()
    return rgb.crop(box).convert('RGBA')

# alta.json: original em alta resolução encontrada em NGDSITE (achar_alta.py); senão usa a capa do site
ALTA = json.load(open('alta.json')) if os.path.exists('alta.json') else {}

for f in sorted(glob.glob('capas-originais/*.webp')):
    slug = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(ALTA.get(slug, f))
    if slug in CENARIO:
        im = remove(im.convert('RGBA'))
        im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 128 else 0).getbbox())
    else:
        im = recorte_branco(im)
    lim = int(TAM * (1 - 2 * MARGEM))
    esc = lim / max(im.size)  # também amplia capas pequenas (640px)
    im = im.resize((round(im.width * esc), round(im.height * esc)), Image.LANCZOS)
    tela = Image.new('RGB', (TAM, TAM), 'white')
    tela.paste(im, ((TAM - im.width) // 2, (TAM - im.height) // 2), im)
    tela.save(f'capas-meta/{slug}.jpg', quality=95)
    print('ok', slug)
