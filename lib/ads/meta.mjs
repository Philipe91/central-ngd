// Leitura da Meta Ads. SOMENTE LEITURA: este arquivo só faz requisição GET.
// Não existe aqui nenhuma função que crie, pause, edite orçamento ou apague campanha,
// e nem deve existir enquanto o módulo estiver na etapa de leitura. Há um teste que
// verifica isso procurando por outros métodos HTTP no código.
//
// Importado por: lib/ads/routes.mjs (e pelos testes).
// API pública: API_BASE, dia, criarClienteMeta, sincronizar.
// Segredos: data/ads-secrets.json, chave "meta" com accessToken e adAccountId, fora do git.
// Tabelas gravadas: ad_accounts, campaigns, daily_metrics (gasto em centavos inteiros,
// data no formato "2026-01-02") e sync_runs.
import fs from 'node:fs';
import path from 'node:path';
import { registrar } from './db.mjs';

export const API_BASE = 'https://graph.facebook.com/v21.0';
const CAMPOS_CAMPANHA = 'id,name,objective,status,daily_budget,effective_status';
const CAMPOS_INSIGHT = 'campaign_id,spend,impressions,clicks,actions,date_start';

const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const centavos = valor => Math.round((Number(valor) || 0) * 100);
export const dia = d => new Date(d).toISOString().slice(0, 10);

export function criarClienteMeta({ file, fetch: fetchImpl = globalThis.fetch, baseUrl = API_BASE }) {
  const lerTudo = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const ler = () => lerTudo().meta || {};
  function gravar(patch) {
    const tudo = lerTudo();
    tudo.meta = { ...(tudo.meta || {}), ...patch };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(tudo, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return tudo.meta;
  }
  const mascarar = v => (v ? String(v).slice(0, 4) + '…' + String(v).slice(-4) : '');

  /** Toda chamada passa por aqui, e só aceita GET. */
  async function get(caminho, params = {}) {
    const m = ler();
    if (!m.accessToken) throw erro('Token da Meta não configurado.', 409);
    const url = new URL(baseUrl.replace(/\/$/, '') + caminho);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
    url.searchParams.set('access_token', m.accessToken);
    const resposta = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(30000) });
    let corpo = {}; try { corpo = await resposta.json(); } catch {}
    if (!resposta.ok || corpo.error) {
      const e = corpo.error || {};
      throw erro(`Meta recusou: ${e.message || 'erro ' + resposta.status}`, e.code === 190 ? 401 : 502);
    }
    return corpo;
  }

  /** Segue a paginação até acabar ou bater o limite, para não girar sem fim. */
  async function todasPaginas(caminho, params, maximo = 20) {
    const itens = [];
    let pagina = await get(caminho, { ...params, limit: 100 });
    itens.push(...(pagina.data || []));
    for (let i = 1; i < maximo && pagina.paging?.next; i += 1) {
      const resposta = await fetchImpl(pagina.paging.next, { method: 'GET', signal: AbortSignal.timeout(30000) });
      pagina = await resposta.json().catch(() => ({}));
      if (pagina.error) break;
      itens.push(...(pagina.data || []));
    }
    return itens;
  }

  return {
    status() {
      const m = ler();
      return { configurado: !!(m.accessToken && m.adAccountId), conta: m.adAccountId || '', token: mascarar(m.accessToken), nome: m.nome || '', erro: m.erro || '' };
    },
    salvarConfig({ accessToken, adAccountId }) {
      const token = String(accessToken || '').trim();
      let conta = String(adAccountId || '').trim();
      if (!token || token.length < 20) throw erro('Cole o token de leitura da Meta.');
      if (!conta) throw erro('Informe o identificador da conta de anúncios.');
      if (!conta.startsWith('act_')) conta = 'act_' + conta.replace(/\D/g, '');
      gravar({ accessToken: token, adAccountId: conta, erro: '' });
      return this.status();
    },
    desconectar() { gravar({ accessToken: '', adAccountId: '', nome: '', erro: '' }); return this.status(); },
    async testar() {
      const m = ler();
      try {
        const r = await get(`/${m.adAccountId}`, { fields: 'name,currency,account_status' });
        gravar({ nome: r.name || '', erro: '' });
        return { conectado: true, nome: r.name || '', moeda: r.currency || 'BRL' };
      } catch (error) {
        gravar({ erro: error.message });
        return { conectado: false, nome: '', erro: error.message };
      }
    },
    listarCampanhas() { return todasPaginas(`/${ler().adAccountId}/campaigns`, { fields: CAMPOS_CAMPANHA }); },
    insights(desde, ate) {
      return todasPaginas(`/${ler().adAccountId}/insights`, {
        fields: CAMPOS_INSIGHT, level: 'campaign', time_increment: 1,
        time_range: JSON.stringify({ since: dia(desde), until: dia(ate) }),
      });
    },
    contaId: () => ler().adAccountId || '',
  };
}

