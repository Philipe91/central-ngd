// Funil comercial da NGD: o lado "verdade da casa" do módulo Mídia Paga.
//
// Importado por: lib/ads/routes.mjs (e pelos testes). API pública: ESTAGIOS, ROTULOS,
// proximoRefCode, criarCampanhaManual, gerarLinks, listarCampanhas, criarLead, obterLead,
// moverEstagio, removerLead, listarLeads, duasVerdades.
// Tabelas: leads (stage, quoted_cents/won_cents em centavos inteiros, datas ISO como
// "2026-01-02T15:04:05.000Z"), lead_events, campaigns (ref_code tipo "MP-001"), ad_accounts.
//
// Cada campanha ganha um código curto. Esse código entra no link do site e na mensagem
// pronta do WhatsApp; quando o lead chega, quem atende registra o código e o sistema sabe
// de qual anúncio veio. Não depende de Pixel nem de cookie.
import { registrar } from './db.mjs';

export const ESTAGIOS = ['lead', 'contato', 'qualificado', 'orcamento', 'proposta', 'venda', 'perdido'];
export const ROTULOS = { lead: 'Novo lead', contato: 'Contato iniciado', qualificado: 'Qualificado', orcamento: 'Orçamento pedido', proposta: 'Proposta enviada', venda: 'Venda', perdido: 'Perdido' };
const FECHADOS = new Set(['venda', 'perdido']);

const agora = () => new Date().toISOString();
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const erro = (m, status = 400) => Object.assign(new Error(m), { status });

function centavos(valor) {
  if (valor === '' || valor == null) return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw erro('Valor inválido.');
  return Math.round(n * 100);
}

/** Próximo código livre no formato MP-001. */
export function proximoRefCode(db) {
  const usados = db.prepare("SELECT ref_code FROM campaigns WHERE ref_code LIKE 'MP-%'").all()
    .map(r => Number(String(r.ref_code).slice(3))).filter(Number.isFinite);
  const n = (usados.length ? Math.max(...usados) : 0) + 1;
  return 'MP-' + String(n).padStart(3, '0');
}

/**
 * Campanha criada à mão, para o funil funcionar antes de conectar a Meta.
 * Fica numa conta local (platform 'manual') e nunca é confundida com a da plataforma.
 */
export function criarCampanhaManual(db, dados) {
  const name = texto(dados.name, 120);
  if (!name) throw erro('Dê um nome para a campanha.');
  let conta = db.prepare("SELECT * FROM ad_accounts WHERE platform = 'manual'").get();
  if (!conta) {
    db.prepare("INSERT INTO ad_accounts (platform, external_id, name) VALUES ('manual', 'local', 'Campanhas registradas à mão')").run();
    conta = db.prepare("SELECT * FROM ad_accounts WHERE platform = 'manual'").get();
  }
  const ref = proximoRefCode(db);
  const at = agora();
  const r = db.prepare(`INSERT INTO campaigns (ad_account_id, external_id, name, objective, status, ref_code, first_seen, last_seen)
    VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)`).run(conta.id, 'manual:' + ref, name, texto(dados.objective, 60), ref, at, at);
  registrar(db, 'campanha.manual', 'campaign', r.lastInsertRowid, { ref, name });
  return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(r.lastInsertRowid);
}

