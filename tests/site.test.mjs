import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { montarJwt, createGoogle, SCOPES } from '../lib/site/google.mjs';
import { createSiteMonitor, normGscTotais, normGscLinhas, normSitemaps, normInspecao, normGa4, normPagespeed, alertasIndexacao, janelas, explicar, caminho, PAGINAS_PRINCIPAIS } from '../lib/site/collect.mjs';
import { dadosExemplo } from '../lib/site/exemplo.mjs';
import { htmlSite, faixaNota, variacao } from '../public/site.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-site-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const chave = { type: 'service_account', project_id: 'ngd-teste', client_email: 'robo@ngd-teste.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const AGORA = Date.parse('2026-10-09T15:00:00Z');

test('JWT da conta de serviço: RS256 válido, escopos só de leitura e validade de 1 h', () => {
  const jwt = montarJwt(chave, { now: AGORA });
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.iss, chave.client_email);
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(claims.scope, SCOPES);
  assert.ok(SCOPES.split(' ').every(x => x.endsWith('.readonly')));
  assert.ok(createVerify('RSA-SHA256').update(h + '.' + c).verify(publicKey, Buffer.from(s, 'base64url')));
});

test('token do Google é pedido uma vez e reaproveitado até perto de vencer; sem chave dá erro claro', async () => {
  const file = path.join(temp, 'chave-token.json');
  let agora = AGORA, pedidos = 0;
  const fetch = async (url, opts) => { pedidos++; assert.match(String(opts.body), /grant_type=urn%3Aietf/); return new Response(JSON.stringify({ access_token: 'tok' + pedidos, expires_in: 3600 })); };
  const g = createGoogle({ file, fetch, now: () => agora });
  await assert.rejects(g.token(), /Chave do robô ausente/);
  fs.writeFileSync(file, JSON.stringify(chave));
  assert.deepEqual(g.robo(), { email: chave.client_email, projeto: 'ngd-teste' });
  assert.equal(await g.token(), 'tok1');
  assert.equal(await g.token(), 'tok1');
  agora += 3600 * 1000 - 30 * 1000;   // falta menos de 1 min
  assert.equal(await g.token(), 'tok2');
  assert.equal(pedidos, 2);
});

test('janelas de 28 dias: Search Console com 3 dias de atraso, anterior encostada', () => {
  const j = janelas(AGORA, 3);
  assert.deepEqual(j.atual, { inicio: '2026-09-09', fim: '2026-10-06' });
  assert.deepEqual(j.anterior, { inicio: '2026-08-12', fim: '2026-09-08' });
  assert.equal(janelas(AGORA, 1).atual.fim, '2026-10-08');
});

test('normalização das respostas do Search Console, GA4 e PageSpeed', () => {
  assert.deepEqual(normGscTotais({ rows: [{ clicks: 42, impressions: 2100, ctr: 0.02, position: 17.456 }] }), { clicks: 42, impressions: 2100, ctr: 2, position: 17.46 });
  assert.deepEqual(normGscTotais({}), { clicks: 0, impressions: 0, ctr: 0, position: 0 });
  assert.deepEqual(normGscLinhas({ rows: [{ keys: ['backdrop brasília'], clicks: 3, impressions: 90, ctr: 0.0333, position: 5.1 }] }, 'busca'), [{ busca: 'backdrop brasília', clicks: 3, impressions: 90, ctr: 3.33, position: 5.1 }]);
  assert.equal(caminho('https://nucleografico.com.br/lp/box-truss/'), '/lp/box-truss');
  assert.equal(caminho('https://nucleografico.com.br/'), '/');
  assert.deepEqual(normSitemaps({ sitemap: [{ path: 'https://nucleografico.com.br/sitemap.xml', lastDownloaded: '2026-10-08T00:00:00Z', errors: '0', warnings: '1', contents: [{ type: 'web', submitted: '50', indexed: '0' }] }] })[0], { url: 'https://nucleografico.com.br/sitemap.xml', enviado: '', lido: '2026-10-08T00:00:00Z', pendente: false, erros: 0, avisos: 1, paginas: 50 });
  const insp = normInspecao('/backdrop', { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: '2026-10-07T10:00:00Z', googleCanonical: 'https://nucleografico.com.br/backdrop' } } }, 'x');
  assert.equal(insp.cobertura, 'Enviada e indexada');
  assert.equal(insp.canonica, '/backdrop');
  const ga = normGa4({ metricHeaders: [{ name: 'sessions' }], rows: [{ dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '123' }] }] }, ['sessionDefaultChannelGroup']);
  assert.deepEqual(ga, [{ sessionDefaultChannelGroup: 'Organic Search', sessions: 123 }]);
  assert.deepEqual(normPagespeed({ lighthouseResult: { categories: { performance: { score: 0.58 } }, audits: { 'largest-contentful-paint': { numericValue: 4630 }, 'cumulative-layout-shift': { numericValue: 0.0213 }, 'total-blocking-time': { numericValue: 412.4 } } } }), { nota: 58, lcp: 4.63, cls: 0.021, tbt: 412 });
  assert.equal(normPagespeed({}), null);
});

