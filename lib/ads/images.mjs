// Pipeline de imagem do catálogo: transforma qualquer foto de produto em um quadrado
// 1080x1080 com fundo branco, sem cortar o produto e sem esticar.
// Usa o ffmpeg que já vem com o projeto (.runtime/tools), então não entra dependência nova.
// O arquivo original NUNCA é sobrescrito nem apagado.
//
// Importado por: lib/ads/routes.mjs. API pública: prepararImagem, LADO, MARGEM.
// Grava em data/ads/products/<sku>/: original.<ext> e quadrada.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tools } from '../media.mjs';

const run = promisify(execFile);
export const LADO = 1080;   // tela final
export const MARGEM = 40;   // respiro em cada lado: o produto ocupa no máximo 1000px

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function medir(ffprobe, file) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { windowsHide: true });
  const s = JSON.parse(stdout).streams?.[0] || {};
  return { width: Number(s.width) || 0, height: Number(s.height) || 0 };
}

/**
 * Gera a versão quadrada a partir de `origem` e devolve os dois arquivos.
 * `destinoDir` costuma ser data/ads/products/<sku>.
 */
export async function prepararImagem(origem, destinoDir, { lado = LADO, margem = MARGEM } = {}) {
  const t = tools();
  if (t.missing.includes('ffmpeg') || t.missing.includes('ffprobe')) {
    throw Object.assign(new Error('ffmpeg não está instalado. Rode automation\\install-tools.ps1.'), { status: 503 });
  }
  fs.mkdirSync(destinoDir, { recursive: true });

  const ext = (path.extname(origem) || '.jpg').toLowerCase();
  const original = path.join(destinoDir, 'original' + ext);
  if (path.resolve(origem) !== path.resolve(original)) fs.copyFileSync(origem, original);

  const dentro = lado - margem * 2;
  const quadrada = path.join(destinoDir, 'quadrada.jpg');
  // Fundo branco + imagem reduzida para caber (nunca ampliada além do quadro) + centralização.
  // `format=rgba` antes do overlay preserva PNG com transparência sem borda preta.
  const filtro = `color=c=white:s=${lado}x${lado}[bg];[0:v]scale=${dentro}:${dentro}:force_original_aspect_ratio=decrease,format=rgba[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuvj420p`;
  await run(t.ffmpeg, ['-y', '-loglevel', 'error', '-i', original, '-filter_complex', filtro, '-frames:v', '1', '-q:v', '2', quadrada], { windowsHide: true, maxBuffer: 1 << 24 });

  const dim = await medir(t.ffprobe, quadrada);
  return {
    original: { path: original, bytes: fs.statSync(original).size, sha256: sha256(original), ...(await medir(t.ffprobe, original)) },
    quadrada: { path: quadrada, bytes: fs.statSync(quadrada).size, sha256: sha256(quadrada), ...dim },
  };
}
