// Gera automation/workflows.json (fluxos do n8n) e data/n8n-import-credential.json (credenciais iniciais).
// Os fluxos conversam com o painel local por http://127.0.0.1:3210 usando o token da ponte.
// Credenciais das redes são criadas vazias: o usuário preenche no n8n (Credenciais) sem editar os fluxos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'automation');
const dataDir = process.env.NGD_DATA_DIR || path.join(root, 'data');
const PANEL = 'http://127.0.0.1:3210';
// --simulate: os nós de rede apontam para o mock local (automation/mock-platforms.mjs) e nada é publicado de verdade.
const SIM = process.argv.includes('--simulate');
const MOCK = (process.env.NGD_MOCK_URL || 'http://127.0.0.1:3212').replace(/\/$/, '');
const GRAPH = SIM ? `${MOCK}/graph/v21.0` : 'https://graph.facebook.com/v21.0';
const RUPLOAD = SIM ? `${MOCK}/rupload/video-reels` : 'https://rupload.facebook.com/video-reels';
const TIKTOK = SIM ? `${MOCK}/tiktok/v2` : 'https://open.tiktokapis.com/v2';
const YOUTUBE = SIM ? `${MOCK}/youtube/v3` : 'https://www.googleapis.com/youtube/v3';

// ---------- credenciais ----------
const CRED = {
  bridge: { id: 'ngdLocalBridge01', name: 'NGD · comunicação local', type: 'httpHeaderAuth' },
  meta: { id: 'ngdMetaPage01', name: 'NGD · Meta (token da Página)', type: 'httpHeaderAuth' },
  tiktok: { id: 'ngdTikTok01', name: 'NGD · TikTok (access token)', type: 'httpHeaderAuth' },
  youtube: { id: 'ngdYouTube01', name: 'NGD · YouTube (Google OAuth2)', type: 'youTubeOAuth2Api' },
};
const cred = key => ({ [CRED[key].type]: { id: CRED[key].id, name: CRED[key].name } });

