// Token do TikTok: o painel é o único dono. Guarda chave, segredo, access token e refresh token em
// data/automation-secrets.json (fora do git) e entrega um token fresco ao n8n em cada trabalho.
// O access token do TikTok vence em 24 h; o refresh token vale 365 dias e é rotativo (cada renovação
// devolve um refresh token novo), por isso a renovação é única por vez e gravada antes de ser usada.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
export const TIKTOK_SCOPES = 'user.info.basic,video.upload,video.publish';
const MARGIN_MS = 60 * 60 * 1000;      // renova quando faltar menos de 1 h
const STATE_TTL_MS = 10 * 60 * 1000;   // pedido de autorização vale 10 min, uso único

export function createTikTokAuth({ file, fetch: fetchImpl = globalThis.fetch, now = Date.now, log = () => {} }) {
  const pending = new Map();
  let refreshing = null;

  function readAll() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
  function read() { return readAll().tiktok || {}; }
  function write(patch) {
    const all = readAll();
    all.tiktok = { ...(all.tiktok || {}), ...patch };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return all.tiktok;
  }
  const configured = t => !!(t.clientKey && t.clientSecret);
  const mask = v => (v ? v.slice(0, 4) + '…' + v.slice(-3) : '');

  async function tokenRequest(form) {
    const t = read();
    const body = new URLSearchParams({ client_key: t.clientKey, client_secret: t.clientSecret, ...form });
    const response = await fetchImpl(TIKTOK_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body, signal: AbortSignal.timeout(20000) });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok || data.error || !data.access_token) {
      const code = data.error || `http_${response.status}`;
      const error = new Error(`TikTok recusou (${code}): ${data.error_description || 'sem detalhe'}`);
      error.code = code; throw error;
    }
    const at = now();
    return {
      accessToken: data.access_token, refreshToken: data.refresh_token || t.refreshToken,
      expiresAt: at + Number(data.expires_in || 86400) * 1000,
      refreshExpiresAt: data.refresh_expires_in ? at + Number(data.refresh_expires_in) * 1000 : t.refreshExpiresAt || null,
      openId: data.open_id || t.openId || '', scope: data.scope || t.scope || '', error: '',
    };
  }

  return {
    status() {
      const t = read(); const at = now();
      const connected = !!t.refreshToken && !t.error;
      return {
        configured: configured(t), connected, clientKey: mask(t.clientKey || ''), openId: t.openId || '', scope: t.scope || '',
        expiresAt: t.expiresAt ? new Date(t.expiresAt).toISOString() : null,
        refreshExpiresAt: t.refreshExpiresAt ? new Date(t.refreshExpiresAt).toISOString() : null,
        renewSoon: !!t.refreshExpiresAt && t.refreshExpiresAt - at < 30 * 24 * 60 * 60 * 1000,
        connectedAt: t.connectedAt || null, error: t.error || '',
      };
    },
    setConfig({ clientKey, clientSecret }) {
      clientKey = String(clientKey || '').trim(); clientSecret = String(clientSecret || '').trim();
      if (!clientKey || !clientSecret) throw Object.assign(new Error('Informe a client key e o client secret do app do TikTok.'), { status: 400 });
      if (!/^[\w-]{8,80}$/.test(clientKey) || clientSecret.length < 8 || clientSecret.length > 200) throw Object.assign(new Error('Chave ou segredo do TikTok em formato inesperado.'), { status: 400 });
      const previous = read();
      const changed = previous.clientKey !== clientKey;
      write({ clientKey, clientSecret, ...(changed ? { accessToken: '', refreshToken: '', expiresAt: null, refreshExpiresAt: null, openId: '', scope: '', error: '' } : {}) });
      return this.status();
    },
    startAuth(redirectUri) {
      const t = read();
      if (!configured(t)) throw Object.assign(new Error('Salve a client key e o client secret antes de conectar.'), { status: 400 });
      for (const [k, p] of pending) if (now() - p.createdAt > STATE_TTL_MS) pending.delete(k);
      const state = randomBytes(16).toString('hex');
      pending.set(state, { redirectUri, createdAt: now() });
      const url = new URL(TIKTOK_AUTH_URL);
      url.search = new URLSearchParams({ client_key: t.clientKey, scope: TIKTOK_SCOPES, response_type: 'code', redirect_uri: redirectUri, state }).toString();
      return { authUrl: url.toString(), redirectUri, state };
    },
    async handleCallback({ code, state, error, error_description: description } = {}) {
      const p = typeof state === 'string' ? pending.get(state) : null;
      if (!p || now() - p.createdAt > STATE_TTL_MS) { if (p) pending.delete(state); throw Object.assign(new Error('Pedido de autorização inválido ou expirado.'), { status: 400 }); }
      pending.delete(state);
      if (error || typeof code !== 'string' || !code) throw Object.assign(new Error(`TikTok não autorizou: ${description || error || 'sem código'}`), { status: 400 });
      const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: p.redirectUri });
      write({ ...tokens, connectedAt: new Date(now()).toISOString() });
      log('TikTok conectado pelo painel.');
      return this.status();
    },
    async getFreshToken() {
      const t = read();
      if (!t.refreshToken) throw Object.assign(new Error(t.error ? `TikTok desconectado: ${t.error}` : 'TikTok não conectado. Conecte em Redes sociais.'), { status: 409 });
      if (t.accessToken && t.expiresAt && t.expiresAt - now() > MARGIN_MS) return t.accessToken;
      if (!refreshing) {
        refreshing = (async () => {
          try {
            const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: read().refreshToken });
            write(tokens);
            log('TikTok: token renovado.');
            return tokens.accessToken;
          } catch (error) {
            if (['invalid_grant', 'invalid_request', 'access_token_invalid'].includes(error.code)) { write({ accessToken: '', refreshToken: '', expiresAt: null, error: error.message }); log('TikTok desconectado: ' + error.message); }
            throw error;
          } finally { refreshing = null; }
        })();
      }
      return refreshing;
    },
    disconnect() { write({ accessToken: '', refreshToken: '', expiresAt: null, refreshExpiresAt: null, openId: '', scope: '', error: '', connectedAt: null }); return this.status(); },
  };
}
