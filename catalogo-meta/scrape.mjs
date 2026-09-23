// Lê as páginas de produto da loja (sitemap) e salva nome, descrição, link e capa.
import fs from 'node:fs';
const UA = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const sm = await (await fetch('https://nucleografico.com.br/loja/sitemap.xml', UA)).text();
const urls = [...sm.matchAll(/<loc>([^<]*\/produto\/[^<]*)<\/loc>/g)].map(m => m[1]);
const out = [];
for (const url of urls) {
  const html = await (await fetch(url, UA)).text();
  const ld = [...html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
    .find(j => j && j['@type'] === 'Product');
  const slug = url.split('/').filter(Boolean).pop();
  const capa = ld.image[0];
  const file = `capas-originais/${slug}${capa.slice(capa.lastIndexOf('.'))}`;
  fs.writeFileSync(file, Buffer.from(await (await fetch(capa, UA)).arrayBuffer()));
  out.push({ id: slug, nome: ld.name, descricao: ld.description, categoria: ld.category, link: url, capa_url: capa, capa_arquivo: file });
  console.log('ok', slug);
}
fs.writeFileSync('produtos.json', JSON.stringify(out, null, 2));