/** Links prontos para colar no anúncio: site com UTMs e WhatsApp com a mensagem marcada. */
export function gerarLinks(campanha, { site = '', whatsapp = '', plataforma = 'meta' } = {}) {
  const ref = campanha.ref_code;
  let linkSite = '';
  if (site) {
    try {
      const url = new URL(site);
      url.searchParams.set('utm_source', plataforma);
      url.searchParams.set('utm_medium', 'paid');
      url.searchParams.set('utm_campaign', ref);
      url.searchParams.set('ngd_ref', ref);
      linkSite = url.toString();
    } catch { linkSite = ''; }
  }
  // O wa.me exige o número internacional. Telefone brasileiro digitado sem o 55
  // (10 dígitos com fixo, 11 com celular) recebe o código do país aqui.
  let numero = String(whatsapp || '').replace(/\D/g, '');
  if (numero.length === 10 || numero.length === 11) numero = '55' + numero;
  const mensagem = `Olá! Vim pelo anúncio e quero um orçamento. [ref ${ref}]`;
  return { ref, site: linkSite, whatsapp: numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}` : '', mensagem };
}

export function listarCampanhas(db) {
  return db.prepare(`SELECT c.*, a.platform,
      (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id) AS leads,
      (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.stage = 'venda') AS vendas,
      (SELECT COALESCE(SUM(l.won_cents), 0) FROM leads l WHERE l.campaign_id = c.id AND l.stage = 'venda') AS receita_cents,
      (SELECT COALESCE(SUM(m.spend_cents), 0) FROM daily_metrics m WHERE m.campaign_id = c.id) AS gasto_cents,
      (SELECT COALESCE(SUM(m.platform_leads), 0) FROM daily_metrics m WHERE m.campaign_id = c.id) AS leads_plataforma
    FROM campaigns c JOIN ad_accounts a ON a.id = c.ad_account_id
    ORDER BY c.last_seen DESC`).all();
}

export function criarLead(db, dados) {
  const ref = texto(dados.ref_code, 20).toUpperCase();
  let campanha = null;
  if (ref) {
    campanha = db.prepare('SELECT * FROM campaigns WHERE ref_code = ?').get(ref);
    if (!campanha) throw erro(`Não existe campanha com o código ${ref}.`);
  }
  const at = agora();
  const r = db.prepare(`INSERT INTO leads (created_at, campaign_id, ref_code, source, contact_name, contact_phone, stage, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'lead', ?)`)
    .run(at, campanha?.id ?? null, ref || null, texto(dados.source, 20) || 'whatsapp',
      texto(dados.contact_name, 120), texto(dados.contact_phone, 40), texto(dados.notes, 600));
  db.prepare('INSERT INTO lead_events (lead_id, at, from_stage, to_stage, note) VALUES (?, ?, NULL, ?, ?)')
    .run(r.lastInsertRowid, at, 'lead', 'Lead registrado');
  registrar(db, 'lead.criado', 'lead', r.lastInsertRowid, { ref: ref || null });
  return obterLead(db, r.lastInsertRowid);
}

export function obterLead(db, id) {
  const l = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(id));
  if (!l) throw erro('Lead não encontrado.', 404);
  l.events = db.prepare('SELECT * FROM lead_events WHERE lead_id = ? ORDER BY id').all(l.id);
  return l;
}

/** Muda o estágio e guarda o histórico. Venda exige valor; perdido limpa o valor ganho. */
export function moverEstagio(db, id, { stage, value, note } = {}) {
  const lead = obterLead(db, id);
  if (!ESTAGIOS.includes(stage)) throw erro('Estágio inválido.');
  if (stage === lead.stage) return lead;
  const valor = centavos(value);
  if (stage === 'venda' && !valor) throw erro('Informe o valor da venda.');

  const at = agora();
  db.prepare('UPDATE leads SET stage = ?, quoted_cents = ?, won_cents = ?, closed_at = ? WHERE id = ?')
    .run(stage,
      ['orcamento', 'proposta'].includes(stage) ? (valor ?? lead.quoted_cents) : lead.quoted_cents,
      stage === 'venda' ? valor : (stage === 'perdido' ? null : lead.won_cents),
      FECHADOS.has(stage) ? at : null, lead.id);
  db.prepare('INSERT INTO lead_events (lead_id, at, from_stage, to_stage, note) VALUES (?, ?, ?, ?, ?)')
    .run(lead.id, at, lead.stage, stage, texto(note, 300));
  registrar(db, 'lead.estagio', 'lead', lead.id, { de: lead.stage, para: stage });
  return obterLead(db, lead.id);
}

export function removerLead(db, id) {
  const l = obterLead(db, id);
  db.prepare('DELETE FROM leads WHERE id = ?').run(l.id);
  registrar(db, 'lead.removido', 'lead', l.id);   // sem dado pessoal no registro
  return { removed: l.id };
}

export function listarLeads(db, { limite = 200 } = {}) {
  return db.prepare(`SELECT l.*, c.name AS campanha FROM leads l
    LEFT JOIN campaigns c ON c.id = l.campaign_id ORDER BY l.id DESC LIMIT ?`).all(Number(limite) || 200);
}

/**
 * As duas verdades lado a lado: o que a plataforma diz e o que a NGD observou.
 * Nunca somadas, porque contam coisas diferentes.
 */
export function duasVerdades(db) {
  const plataforma = db.prepare(`SELECT COALESCE(SUM(spend_cents),0) AS gasto, COALESCE(SUM(impressions),0) AS impressoes,
      COALESCE(SUM(clicks),0) AS cliques, COALESCE(SUM(platform_leads),0) AS leads FROM daily_metrics`).get();
  const porEstagio = Object.fromEntries(ESTAGIOS.map(e => [e, 0]));
  for (const r of db.prepare('SELECT stage, COUNT(*) AS n FROM leads GROUP BY stage').all()) porEstagio[r.stage] = r.n;
  const receita = db.prepare("SELECT COALESCE(SUM(won_cents),0) AS n FROM leads WHERE stage = 'venda'").get().n;
  const leadsNgd = db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;
  const qualificados = ['qualificado', 'orcamento', 'proposta', 'venda'].reduce((t, e) => t + porEstagio[e], 0);
  // Sem gasto registrado nenhum custo é calculável: devolver 0 faria parecer que o
  // cliente saiu de graça. Nesses casos vai null e a tela mostra um traço.
  const semGasto = plataforma.gasto === 0;
  const divisao = (a, b) => (!semGasto && b > 0 ? Math.round(a / b) : null);
  return {
    plataforma,
    ngd: { leads: leadsNgd, qualificados, vendas: porEstagio.venda, receita_cents: receita, porEstagio },
    custos: {
      cpl_plataforma: divisao(plataforma.gasto, plataforma.leads),
      cpl_ngd: divisao(plataforma.gasto, leadsNgd),
      cpql_ngd: divisao(plataforma.gasto, qualificados),
      cac: divisao(plataforma.gasto, porEstagio.venda),
      roas: semGasto ? null : receita / plataforma.gasto,
    },
  };
}