// ---------- ajudantes de nós ----------
const pos = (x, row) => [x * 260, row * 180];
const settings = { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all', saveManualExecutions: true };
const JOB = "$('Dividir trabalhos').item.json";
const PUB = "$('Dividir publicações').item.json";
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function http(name, position, { method = 'GET', url, auth, token, body, binary, headers, query, timeout = 120000, responseFormat = 'json', neverError = true } = {}) {
  const p = { method, url, options: { timeout, response: { response: { neverError, responseFormat, fullResponse: false } } } };
  // TikTok: o token vem do painel em cada trabalho (expressão em `token`), sem credencial guardada no n8n.
  if (auth === 'tiktok') { auth = null; headers = { Authorization: `={{ 'Bearer ' + (${token}) }}`, ...(headers || {}) }; p.authentication = 'none'; }
  else if (auth === 'youtube' && SIM) { auth = null; headers = { Authorization: 'Bearer youtube-simulado', ...(headers || {}) }; p.authentication = 'none'; }
  else if (auth === 'youtube') { p.authentication = 'predefinedCredentialType'; p.nodeCredentialType = 'youTubeOAuth2Api'; }
  else if (auth) { p.authentication = 'genericCredentialType'; p.genericAuthType = 'httpHeaderAuth'; }
  else p.authentication = 'none';
  if (body !== undefined) { p.sendBody = true; p.specifyBody = 'json'; p.contentType = 'json'; p.jsonBody = body; }
  if (binary) { p.sendBody = true; p.contentType = 'binaryData'; p.inputDataFieldName = binary; }
  if (headers) { p.sendHeaders = true; p.specifyHeaders = 'keypair'; p.headerParameters = { parameters: Object.entries(headers).map(([n, value]) => ({ name: n, value })) }; }
  if (query) { p.sendQuery = true; p.specifyQuery = 'keypair'; p.queryParameters = { parameters: Object.entries(query).map(([n, value]) => ({ name: n, value })) }; }
  const node = { id: slug(name), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, parameters: p, onError: 'continueRegularOutput' };
  if (auth) node.credentials = cred(auth);
  return node;
}
const panel = (name, position, endpoint, body, method = 'POST') => { const n = http(name, position, { method, url: `${PANEL}/api/automation/${endpoint}`, auth: 'bridge', body, timeout: 30000, neverError: false }); delete n.onError; return n; };
const setNode = (name, position, fields, keep = true) => ({ id: slug(name), name, type: 'n8n-nodes-base.set', typeVersion: 3.4, position, parameters: { assignments: { assignments: fields.map(([n, value, type = 'string']) => ({ id: n, name: n, value, type })) }, includeOtherFields: keep, options: {} } });
const ifNode = (name, position, left) => ({ id: slug(name), name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c1', leftValue: left, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, looseTypeValidation: true, options: {} } });
const wait = (name, position, seconds) => ({ id: slug(name), name, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position, webhookId: slug(name), parameters: { amount: seconds, unit: 'seconds' } });
const note = (name, position, content, width = 420, height = 220) => ({ id: slug(name), name, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position, parameters: { content, width, height } });
const webhook = (name, position, pathName, method = 'POST', responseMode = 'onReceived') => ({ id: slug(name), name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position, webhookId: pathName, parameters: { path: pathName, httpMethod: method, authentication: 'headerAuth', responseMode, options: {} }, credentials: cred('bridge') });
const switchNode = (name, position, left, keys) => ({ id: slug(name), name, type: 'n8n-nodes-base.switch', typeVersion: 3.2, position, parameters: { mode: 'rules', rules: { values: keys.map(k => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ id: k, leftValue: left, rightValue: k, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: k })) }, looseTypeValidation: true, options: {} } });
const splitOut = (name, position, field) => ({ id: slug(name), name, type: 'n8n-nodes-base.splitOut', typeVersion: 1, position, parameters: { fieldToSplitOut: field, options: {} } });
const readFile = (name, position, selector) => ({ id: slug(name), name, type: 'n8n-nodes-base.readWriteFile', typeVersion: 1, position, parameters: { fileSelector: selector, options: { dataPropertyName: 'data' } } });
const connect = (edges) => { const c = {}; for (const [from, to, output = 0] of edges) { c[from] ??= { main: [] }; while (c[from].main.length <= output) c[from].main.push([]); c[from].main[output].push({ node: to, type: 'main', index: 0 }); } return c; };
const resultBody = (network, extra) => `={{ JSON.stringify({ contentId: ${JOB}.contentId, network: '${network}', ${extra} }) }}`;
// Mensagem de falha legível: erro da plataforma, motivo do TikTok, estado do contêiner do Instagram ou, por último, o JSON bruto.
const failBody = network => resultBody(network, `status: 'failed', error: String([$json.error?.message, $json.error?.error_user_msg, $json.data?.fail_reason, $json.status_code === 'ERROR' ? $json.status : '', typeof $json.error === 'string' ? $json.error : '', JSON.stringify($json)].find(v => v) || 'Falha não informada.').slice(0, 900)`);

// ---------- 1. Verificar conexão do painel (mantido) ----------
const health = { id: 'ngdLocalHealth01', name: 'NGD · Verificar conexão do painel', active: false, settings, nodes: [
  webhook('Verificação autenticada', pos(0, 0), 'ngd-local-health', 'GET', 'lastNode'),
  setNode('Confirmar conexão', pos(1, 0), [['service', 'ngd-n8n'], ['mode', 'publishing']], false),
], connections: connect([['Verificação autenticada', 'Confirmar conexão']]) };

// ---------- 2. Publicar fila ----------
const publishNodes = [
  { id: 'schedule', name: 'A cada 5 minutos', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, 0), parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } },
  webhook('Publicar agora (painel)', pos(0, 1), 'ngd-publish-now'),
  { id: 'manual', name: 'Executar manualmente', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 2), parameters: {} },
  panel('Buscar trabalhos vencidos', pos(1, 1), 'claim', '={{ JSON.stringify({ limit: 10 }) }}'),
  splitOut('Dividir trabalhos', pos(2, 1), 'jobs'),
  switchNode('Por rede', pos(3, 1), '={{ $json.network }}', ['youtube', 'facebook', 'instagram', 'tiktok']),
  note('Como funciona', [-80, -420], '## NGD · Publicar fila\nA cada 5 minutos (ou quando o painel pede) este fluxo busca no painel os vídeos vencidos e prontos, publica em cada rede e devolve o link ou o erro.\n\n**Credenciais**: menu Credenciais → preencha "NGD · YouTube" e "NGD · Meta". O TikTok é conectado no painel (Redes sociais), que manda o token renovado em cada trabalho. Não é preciso editar os nós.\n\nSe uma rede falhar, o painel mostra o erro em Automações e permite tentar de novo.', 520, 260),

  // YouTube
  readFile('Ler vídeo (YouTube)', pos(4, 0), '={{ $json.filePath }}'),
  SIM ? http('Enviar para o YouTube', pos(5, 0), { method: 'POST', url: `${MOCK}/youtube/upload/videos`, auth: 'youtube', binary: 'data', query: { part: 'snippet,status', title: `={{ ${JOB}.title }}` }, timeout: 900000 })
    : { id: 'youtube-upload', name: 'Enviar para o YouTube', type: 'n8n-nodes-base.youTube', typeVersion: 1, position: pos(5, 0), onError: 'continueRegularOutput', parameters: { resource: 'video', operation: 'upload', title: `={{ ${JOB}.title }}`, regionCode: 'BR', categoryId: '22', binaryProperty: 'data', options: { description: `={{ ${JOB}.text }}`, privacyStatus: 'public', selfDeclaredMadeForKids: false, notifySubscribers: true, tags: `={{ (${JOB}.hashtags || '').split(/\\s+/).filter(Boolean).map(t => t.replace('#','')).join(',') }}` } }, credentials: cred('youtube') },
  ifNode('YouTube deu certo?', pos(6, 0), '={{ !!$json.id && !$json.error }}'),
  panel('Registrar sucesso YouTube', pos(7, -0.5), 'result', resultBody('youtube', "status: 'published', externalId: $json.id, url: 'https://youtube.com/shorts/' + $json.id")),
  panel('Registrar falha YouTube', pos(7, 0.5), 'result', failBody('youtube')),

  // Facebook Reels
  http('FB: iniciar envio', pos(4, 2), { method: 'POST', url: `=${GRAPH}/{{ $json.integrations.pageId }}/video_reels`, auth: 'meta', body: '={{ JSON.stringify({ upload_phase: "start" }) }}' }),
  ifNode('FB iniciou?', pos(5, 2), '={{ !!$json.video_id && !$json.error }}'),
  readFile('Ler vídeo (Facebook)', pos(6, 1.5), `={{ ${JOB}.filePath }}`),
  http('FB: enviar arquivo', pos(7, 1.5), { method: 'POST', url: `=${RUPLOAD}/{{ $('FB: iniciar envio').item.json.video_id }}`, auth: 'meta', binary: 'data', headers: { offset: '0', file_size: `={{ ${JOB}.bytes }}` }, timeout: 900000 }),
  http('FB: concluir e publicar', pos(8, 1.5), { method: 'POST', url: `=${GRAPH}/{{ ${JOB}.integrations.pageId }}/video_reels`, auth: 'meta', query: { upload_phase: 'finish', video_id: "={{ $('FB: iniciar envio').item.json.video_id }}", video_state: 'PUBLISHED', description: `={{ ${JOB}.text }}` }, timeout: 300000 }),
  ifNode('FB publicou?', pos(9, 1.5), '={{ $json.success === true && !$json.error }}'),
  panel('Registrar sucesso Facebook', pos(10, 1), 'result', resultBody('facebook', "status: 'published', externalId: $('FB: iniciar envio').item.json.video_id, url: 'https://www.facebook.com/reel/' + $('FB: iniciar envio').item.json.video_id")),
  panel('Registrar falha Facebook', pos(10, 2.5), 'result', failBody('facebook')),

  // Instagram Reels
  http('IG: criar contêiner', pos(4, 4), { method: 'POST', url: `=${GRAPH}/{{ $json.integrations.igUserId }}/media`, auth: 'meta', body: '={{ JSON.stringify({ media_type: "REELS", video_url: $json.publicUrl, caption: $json.text, share_to_feed: true }) }}', timeout: 300000 }),
  ifNode('IG criou?', pos(5, 4), '={{ !!$json.id && !$json.error }}'),
  wait('IG: aguardar processamento', pos(6, 3.5), 20),
  http('IG: consultar estado', pos(7, 3.5), { method: 'GET', url: `=${GRAPH}/{{ $('IG: criar contêiner').item.json.id }}`, auth: 'meta', query: { fields: 'status_code,status' } }),
  switchNode('IG: estado', pos(8, 3.5), '={{ $json.status_code === "FINISHED" ? "ok" : ($json.status_code === "IN_PROGRESS" && $runIndex < 25) ? "wait" : "fail" }}', ['ok', 'wait', 'fail']),
  http('IG: publicar', pos(9, 3), { method: 'POST', url: `=${GRAPH}/{{ ${JOB}.integrations.igUserId }}/media_publish`, auth: 'meta', query: { creation_id: "={{ $('IG: criar contêiner').item.json.id }}" }, timeout: 300000 }),
  http('IG: obter link', pos(10, 3), { method: 'GET', url: `=${GRAPH}/{{ $json.id }}`, auth: 'meta', query: { fields: 'permalink' } }),
  ifNode('IG publicou?', pos(11, 3), '={{ !!$json.permalink && !$json.error }}'),
  panel('Registrar sucesso Instagram', pos(12, 2.5), 'result', resultBody('instagram', "status: 'published', externalId: $json.id, url: $json.permalink")),
  panel('Registrar falha Instagram', pos(12, 4.5), 'result', failBody('instagram')),

  // TikTok
  http('TT: iniciar envio', pos(4, 6), { method: 'POST', url: `${TIKTOK}/post/publish/video/init/`, auth: 'tiktok', token: `${JOB}.tiktokToken`, body: '={{ JSON.stringify({ post_info: { title: ($json.text || $json.title).slice(0, 2200), privacy_level: $json.integrations.privacy || "SELF_ONLY", disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 }, source_info: { source: "FILE_UPLOAD", video_size: $json.bytes, chunk_size: $json.bytes, total_chunk_count: 1 } }) }}', headers: { 'Content-Type': 'application/json; charset=UTF-8' } }),
  ifNode('TT iniciou?', pos(5, 6), '={{ !!$json.data?.upload_url && $json.error?.code === "ok" }}'),
  readFile('Ler vídeo (TikTok)', pos(6, 5.5), `={{ ${JOB}.filePath }}`),
  http('TT: enviar arquivo', pos(7, 5.5), { method: 'PUT', url: "={{ $('TT: iniciar envio').item.json.data.upload_url }}", binary: 'data', headers: { 'Content-Type': 'video/mp4', 'Content-Range': `=bytes 0-{{ ${JOB}.bytes - 1 }}/{{ ${JOB}.bytes }}` }, timeout: 900000, responseFormat: 'text' }),
  wait('TT: aguardar processamento', pos(8, 5.5), 15),
  http('TT: consultar estado', pos(9, 5.5), { method: 'POST', url: `${TIKTOK}/post/publish/status/fetch/`, auth: 'tiktok', token: `${JOB}.tiktokToken`, body: "={{ JSON.stringify({ publish_id: $('TT: iniciar envio').item.json.data.publish_id }) }}", headers: { 'Content-Type': 'application/json; charset=UTF-8' } }),
  switchNode('TT: estado', pos(10, 5.5), '={{ $json.data?.status === "PUBLISH_COMPLETE" ? "ok" : (["PROCESSING_UPLOAD","PROCESSING_DOWNLOAD","SEND_TO_USER_INBOX"].includes($json.data?.status) && $runIndex < 25) ? "wait" : "fail" }}', ['ok', 'wait', 'fail']),
  panel('Registrar sucesso TikTok', pos(11, 5), 'result', resultBody('tiktok', "status: 'published', externalId: String($json.data?.publicaly_available_post_id?.[0] ?? $('TT: iniciar envio').item.json.data.publish_id), url: $json.data?.publicaly_available_post_id?.[0] ? 'https://www.tiktok.com/video/' + $json.data.publicaly_available_post_id[0] : ''")),
  panel('Registrar falha TikTok', pos(11, 6.5), 'result', failBody('tiktok')),
];
const publish = { id: 'ngdPublishQueue01', name: 'NGD · Publicar fila', active: false, settings, nodes: publishNodes, connections: connect([
  ['A cada 5 minutos', 'Buscar trabalhos vencidos'], ['Publicar agora (painel)', 'Buscar trabalhos vencidos'], ['Executar manualmente', 'Buscar trabalhos vencidos'],
  ['Buscar trabalhos vencidos', 'Dividir trabalhos'], ['Dividir trabalhos', 'Por rede'],
  ['Por rede', 'Ler vídeo (YouTube)', 0], ['Por rede', 'FB: iniciar envio', 1], ['Por rede', 'IG: criar contêiner', 2], ['Por rede', 'TT: iniciar envio', 3],
  ['Ler vídeo (YouTube)', 'Enviar para o YouTube'], ['Enviar para o YouTube', 'YouTube deu certo?'], ['YouTube deu certo?', 'Registrar sucesso YouTube', 0], ['YouTube deu certo?', 'Registrar falha YouTube', 1],
  ['FB: iniciar envio', 'FB iniciou?'], ['FB iniciou?', 'Ler vídeo (Facebook)', 0], ['FB iniciou?', 'Registrar falha Facebook', 1], ['Ler vídeo (Facebook)', 'FB: enviar arquivo'], ['FB: enviar arquivo', 'FB: concluir e publicar'], ['FB: concluir e publicar', 'FB publicou?'], ['FB publicou?', 'Registrar sucesso Facebook', 0], ['FB publicou?', 'Registrar falha Facebook', 1],
  ['IG: criar contêiner', 'IG criou?'], ['IG criou?', 'IG: aguardar processamento', 0], ['IG criou?', 'Registrar falha Instagram', 1], ['IG: aguardar processamento', 'IG: consultar estado'], ['IG: consultar estado', 'IG: estado'], ['IG: estado', 'IG: publicar', 0], ['IG: estado', 'IG: aguardar processamento', 1], ['IG: estado', 'Registrar falha Instagram', 2], ['IG: publicar', 'IG: obter link'], ['IG: obter link', 'IG publicou?'], ['IG publicou?', 'Registrar sucesso Instagram', 0], ['IG publicou?', 'Registrar falha Instagram', 1],
  ['TT: iniciar envio', 'TT iniciou?'], ['TT iniciou?', 'Ler vídeo (TikTok)', 0], ['TT iniciou?', 'Registrar falha TikTok', 1], ['Ler vídeo (TikTok)', 'TT: enviar arquivo'], ['TT: enviar arquivo', 'TT: aguardar processamento'], ['TT: aguardar processamento', 'TT: consultar estado'], ['TT: consultar estado', 'TT: estado'], ['TT: estado', 'Registrar sucesso TikTok', 0], ['TT: estado', 'TT: aguardar processamento', 1], ['TT: estado', 'Registrar falha TikTok', 2],
]) };

