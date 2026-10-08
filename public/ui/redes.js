/* Marcas das redes sociais em SVG local (sem CDN), nas cores oficiais.
   Uso: marcaRede('youtube', 20). REDE_COR guarda a cor de destaque de cada rede. */

export const REDE_COR = { youtube: '#e5252a', instagram: '#d62976', facebook: '#1877f2', tiktok: '#111827', linkedin: '#0a66c2' };

let uid = 0;
const MARCAS = {
  youtube: () => '<rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#ff0000"/><path d="M9.8 8.6v6.8l5.9-3.4z" fill="#fff"/>',
  instagram: () => {
    const id = 'ig' + (++uid);
    return `<defs><radialGradient id="${id}" cx="28%" cy="108%" r="140%"><stop offset="0" stop-color="#fdd56b"/><stop offset=".12" stop-color="#fdb45c"/><stop offset=".42" stop-color="#f2504a"/><stop offset=".62" stop-color="#d6249f"/><stop offset=".95" stop-color="#4f5bd5"/></radialGradient></defs><rect width="24" height="24" rx="6.5" fill="url(#${id})"/><rect x="5.4" y="5.4" width="13.2" height="13.2" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1.05" fill="#fff"/>`;
  },
  facebook: () => '<circle cx="12" cy="12" r="11.5" fill="#1877f2"/><path d="M13.5 23.4v-8.6h2.6l.4-3h-3V9.9c0-.9.3-1.5 1.5-1.5h1.6V5.7c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6v8.5z" fill="#fff"/>',
  tiktok: () => {
    const nota = 'M15.4 4.5c.3 1.7 1.5 3 3.2 3.2v2.5c-1.1 0-2.2-.3-3.1-.9v5a4.4 4.4 0 1 1-4.4-4.4h.6v2.6a1.9 1.9 0 1 0 1.3 1.8V4.5z';
    return `<rect width="24" height="24" rx="6" fill="#111"/><path d="${nota}" fill="#25f4ee" transform="translate(-.7 -.5)"/><path d="${nota}" fill="#fe2c55" transform="translate(.7 .5)"/><path d="${nota}" fill="#fff"/>`;
  },
  linkedin: () => '<rect width="24" height="24" rx="5" fill="#0a66c2"/><path d="M6.6 9.6h2.5v8H6.6zM7.85 5.5a1.45 1.45 0 1 1 0 2.9 1.45 1.45 0 0 1 0-2.9zM10.7 9.6h2.4v1.1c.4-.7 1.3-1.3 2.6-1.3 2.4 0 2.9 1.6 2.9 3.6v4.6h-2.5v-4.1c0-1 0-2.2-1.4-2.2s-1.5 1-1.5 2.1v4.2h-2.5z" fill="#fff"/>',
};

export function marcaRede(id, size = 20) {
  const desenho = MARCAS[id];
  if (!desenho) return `<span class="r-marca-vazia" aria-hidden="true"></span>`;
  return `<svg class="r-marca" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${desenho()}</svg>`;
}
