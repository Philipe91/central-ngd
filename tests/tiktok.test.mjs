import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTikTokAuth, TIKTOK_TOKEN_URL } from '../lib/tiktok-auth.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-tiktok-'));
const file = path.join(temporary, 'automation-secrets.json');
const secrets = () => JSON.parse(fs.readFileSync(file, 'utf8'));
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('token do TikTok: renova uma vez só, persiste o refresh rotativo e desconecta em invalid_grant', async () => {
  fs.writeFileSync(file, JSON.stringify({ bridgeToken: 'x', encryptionKey: 'y' }));
  let clock = 1_800_000_000_000;
  const calls = [];
  let n = 0;
  const fetchFake = async (url, init) => {
    assert.equal(url, TIKTOK_TOKEN_URL);
    const form = Object.fromEntries(new URLSearchParams(init.body));
    calls.push(form);
    if (form.grant_type === 'authorization_code') return reply(200, { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 86400, refresh_expires_in: 31536000, open_id: 'open-1', scope: 'user.info.basic,video.upload,video.publish' });
    if (form.refresh_token === 'ref-dead') return reply(400, { error: 'invalid_grant', error_description: 'refresh token revoked' });
    await new Promise(r => setTimeout(r, 30));
    n += 1;
    return reply(200, { access_token: 'acc-' + (n + 1), refresh_token: 'ref-' + (n + 1), expires_in: 86400 });
  };
  const logs = [];
  const auth = createTikTokAuth({ file, fetch: fetchFake, now: () => clock, log: m => logs.push(m) });

  assert.equal(auth.status().configured, false);
  await assert.rejects(() => auth.getFreshToken(), /não conectado/);
  assert.throws(() => auth.startAuth('https://x/cb'), /Salve a client key/);
  assert.throws(() => auth.setConfig({ clientKey: '', clientSecret: 'abc' }), /Informe/);
  auth.setConfig({ clientKey: 'awtestclientkey1', clientSecret: 'segredo-de-teste-123' });
  assert.equal(auth.status().configured, true);
  assert.equal(auth.status().clientKey, 'awte…ey1');
  assert.ok(!JSON.stringify(auth.status()).includes('segredo-de-teste'));

  // Autorização inicial: state de uso único e com validade.
  const { authUrl, state } = auth.startAuth('https://tunel.example/tiktok/callback');
  assert.match(authUrl, /^https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\/\?client_key=awtestclientkey1&scope=user\.info\.basic%2Cvideo\.upload%2Cvideo\.publish&response_type=code&redirect_uri=https%3A%2F%2Ftunel\.example%2Ftiktok%2Fcallback&state=[a-f0-9]{32}$/);
  await assert.rejects(() => auth.handleCallback({ code: 'c', state: 'errado' }), /inválido ou expirado/);
  await assert.rejects(() => auth.handleCallback({ state, error: 'access_denied', error_description: 'usuário negou' }), /não autorizou/);
  const again = auth.startAuth('https://tunel.example/tiktok/callback');
  const status = await auth.handleCallback({ code: 'codigo-1', state: again.state });
  assert.equal(status.connected, true); assert.equal(status.openId, 'open-1');
  assert.equal(calls.at(-1).redirect_uri, 'https://tunel.example/tiktok/callback'); assert.equal(calls.at(-1).client_secret, 'segredo-de-teste-123');
  await assert.rejects(() => auth.handleCallback({ code: 'codigo-1', state: again.state }), /inválido ou expirado/);
  assert.equal(secrets().tiktok.refreshToken, 'ref-1');
  assert.equal(secrets().bridgeToken, 'x');

  // Token ainda válido: não renova.
  assert.equal(await auth.getFreshToken(), 'acc-1');
  assert.equal(calls.filter(c => c.grant_type === 'refresh_token').length, 0);

  // Faltando menos de 1 h: duas chamadas simultâneas geram uma única renovação e o refresh novo é gravado.
  clock += 23.5 * 3600 * 1000;
  const [a, b] = await Promise.all([auth.getFreshToken(), auth.getFreshToken()]);
  assert.equal(a, 'acc-2'); assert.equal(b, 'acc-2');
  assert.equal(calls.filter(c => c.grant_type === 'refresh_token').length, 1);
  assert.equal(calls.at(-1).refresh_token, 'ref-1');
  assert.equal(secrets().tiktok.refreshToken, 'ref-2');
  assert.ok(logs.includes('TikTok: token renovado.'));

  // invalid_grant: marca desconectado sem tentar de novo em loop.
  const all = secrets(); all.tiktok.refreshToken = 'ref-dead'; all.tiktok.expiresAt = clock; fs.writeFileSync(file, JSON.stringify(all));
  await assert.rejects(() => auth.getFreshToken(), /invalid_grant/);
  assert.equal(auth.status().connected, false); assert.match(auth.status().error, /invalid_grant/);
  await assert.rejects(() => auth.getFreshToken(), /desconectado/);
  assert.equal(calls.filter(c => c.refresh_token === 'ref-dead').length, 1);

  // Trocar a chave limpa os tokens; desconectar limpa o erro.
  auth.setConfig({ clientKey: 'awoutrachave0001', clientSecret: 'segredo-de-teste-123' });
  assert.equal(auth.status().error, '');
  assert.equal(auth.disconnect().connected, false);
  fs.rmSync(temporary, { recursive: true, force: true });
});
