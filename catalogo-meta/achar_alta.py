# Procura em NGDSITE a versão em alta resolução de cada capa do site (comparação por conteúdo).
import glob, os, json
from PIL import Image
RAIZ = r'C:\projetos\NGD\NGDSITE'
def assin(im):
    return list(im.convert('L').resize((24, 24), Image.BILINEAR).getdata())
def dist(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)
alvos = {os.path.splitext(os.path.basename(f))[0]: assin(Image.open(f)) for f in glob.glob('capas-originais/*.webp')}
tam = {k: Image.open(f'capas-originais/{k}.webp').size for k in alvos}
melhor = {k: (999, None, None) for k in alvos}
for f in glob.iglob(RAIZ + r'\**\*', recursive=True):
    if any(p in f for p in ('node_modules', 'venv', '.git', 'backups')): continue
    if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')): continue
    try:
        im = Image.open(f); sz = im.size
        if max(sz) < 900: continue
        a = assin(im)
    except Exception: continue
    for k, b in alvos.items():
        d = dist(a, b)
        if d < melhor[k][0]: melhor[k] = (d, f, sz)
for k, (d, f, sz) in sorted(melhor.items()):
    print(f'{k:38} site={tam[k]}  dist={d:5.1f}  {sz}  {f}')
json.dump({k: v[1] for k, v in melhor.items() if v[0] < 12}, open('alta.json', 'w'), indent=1)
