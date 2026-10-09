// Acesso do painel às APIs do Google com a conta de serviço "robô de leitura" do site.
// A chave fica em data/google-site-leitura.json (fora do git) e nunca sai deste PC: o painel
// assina um JWT RS256 com node:crypto, troca por um token de 1 h e guarda o token em memória
// até faltar 1 min para vencer. Escopos só de leitura: Search Console e Analytics.
import fs from 'node:fs';
import { createSign } from 'node:crypto';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// openid: o PageSpeed aceita o token do robô (cota do projeto central-ngd) só com este escopo, que não dá acesso a nada.
export const SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly openid';
const MARGIN_MS = 60 * 1000;

const b64url = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/* JWT de conta de serviço (RFC 7523), pronto para o grant jwt-bearer. Exportada para os testes. */
export function montarJwt(chave, { now = Date.now(), scope = SCOPES } = {}) {
  const iat = Math.floor(now / 1000);
  const corpo = b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url({ iss: chave.client_email, scope, aud: chave.token_uri || GOOGLE_TOKEN_URL, iat, exp: iat + 3600 });
  const assinatura = createSign('RSA-SHA256').update(corpo).sign(chave.private_key).toString('base64url');
  return corpo + '.' + assinatura;
}

/* Lê a chave sem nunca devolver o segredo: robo() só expõe o e-mail e o projeto. */
export function lerChave(file) {
  let chave;
  try { chave = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (chave?.type !== 'service_account' || !chave.client_email || !chave.private_key) return null;
  return chave;
}

export function createGoogle({ file, fetch: fetchImpl = globalThis.fetch, now = Date.now }) {
  let cache = null;      // { token, expira, email }
  let pedindo = null;

  const robo = () => { const c = lerChave(file); return c ? { email: c.client_email, projeto: c.project_id || '' } : null; };

  async function token() {
    const chave = lerChave(file);
    if (!chave) throw Object.assign(new Error('Chave do robô ausente ou inválida em data/google-site-leitura.json.'), { code: 'sem_chave' });
    if (cache && cache.email === chave.client_email && cache.expira - MARGIN_MS > now()) return cache.token;
    pedindo ??= (async () => {
      const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: montarJwt(chave, { now: now() }) });
      const r = await fetchImpl(chave.token_uri || GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20000) });
      let data = {}; try { data = await r.json(); } catch {}
      if (!r.ok || !data.access_token) throw Object.assign(new Error(`Google recusou a chave do robô (${data.error || 'http_' + r.status}): ${data.error_description || 'sem detalhe'}`), { code: 'token', status: r.status });
      cache = { token: data.access_token, expira: now() + (Number(data.expires_in) || 3600) * 1000, email: chave.client_email };
      return cache.token;
    })().finally(() => { pedindo = null; });
    return pedindo;
  }

  /* Chamada autenticada; erro do Google vira Error com status e a mensagem original em .google. */
  async function chamar(url, { method = 'GET', body, auth = true, timeout = 30000 } = {}) {
    const headers = { Accept: 'application/json' };
    if (auth) headers.Authorization = 'Bearer ' + await token();
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
    let data = {}; try { data = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(data.error?.message || `HTTP ${r.status}`), { status: r.status, google: data.error?.message || '', reason: data.error?.status || data.error?.errors?.[0]?.reason || '' });
    return data;
  }

  return { robo, token, chamar, configurado: () => !!lerChave(file) };
}
