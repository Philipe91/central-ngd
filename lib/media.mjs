// Ferramentas portáteis (ffmpeg, yt-dlp, cloudflared), preparação de vídeo, importação e link temporário.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const toolsDir = process.env.NGD_TOOLS_DIR || path.join(root, '.runtime', 'tools');

export function tools() {
  const exe = name => path.join(toolsDir, name + '.exe');
  const t = { ffmpeg: exe('ffmpeg'), ffprobe: exe('ffprobe'), ytdlp: exe('yt-dlp'), cloudflared: exe('cloudflared') };
  t.missing = Object.entries(t).filter(([, p]) => !fs.existsSync(p)).map(([k]) => k);
  return t;
}

function run(file, args, { timeout = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { error.stderr = stderr; error.stdout = stdout; return reject(error); }
      resolve({ stdout, stderr });
    });
  });
}

export async function probe(file) {
  const { ffprobe } = tools();
  const { stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { timeout: 60000 });
  const info = JSON.parse(stdout);
  const video = (info.streams || []).find(s => s.codec_type === 'video');
  if (!video) throw new Error('O arquivo não contém vídeo.');
  const rotated = /^(90|-90|270|-270)$/.test(String(video.tags?.rotate || '')) || (video.side_data_list || []).some(s => Math.abs(Number(s.rotation || 0)) === 90);
  const width = rotated ? Number(video.height) : Number(video.width), height = rotated ? Number(video.width) : Number(video.height);
  return { duration: Number(info.format?.duration || video.duration || 0), width, height, hasAudio: (info.streams || []).some(s => s.codec_type === 'audio') };
}

// Gera a versão padrão 1080x1920 (9:16) H.264/AAC e a capa JPG. Vídeos fora de 9:16 ganham fundo desfocado.
export async function prepare(inputPath, outDir, id) {
  const { ffmpeg } = tools();
  fs.mkdirSync(outDir, { recursive: true });
  const info = await probe(inputPath);
  const rendition = id + '.mp4', thumb = id + '.jpg';
  const target = 9 / 16, ratio = info.width / info.height;
  const vertical = Math.abs(ratio - target) < 0.02;
  const filter = vertical
    ? '[0:v]scale=1080:1920:flags=lanczos,setsar=1,fps=30,format=yuv420p[v]'
    : '[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=luma_radius=30:luma_power=2,setsar=1[bgs];[fg]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fgs];[bgs][fgs]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p[v]';
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath];
  if (!info.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  args.push('-filter_complex', filter, '-map', '[v]', '-map', info.hasAudio ? '0:a:0' : '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-profile:v', 'high', '-level', '4.1', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-shortest', '-t', '600', path.join(outDir, rendition));
  await run(ffmpeg, args);
  const at = Math.min(1, Math.max(0, info.duration / 3)).toFixed(2);
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', at, '-i', path.join(outDir, rendition), '-frames:v', '1', '-q:v', '3', path.join(outDir, thumb)], { timeout: 60000 });
  const out = await probe(path.join(outDir, rendition));
  return { rendition, thumb, duration: Math.round(out.duration * 10) / 10, width: out.width, height: out.height, bytes: fs.statSync(path.join(outDir, rendition)).size, sourceWidth: info.width, sourceHeight: info.height };
}

// Baixa um vídeo público (Instagram, YouTube etc.) com yt-dlp. Cookies opcionais para conteúdo que exige login.
export async function importVideo(url, outDir, id, { cookies } = {}) {
  const { ytdlp } = tools();
  fs.mkdirSync(outDir, { recursive: true });
  const args = ['--no-playlist', '--no-warnings', '--no-progress', '--ffmpeg-location', toolsDir, '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4', '-o', path.join(outDir, id + '.%(ext)s'), '--print-json', '--no-simulate'];
  if (cookies && fs.existsSync(cookies)) args.push('--cookies', cookies);
  args.push(url);
  let stdout;
  try { ({ stdout } = await run(ytdlp, args, { timeout: 15 * 60 * 1000 })); } catch (error) {
    const msg = String(error.stderr || error.message || '');
    if (/login|cookies|rate-limit|not available|403|401|empty media response/i.test(msg)) throw new Error('O Instagram exigiu login para este vídeo. Exporte os cookies da sua sessão para data/cookies/instagram.txt e tente de novo.');
    throw new Error('Não foi possível baixar: ' + msg.split('\n').filter(Boolean).slice(-1)[0]);
  }
  const line = stdout.split('\n').reverse().find(l => l.trim().startsWith('{'));
  const meta = line ? JSON.parse(line) : {};
  const file = fs.readdirSync(outDir).find(f => f.startsWith(id + '.') && /\.(mp4|mov|webm|mkv)$/i.test(f));
  if (!file) throw new Error('O download terminou sem gerar arquivo de vídeo.');
  return { file, title: String(meta.title || '').slice(0, 160), description: String(meta.description || '').slice(0, 5000), duration: Number(meta.duration || 0), uploader: meta.uploader || meta.channel || '' };
}

// Token assinado para servir um arquivo por tempo limitado através do túnel.
const b64u = b => Buffer.from(b).toString('base64url');
export function createShareToken(file, secret, ttlMs = 2 * 60 * 60 * 1000) {
  const payload = b64u(JSON.stringify({ file, exp: Date.now() + ttlMs }));
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}
export function verifyShareToken(token, secret) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString()); return data.exp > Date.now() && /^[\w.-]+$/.test(data.file) ? data : null; } catch { return null; }
}

// Túnel cloudflared temporário (sem conta) para o servidor de compartilhamento. Necessário só para o Instagram.
let tunnel = null;
export function tunnelStatus() { return tunnel ? { url: tunnel.url, startedAt: tunnel.startedAt } : null; }
export function stopTunnel() { if (tunnel?.child) tunnel.child.kill(); tunnel = null; }
export function ensureTunnel(port, logFile) {
  if (tunnel?.url) return Promise.resolve(tunnel.url);
  if (tunnel?.promise) return tunnel.promise;
  const { cloudflared } = tools();
  const child = spawn(cloudflared, ['tunnel', '--url', 'http://127.0.0.1:' + port, '--no-autoupdate'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { child, url: '', startedAt: new Date().toISOString() };
  state.promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('O túnel temporário não respondeu em 40 s. Verifique a internet.')); }, 40000);
    const onData = chunk => {
      const text = chunk.toString();
      if (logFile) fs.appendFileSync(logFile, text);
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !state.url) { state.url = m[0]; clearTimeout(timer); resolve(state.url); }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', () => { clearTimeout(timer); if (tunnel === state) tunnel = null; reject(new Error('O túnel temporário foi encerrado.')); });
    child.on('error', e => { clearTimeout(timer); tunnel = null; reject(e); });
  });
  tunnel = state;
  return state.promise;
}
