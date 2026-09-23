# Gera escolher-capas.html (página local para escolher a capa de cada produto e os 10 do carrossel).
import json

dados = json.load(open('candidatas.json', encoding='utf8'))
for p in dados:
    for f in p['fotos']:
        f['alta'] = f['fonte'].startswith('C:')
html = open('escolher-capas.template.html', encoding='utf8').read()
open('escolher-capas.html', 'w', encoding='utf8').write(html.replace('/*DADOS*/', json.dumps(dados, ensure_ascii=False)))