test('alerta quando página indexada sai do índice ou dá erro; não repete para quem já estava fora', () => {
  const antes = [{ pagina: '/', veredito: 'PASS' }, { pagina: '/backdrop', veredito: 'PASS' }, { pagina: '/roll-up', veredito: 'NEUTRAL' }];
  const depois = [{ pagina: '/', veredito: 'PASS', cobertura: 'Enviada e indexada' }, { pagina: '/backdrop', veredito: 'NEUTRAL', cobertura: 'Rastreada, ainda não indexada' }, { pagina: '/roll-up', veredito: 'NEUTRAL', cobertura: 'x' }, { pagina: '/contato', veredito: 'FAIL', cobertura: 'Não encontrada (404)' }];
  const a = alertasIndexacao(antes, depois, 'agora');
  assert.deepEqual(a.map(x => [x.pagina, x.tipo]), [['/backdrop', 'saiu'], ['/contato', 'erro']]);
});

test('erros do Google viram mensagens em português para quem opera', () => {
  assert.match(explicar('Search Console', { status: 403, google: 'User does not have sufficient permission' }), /robô não tem acesso ao Search Console/);
  assert.match(explicar('Analytics', { status: 403, google: 'denied' }), /Leitor na propriedade do GA4/);
  assert.match(explicar('Analytics', { status: 403, google: 'Google Analytics Data API has not been used in project 1 before or it is disabled' }), /desativada/);
  assert.match(explicar('Analytics', { code: 'sem_property' }), /ID da propriedade/);
  assert.match(explicar('PageSpeed', { status: 429 }), /Limite/);
});

// Google falso: responde por URL, conta as chamadas e nunca toca no site.
function googleFalso({ ga4Status = 200, indexadas = PAGINAS_PRINCIPAIS } = {}) {
  const chamadas = [];
  const fetch = async (url, opts = {}) => {
    url = String(url); chamadas.push(url);
    assert.ok(!url.startsWith('https://nucleografico.com.br'), 'nunca chama o site');
    const j = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.includes('oauth2')) return j({ access_token: 't', expires_in: 3600 });
    if (url.includes('searchAnalytics')) {
      const body = JSON.parse(opts.body), dim = body.dimensions?.[0];
      if (!dim) return j({ rows: [{ clicks: body.startDate === '2026-09-09' ? 100 : 80, impressions: 4000, ctr: 0.025, position: 15 }] });
      if (dim === 'date') return j({ rows: [{ keys: ['2026-10-02'], clicks: 4, impressions: 100 }, { keys: ['2026-10-01'], clicks: 3, impressions: 90 }] });
      return j({ rows: [{ keys: [dim === 'page' ? 'https://nucleografico.com.br/backdrop' : 'backdrop'], clicks: 9, impressions: 300, ctr: 0.03, position: 4 }] });
    }
    if (url.endsWith('/sitemaps')) return j({ sitemap: [{ path: 'https://nucleografico.com.br/sitemap.xml', contents: [{ submitted: '50' }] }] });
    if (url.includes('urlInspection')) { const p = new URL(JSON.parse(opts.body).inspectionUrl).pathname.replace(/\/$/, '') || '/'; return j({ inspectionResult: { indexStatusResult: indexadas.includes(p) ? { verdict: 'PASS', coverageState: 'Submitted and indexed' } : { verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed' } } }); }
    if (url.includes('analyticsdata')) {
      if (ga4Status !== 200) return j({ error: { code: ga4Status, message: 'User does not have sufficient permissions for this property.' } }, ga4Status);
      const body = JSON.parse(opts.body);
      return j({ metricHeaders: body.metrics.map(m => ({ name: m.name })), rows: [{ dimensionValues: body.dimensions.map(d => ({ value: d.name === 'date' ? '20261001' : 'Organic Search' })), metricValues: body.metrics.map(() => ({ value: '10' })) }] });
    }
    if (url.includes('pagespeedonline')) return j({ lighthouseResult: { categories: { performance: { score: url.includes('mobile') ? 0.6 : 0.9 } }, audits: {} } });
    throw new Error('URL inesperada ' + url);
  };
  return { fetch, chamadas };
}

test('coleta grava data/site.json, isola falha do GA4 e inspeciona no máximo uma rodada por dia', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'col-'));
  fs.writeFileSync(path.join(dir, 'google-site-leitura.json'), JSON.stringify(chave));
  let agora = AGORA;
  const g = googleFalso({ ga4Status: 403 });
  const m = createSiteMonitor({ dataDir: dir, fetch: g.fetch, now: () => agora });
  const d = await m.coletar();
  assert.equal(d.exemplo, false);
  assert.deepEqual(d.gsc.atual, { clicks: 100, impressions: 4000, ctr: 2.5, position: 15 });
  assert.equal(d.gsc.anterior.clicks, 80);
  assert.deepEqual(d.gsc.serie.map(s => s.dia), ['2026-10-01', '2026-10-02']);
  assert.equal(d.gsc.paginas[0].pagina, '/backdrop');
  assert.equal(d.indexacao.paginas.length, PAGINAS_PRINCIPAIS.length);
  assert.equal(d.fontes.ga4.ok, false);
  assert.match(d.fontes.ga4.erro, /ID da propriedade/);   // ainda sem property configurada
  assert.equal(d.velocidade.atual['/'].mobile.nota, 60);
  assert.equal(d.historico.at(-1).indexadas, PAGINAS_PRINCIPAIS.length);
  assert.ok(fs.existsSync(path.join(dir, 'site.json')));

  assert.throws(() => m.salvarConfig({ propertyId: 'G-GK9WHDK1M2' }), /só números/);
  m.salvarConfig({ propertyId: '412345678' });
  const inspecoes = g.chamadas.filter(u => u.includes('urlInspection')).length;
  agora += 3600 * 1000;
  const d2 = await m.coletar();
  assert.match(d2.fontes.ga4.erro, /Leitor/);
  assert.equal(g.chamadas.filter(u => u.includes('urlInspection')).length, inspecoes, 'não reinspeciona dentro de 20 h');
  assert.equal(d2.historico.length, 1, 'um ponto por dia');
});

test('alerta de desindexação aparece na coleta do dia seguinte', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'idx-'));
  fs.writeFileSync(path.join(dir, 'google-site-leitura.json'), JSON.stringify(chave));
  fs.writeFileSync(path.join(dir, 'site-config.json'), JSON.stringify({ propertyId: '412345678' }));
  let agora = AGORA, g = googleFalso();
  const fetch = (...a) => g.fetch(...a);
  const m = createSiteMonitor({ dataDir: dir, fetch, now: () => agora });
  const d1 = await m.coletar();
  assert.equal(d1.fontes.ga4.ok, true);
  assert.equal(d1.ga4.canais[0].nome, 'Google (orgânico)');
  assert.equal(d1.ga4.serie[0].dia, '2026-10-01');
  g = googleFalso({ indexadas: PAGINAS_PRINCIPAIS.filter(p => p !== '/backdrop') });
  agora += 86400000;
  const d2 = await m.coletar();
  assert.deepEqual(d2.indexacao.alertas.map(a => a.pagina), ['/backdrop']);
  assert.equal(d2.historico.length, 2);
});

