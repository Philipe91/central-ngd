# Junta as fotos de cada produto (capa + galeria do site) e acha a original em alta em NGDSITE.
import glob, json, os, re, urllib.request
from io import BytesIO
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
RAIZ = r'C:\projetos\NGD\NGDSITE'
UA = {'User-Agent': 'Mozilla/5.0'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

def assin(im):
    return list(im.convert('L').resize((24, 24), Image.BILINEAR).getdata())

def dist(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)

# índice das imagens locais (assinatura + tamanho)
indice = []
for f in glob.iglob(RAIZ + r'\**\*', recursive=True):
    if any(p in f for p in ('node_modules', 'venv', '.git', 'backups')): continue
    if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')): continue
    try:
        im = Image.open(f); indice.append((assin(im), im.size, f))
    except Exception: pass

produtos = json.load(open('produtos.json', encoding='utf8'))
saida = []
for p in produtos:
    html = get(p['link']).decode('utf8')
    ld = next(j for j in (json.loads(m) for m in re.findall(r'<script[^>]*ld\+json[^>]*>([\s\S]*?)</script>', html, re.S)
                          if '"Product"' in m) if j.get('@type') == 'Product')
    pasta = f"candidatas/{p['id']}"; os.makedirs(pasta, exist_ok=True)
    fotos = []
    for i, url in enumerate(ld['image']):
        im = Image.open(BytesIO(get(url)))
        a = assin(im)
        # original local: mesma imagem (dist < 12) com a maior resolução
        locais = sorted((l for l in indice if dist(a, l[0]) < 12), key=lambda l: -l[1][0] * l[1][1])
        fonte = locais[0][2] if locais and locais[0][1][0] * locais[0][1][1] >= im.size[0] * im.size[1] else url
        tam = locais[0][1] if fonte != url else im.size
        mini = f'{pasta}/{i:02d}.jpg'
        t = im.convert('RGB'); t.thumbnail((420, 420)); t.save(mini, quality=85)
        fotos.append({'mini': mini, 'fonte': fonte, 'tamanho': list(tam), 'capa_atual': i == 0})
    saida.append({'id': p['id'], 'nome': p['nome'], 'link': p['link'], 'fotos': fotos})
    print(p['id'], len(fotos))
json.dump(saida, open('candidatas.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