/** Quantos leads a plataforma atribuiu naquele dia, somando as ações de lead. */
function leadsDaPlataforma(insight) {
  const acoes = Array.isArray(insight.actions) ? insight.actions : [];
  return acoes.filter(a => /lead/i.test(String(a.action_type))).reduce((t, a) => t + (Number(a.value) || 0), 0);
}

/**
 * Traz estrutura e números da conta para o banco local.
 * Idempotente: rodar duas vezes o mesmo período não duplica nada, porque campanha usa
 * external_id único e métrica usa (campanha, dia) único. Por isso dá para re-sincronizar
 * os últimos dias toda vez que o computador liga.
 */
export async function sincronizar(db, cliente, { dias = 30, agora = () => new Date() } = {}) {
  const inicio = new Date().toISOString();
  const run = db.prepare("INSERT INTO sync_runs (platform, started_at) VALUES ('meta', ?)").run(inicio);
  const runId = run.lastInsertRowid;
  let linhas = 0;
  try {
    const contaExterna = cliente.contaId();
    if (!contaExterna) throw erro('Conta de anúncios não configurada.', 409);
    db.prepare(`INSERT INTO ad_accounts (platform, external_id, name) VALUES ('meta', ?, ?)
      ON CONFLICT(platform, external_id) DO UPDATE SET name = excluded.name`).run(contaExterna, cliente.status().nome || '');
    const conta = db.prepare("SELECT * FROM ad_accounts WHERE platform = 'meta' AND external_id = ?").get(contaExterna);

    const at = new Date().toISOString();
    for (const c of await cliente.listarCampanhas()) {
      db.prepare(`INSERT INTO campaigns (ad_account_id, external_id, name, objective, status, daily_budget_cents, first_seen, last_seen, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_id) DO UPDATE SET name = excluded.name, objective = excluded.objective,
          status = excluded.status, daily_budget_cents = excluded.daily_budget_cents,
          last_seen = excluded.last_seen, raw_json = excluded.raw_json`)
        .run(conta.id, String(c.id), c.name || '', c.objective || '', c.effective_status || c.status || '',
          c.daily_budget ? Math.round(Number(c.daily_budget)) : null, at, at, JSON.stringify(c));
      linhas += 1;
    }

    const fim = agora();
    const comeco = new Date(fim.getTime() - (dias - 1) * 86400000);
    const porExterno = new Map(db.prepare('SELECT id, external_id FROM campaigns').all().map(r => [r.external_id, r.id]));
    for (const i of await cliente.insights(comeco, fim)) {
      const campanhaId = porExterno.get(String(i.campaign_id));
      if (!campanhaId) continue;            // insight de campanha que não veio na listagem
      db.prepare(`INSERT INTO daily_metrics (campaign_id, date, spend_cents, impressions, clicks, platform_leads, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(campaign_id, date) DO UPDATE SET spend_cents = excluded.spend_cents,
          impressions = excluded.impressions, clicks = excluded.clicks,
          platform_leads = excluded.platform_leads, raw_json = excluded.raw_json`)
        .run(campanhaId, dia(i.date_start), centavos(i.spend), Number(i.impressions) || 0,
          Number(i.clicks) || 0, leadsDaPlataforma(i), JSON.stringify(i));
      linhas += 1;
    }

    db.prepare('UPDATE sync_runs SET finished_at = ?, ok = 1, rows_upserted = ?, message = ? WHERE id = ?')
      .run(new Date().toISOString(), linhas, `${dias} dias`, runId);
    registrar(db, 'meta.sincronizado', 'sync_run', runId, { linhas });
    return { ok: true, linhas };
  } catch (error) {
    db.prepare('UPDATE sync_runs SET finished_at = ?, ok = 0, rows_upserted = ?, message = ? WHERE id = ?')
      .run(new Date().toISOString(), linhas, String(error.message).slice(0, 300), runId);
    throw error;
  }
}
