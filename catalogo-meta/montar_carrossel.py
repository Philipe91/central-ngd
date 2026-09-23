# Monta os cards do carrossel a partir da escolha feita em escolher-capas.html.
# Uso: python montar_carrossel.py [caminho do escolha-capas.json]
import glob, json, os, sys, urllib.request
from io import BytesIO
from PIL import Image, ImageChops
from rembg import remove

Image.MAX_IMAGE_PIXELS = None
TAM, MARGEM = 1080, 0.08
ESCOLHA = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(r'~\Downloads\escolha-capas.json')
# produtos que ficam melhor com a foto original (cenário), sem remover o fundo
MANTER_FUNDO = {'placa-de-campo-poliondas'}
UTM ='?utm_source=meta&utm_medium=paid&utm_campaign=MP-104&ngd_ref=MP-104'

def abrir(fonte):
    if fonte.startswith('http'):
        req = urllib.request.Request(fonte, headers={'User-Agent': 'Mozilla/5.0'})
        return Image.open(BytesIO(urllib.request.urlopen(req).read()))
    return Image.open(fonte)

def borda_branca(im):
    # fundo já branco se a borda da imagem for quase toda branca
    g = im.convert('L'); w, h = g.size
    px = [g.getpixel((x, y)) for x in range(0, w, 8) for y in (0, h - 1)] + \
         [g.getpixel((x, y)) for y in range(0, h, 8) for x in (0, w - 1)]
    return sum(p > 240 for p in px) / len(px) > 0.9

def recorte_branco(im):
    # quase-branco vira branco puro (limpa restos fracos de texto/sombra no fundo)
    rgb = im.convert('RGB').point(lambda v: 255 if v > 228 else v)
    diff = ImageChops.difference(rgb, Image.new('RGB', rgb.size, (255, 255, 255))).convert('L')
    return rgb.crop(diff.point(lambda p: 255 if p > 40 else 0).getbbox()).convert('RGBA')

def foto_inteira(im):
    # mantém o cenário: recorte quadrado central preenchendo o card
    im = im.convert('RGB'); lado = min(im.size)
    x, y = (im.width - lado) // 2, (im.height - lado) // 2
    return im.crop((x, y, x + lado, y + lado)).resize((TAM, TAM), Image.LANCZOS)

def capa(fonte, manter_fundo=False):
    im = abrir(fonte)
    if manter_fundo:
        return foto_inteira(im)
    if borda_branca(im):
        im = recorte_branco(im)
    else:
        im = remove(im.convert('RGBA'))
        im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 128 else 0).getbbox())
    lim = int(TAM * (1 - 2 * MARGEM))
    esc = lim / max(im.size)
    im = im.resize((round(im.width * esc), round(im.height * esc)), Image.LANCZOS)
    tela = Image.new('RGB', (TAM, TAM), 'white')
    tela.paste(im, ((TAM - im.width) // 2, (TAM - im.height) // 2), im)
    return tela

escolha = json.load(open(ESCOLHA, encoding='utf8'))
links = {p['id']: p['link'] for p in json.load(open('produtos.json', encoding='utf8'))}
for f in glob.glob('carrossel-manual/*.jpg'):
    os.remove(f)

tabela = []
for c in escolha:
    n = f"{c['card']:02d}"
    arq = f"{n}-{c['id']}.jpg"
    capa(c['fonte'], c['id'] in MANTER_FUNDO).save(f'carrossel-manual/{arq}', quality=95)
    tabela.append(f"| {n} | {arq} | {c['nome']} | {links[c['id']]}{UTM} |")
    print('ok', arq)

# atualiza a tabela de cards no ROTEIRO.md (mantém o resto do texto)
rot = open('carrossel-manual/ROTEIRO.md', encoding='utf8').read().split('\n')
ini = next(i for i, l in enumerate(rot) if l.startswith('|---')) + 1
fim = next(i for i in range(ini, len(rot)) if not rot[i].startswith('|'))
rot[ini:fim] = tabela
open('carrossel-manual/ROTEIRO.md', 'w', encoding='utf8').write('\n'.join(rot))

fs = sorted(glob.glob('carrossel-manual/*.jpg')); W = 300
sheet = Image.new('RGB', (W * 5 + 20, (W + 5) * 2), '#555')
for i, f in enumerate(fs):
    im = Image.open(f); im.thumbnail((W, W)); sheet.paste(im, ((i % 5) * (W + 5), (i // 5) * (W + 5)))
sheet.save('carrossel-manual/previa-cards.png')