// ---------- 3. Testar conexão ----------
// O TikTok devolve sempre `error: { code: "ok" }` em respostas boas; só é erro real quando o objeto existe com código diferente de "ok".
const ERRO_REAL = '($json.error && $json.error.code !== "ok")';
const answer = (name, position, account) => setNode(name, position, [['connected', `={{ !${ERRO_REAL} && !!(${account}) }}`, 'boolean'], ['account', '={{ String(' + account + ' ?? "") }}'], ['error', `={{ String(${ERRO_REAL} ? ($json.error.message || $json.error) : "") }}`]], false);
const testNodes = [
  webhook('Pedido de teste', pos(0, 0), 'ngd-test-connection', 'POST', 'responseNode'),
  switchNode('Qual rede?', pos(1, 0), '={{ $json.body.network }}', ['youtube', 'facebook', 'instagram', 'tiktok']),
  http('Testar YouTube', pos(2, -1.5), { method: 'GET', url: `${YOUTUBE}/channels`, auth: 'youtube', query: { part: 'snippet', mine: 'true' } }),
  answer('Resposta YouTube', pos(3, -1.5), '$json.items?.[0]?.snippet?.title'),
  http('Testar Facebook', pos(2, -0.5), { method: 'GET', url: `${GRAPH}/me`, auth: 'meta', query: { fields: 'id,name' } }),
  answer('Resposta Facebook', pos(3, -0.5), '$json.name'),
  http('Testar Instagram', pos(2, 0.5), { method: 'GET', url: `=${GRAPH}/{{ $json.body.integrations?.igUserId || 'me' }}`, auth: 'meta', query: { fields: 'username' } }),
  answer('Resposta Instagram', pos(3, 0.5), '$json.username'),
  http('Testar TikTok', pos(2, 1.5), { method: 'GET', url: `${TIKTOK}/user/info/`, auth: 'tiktok', token: '$json.body.tiktokToken', query: { fields: 'open_id,display_name' } }),
  answer('Resposta TikTok', pos(3, 1.5), '($json.data?.user?.display_name || $json.data?.user?.open_id)'),
  { id: 'respond', name: 'Responder ao painel', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos(4, 0), parameters: { respondWith: 'firstIncomingItem', options: {} } },
  note('Sobre este fluxo', [-80, -400], '## NGD · Testar conexão\nO painel chama este fluxo pelo botão "Testar conexão" de cada rede. Ele faz uma consulta simples ("quem sou eu") com a credencial correspondente e responde se funcionou.\n\nSe a credencial estiver vazia ou expirada, a resposta traz o erro da plataforma.', 520, 200),
];
const testFlow = { id: 'ngdTestConnection01', name: 'NGD · Testar conexão', active: false, settings, nodes: testNodes, connections: connect([
  ['Pedido de teste', 'Qual rede?'], ['Qual rede?', 'Testar YouTube', 0], ['Qual rede?', 'Testar Facebook', 1], ['Qual rede?', 'Testar Instagram', 2], ['Qual rede?', 'Testar TikTok', 3],
  ['Testar YouTube', 'Resposta YouTube'], ['Testar Facebook', 'Resposta Facebook'], ['Testar Instagram', 'Resposta Instagram'], ['Testar TikTok', 'Resposta TikTok'],
  ['Resposta YouTube', 'Responder ao painel'], ['Resposta Facebook', 'Responder ao painel'], ['Resposta Instagram', 'Responder ao painel'], ['Resposta TikTok', 'Responder ao painel'],
]) };