test('trava: uma coleta por vez e a manual no máximo a cada 10 min; sem chave recusa', async () => {
  const dir = fs.mkdtempSync(path.join(temp, 'trava-'));
  let agora = AGORA;
  const g = googleFalso();
  const m = createSiteMonitor({ dataDir: dir, fetch: g.fetch, now: () => agora });
  await assert.rejects(m.coletar({ manual: true }), e => e.status === 409 && /chave do robô/.test(e.message));
  fs.writeFileSync(path.join(dir, 'google-site-leitura.json'), JSON.stringify(chave));
  const primeira = m.coletar({ manual: true });
  await assert.rejects(m.coletar(), e => e.status === 409);
  await primeira;
  agora += 5 * 60 * 1000;
  await assert.rejects(m.coletar({ manual: true }), e => e.status === 429 && /Aguarde 5 min/.test(e.message));
  agora += 6 * 60 * 1000;
  await m.coletar({ manual: true });
});

test('página em modo exemplo: faixa de aviso, cartão de configuração e todas as seções', () => {
  const html = htmlSite({ robo: null, propertyId: '', dados: dadosExemplo(AGORA) }, { date: v => v });
  assert.match(html, /Dados de exemplo/);
  assert.match(html, /data\/google-site-leitura\.json/);
  assert.match(html, /id="site-config"/);
  assert.match(html, /id="site-coletar"[^>]*disabled/);
  for (const t of ['Cliques vindos do Google', 'Velocidade', 'Buscas que trazem gente', 'De onde vêm as visitas', 'O Google está reconhecendo o site?', 'Páginas mais vistas', 'Cliques no WhatsApp']) assert.ok(html.includes(t), t);
  assert.ok(!/ style="/.test(html), 'sem style inline (CSP)');
  assert.match(html, /s-nota media"><b class="k-num">58/);
});

test('página com dados reais: sem faixa de exemplo, erro por fonte e último dado bom mantido', () => {
  const dados = { ...dadosExemplo(AGORA), exemplo: false };
  dados.fontes = { ...dados.fontes, ga4: { ok: false, erro: 'O robô não tem acesso ao Analytics.' } };
  const html = htmlSite({ robo: { email: 'robo@x' }, propertyId: '412345678', dados }, { date: v => v });
  assert.ok(!html.includes('Dados de exemplo'));
  assert.ok(!html.includes('id="site-config"'));
  assert.match(html, /Visitas \(GA4\):<\/strong> O robô não tem acesso/);
  assert.match(html, /aguardando o GA4/);
  assert.equal(faixaNota(95), 'boa'); assert.equal(faixaNota(50), 'media'); assert.equal(faixaNota(49), 'ruim');
  assert.equal(variacao(10, 0), null); assert.equal(variacao(120, 100), 20);
});