// ---------- 4. Coletar resultados ----------
const metric = (name, position, fields) => panel(name, position, 'metrics', `={{ JSON.stringify({ items: [{ contentId: ${PUB}.contentId, network: ${PUB}.network, ${fields} }] }) }}`);
const collectNodes = [
  { id: 'daily', name: 'Todo dia às 7h', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0, 0), parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 7 }] } } },
  webhook('Coletar agora (painel)', pos(0, 1), 'ngd-collect-metrics'),
  { id: 'manual-collect', name: 'Executar manualmente', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 2), parameters: {} },
  panel('Buscar publicações', pos(1, 1), 'published', undefined, 'GET'),
  splitOut('Dividir publicações', pos(2, 1), 'items'),
  switchNode('Rede da publicação', pos(3, 1), '={{ $json.network }}', ['youtube', 'facebook', 'instagram', 'tiktok']),
  http('Métricas YouTube', pos(4, -0.5), { method: 'GET', url: `${YOUTUBE}/videos`, auth: 'youtube', query: { part: 'statistics', id: '={{ $json.externalId }}' } }),
  metric('Gravar YouTube', pos(5, -0.5), 'views: $json.items?.[0]?.statistics?.viewCount, likes: $json.items?.[0]?.statistics?.likeCount, comments: $json.items?.[0]?.statistics?.commentCount, shares: null'),
  http('Métricas Facebook', pos(4, 0.5), { method: 'GET', url: `=${GRAPH}/{{ $json.externalId }}`, auth: 'meta', query: { fields: 'views,likes.summary(true),comments.summary(true)' } }),
  metric('Gravar Facebook', pos(5, 0.5), 'views: $json.views, likes: $json.likes?.summary?.total_count, comments: $json.comments?.summary?.total_count, shares: null'),
  http('Métricas Instagram', pos(4, 1.5), { method: 'GET', url: `=${GRAPH}/{{ $json.externalId }}`, auth: 'meta', query: { fields: 'like_count,comments_count,insights.metric(views,shares)' } }),
  metric('Gravar Instagram', pos(5, 1.5), 'views: $json.insights?.data?.find(m => m.name === "views")?.values?.[0]?.value, likes: $json.like_count, comments: $json.comments_count, shares: $json.insights?.data?.find(m => m.name === "shares")?.values?.[0]?.value'),
  http('Métricas TikTok', pos(4, 2.5), { method: 'POST', url: `${TIKTOK}/video/query/`, auth: 'tiktok', token: '$json.tiktokToken', query: { fields: 'id,view_count,like_count,comment_count,share_count' }, body: '={{ JSON.stringify({ filters: { video_ids: [$json.externalId] } }) }}', headers: { 'Content-Type': 'application/json; charset=UTF-8' } }),
  metric('Gravar TikTok', pos(5, 2.5), 'views: $json.data?.videos?.[0]?.view_count, likes: $json.data?.videos?.[0]?.like_count, comments: $json.data?.videos?.[0]?.comment_count, shares: $json.data?.videos?.[0]?.share_count'),
  note('Sobre a coleta', [-80, -400], '## NGD · Coletar resultados\nUma vez por dia (ou pelo botão em Resultados) busca visualizações, curtidas, comentários e compartilhamentos de cada publicação feita pela automação e grava no painel.\n\nCada rede expõe métricas diferentes; campos indisponíveis ficam vazios.', 520, 200),
];
const collect = { id: 'ngdCollectMetrics01', name: 'NGD · Coletar resultados', active: false, settings, nodes: collectNodes, connections: connect([
  ['Todo dia às 7h', 'Buscar publicações'], ['Coletar agora (painel)', 'Buscar publicações'], ['Executar manualmente', 'Buscar publicações'],
  ['Buscar publicações', 'Dividir publicações'], ['Dividir publicações', 'Rede da publicação'],
  ['Rede da publicação', 'Métricas YouTube', 0], ['Rede da publicação', 'Métricas Facebook', 1], ['Rede da publicação', 'Métricas Instagram', 2], ['Rede da publicação', 'Métricas TikTok', 3],
  ['Métricas YouTube', 'Gravar YouTube'], ['Métricas Facebook', 'Gravar Facebook'], ['Métricas Instagram', 'Gravar Instagram'], ['Métricas TikTok', 'Gravar TikTok'],
]) };

const fluxos = [health, publish, testFlow, collect];
if (SIM) {
  for (const w of fluxos) w.nodes.push(note('Modo simulado', [-80, -640], `## ⚠ MODO SIMULADO
Este fluxo aponta para o mock local em ${MOCK}. Nada é publicado de verdade.

Para voltar aos fluxos reais: automation/simular.ps1 -Desligar`, 520, 160));
  fs.mkdirSync(dataDir, { recursive: true });
  const saida = path.join(dataDir, 'workflows.simulado.json');
  fs.writeFileSync(saida, JSON.stringify(fluxos, null, 2));
  console.log(`Fluxos SIMULADOS gerados em ${saida} (mock: ${MOCK}). Credenciais não foram tocadas.`);
  process.exit(0);
}
fs.writeFileSync(path.join(dir, 'workflows.json'), JSON.stringify(fluxos, null, 2));

// Credenciais: a da ponte recebe o token real; as das redes nascem vazias para o usuário preencher no n8n.
const secret = JSON.parse(fs.readFileSync(path.join(dataDir, 'automation-secrets.json'), 'utf8'));
const credentials = [
  { ...CRED.bridge, data: { name: 'X-NGD-Automation', value: secret.bridgeToken } },
  { ...CRED.meta, data: { name: 'Authorization', value: 'OAuth COLE_AQUI_O_TOKEN_DA_PAGINA' } },
  { ...CRED.tiktok, data: { name: 'Authorization', value: 'Bearer COLE_AQUI_O_ACCESS_TOKEN' } },
  { ...CRED.youtube, data: { clientId: '', clientSecret: '', sendAdditionalBodyProperties: false, additionalBodyProperties: '' } },
];
const onlyBridge = process.argv.includes('--only-bridge');
fs.writeFileSync(path.join(dataDir, 'n8n-import-credential.json'), JSON.stringify(onlyBridge ? credentials.slice(0, 1) : credentials), { mode: 0o600 });
console.log(`Fluxos gerados: ${[health, publish, testFlow, collect].map(w => w.name).join(' | ')}. Credenciais preparadas: ${onlyBridge ? 1 : credentials.length}.`);
