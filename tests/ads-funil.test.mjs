// Testes da Etapa 2: funil comercial e leitura da Meta.
// Chamado por: package.json (script test). Não exporta nada e não é importado.
// Não usa rede: o cliente da Meta recebe um fetch falso. Banco em memória e pasta
// temporária do sistema; nada em data/. Campos exercitados: campaigns.ref_code ("MP-001"),
// leads.stage com quoted_cents/won_cents em centavos, daily_metrics por (campanha, "2026-01-02").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../lib/ads/db.mjs';
import * as funil from '../lib/ads/funnel.mjs';
import { criarClienteMeta, sincronizar } from '../lib/ads/meta.mjs';

const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-funil-'));
const segredos = path.join(temporario, 'ads-secrets.json');
const resposta = corpo => ({ ok: true, status: 200, json: async () => corpo });

test('funil: código de referência, links prontos e passagem por estágios', () => {
  const db = openDb(':memory:');
  const c1 = funil.criarCampanhaManual(db, { name: 'PDV setembro' });
  const c2 = funil.criarCampanhaManual(db, { name: 'Eventos setembro' });
  assert.equal(c1.ref_code, 'MP-001');
  assert.equal(c2.ref_code, 'MP-002');
  assert.throws(() => funil.criarCampanhaManual(db, { name: '' }), /nome/i);

  const links = funil.gerarLinks(c1, { site: 'https://nucleografico.com.br/loja/', whatsapp: '(61) 99649-0102' });
  assert.match(links.site, /utm_source=meta&utm_medium=paid&utm_campaign=MP-001/);
  assert.match(links.site, /ngd_ref=MP-001/);
  assert.match(links.whatsapp, /^https:\/\/wa\.me\/5561996490102\?text=/);
  assert.match(decodeURIComponent(links.whatsapp), /\[ref MP-001\]/);

  // Lead com código inexistente é recusado: melhor errar do que atribuir errado.
  assert.throws(() => funil.criarLead(db, { ref_code: 'MP-999' }), /não existe campanha/i);

  const lead = funil.criarLead(db, { ref_code: 'mp-001', contact_name: 'Cliente Teste', contact_phone: '61999990000' });
  assert.equal(lead.campaign_id, c1.id);
  assert.equal(lead.stage, 'lead');
  assert.equal(lead.events.length, 1);

  assert.throws(() => funil.moverEstagio(db, lead.id, { stage: 'inventado' }), /inválido/i);
  // Fechar não exige valor: o anúncio é medido por lead e orçamento, não por venda.
  assert.equal(funil.ROTULOS.venda, 'Fechado');

  funil.moverEstagio(db, lead.id, { stage: 'qualificado', note: 'quer 200 displays' });
  const orcado = funil.moverEstagio(db, lead.id, { stage: 'orcamento', value: '4.500,00' });
  assert.equal(orcado.quoted_cents, 450000, 'o valor orçado continua guardado no banco');
  const fechado = funil.moverEstagio(db, lead.id, { stage: 'venda' });
  assert.ok(fechado.closed_at, 'fechamento tem de registrar a data');
  assert.equal(fechado.events.length, 4);   // registro + três mudanças

  const v = funil.duasVerdades(db);
  assert.equal(v.ngd.leads, 1);
  assert.equal(v.ngd.qualificados, 1);
  assert.equal(v.ngd.orcamentos, 1);
  assert.equal(v.ngd.propostas, 1, 'quem fechou passou pela proposta, mesmo sem o clique da etapa');
  assert.equal(v.plataforma.gasto, 0);
  assert.equal(v.custos.cpo_ngd, null, 'sem gasto não existe custo por orçamento');
  assert.equal(v.ngd.receita_cents, undefined, 'receita não é exposta no MVP');

  // A campanha passa a ser lida por qualificação, não por venda.
  const campanha = funil.listarCampanhas(db).find(c => c.ref_code === 'MP-001');
  assert.equal(campanha.qualificados, 1);
  assert.equal(campanha.orcamentos, 1);
  assert.equal(campanha.vendas, undefined);
  db.close();
});

test('Meta: sincronização idempotente, sem duplicar, e falha registrada', async () => {
  fs.writeFileSync(segredos, JSON.stringify({ meta: { accessToken: 'token-de-teste-1234567890', adAccountId: 'act_999' } }));
  let falhar = false;
  const fetchFalso = async url => {
    const u = new URL(url);
    if (falhar) return { ok: false, status: 400, json: async () => ({ error: { message: 'token expirado', code: 190 } }) };
    if (u.pathname.endsWith('/campaigns')) {
      return resposta({ data: [{ id: '1001', name: 'PDV', objective: 'LEAD_GENERATION', effective_status: 'ACTIVE', daily_budget: 3000 }] });
    }
    if (u.pathname.endsWith('/insights')) {
      return resposta({ data: [
        { campaign_id: '1001', spend: '12.34', impressions: '1000', clicks: '25', date_start: '2026-01-02', actions: [{ action_type: 'lead', value: '2' }, { action_type: 'link_click', value: '25' }] },
        { campaign_id: '9999', spend: '5.00', impressions: '10', clicks: '1', date_start: '2026-01-02', actions: [] },
      ] });
    }
    return resposta({ id: 'act_999', name: 'Conta NGD', currency: 'BRL' });
  };

  const db = openDb(':memory:');
  const cliente = criarClienteMeta({ file: segredos, fetch: fetchFalso, baseUrl: 'https://exemplo.invalido/v21.0' });
  assert.equal(cliente.status().configurado, true);
  assert.equal(cliente.status().token, 'toke…7890', 'token nunca sai inteiro');

  assert.deepEqual(await cliente.testar(), { conectado: true, nome: 'Conta NGD', moeda: 'BRL' });

  const agora = () => new Date('2026-01-03T12:00:00Z');
  await sincronizar(db, cliente, { dias: 7, agora });
  await sincronizar(db, cliente, { dias: 7, agora });   // de novo: não pode duplicar

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaigns').get().n, 1);
  const metricas = db.prepare('SELECT * FROM daily_metrics').all();
  assert.equal(metricas.length, 1, 'insight de campanha desconhecida é descartado');
  assert.equal(metricas[0].spend_cents, 1234, 'gasto em centavos inteiros');
  assert.equal(metricas[0].platform_leads, 2, 'só as ações de lead entram');
  assert.equal(metricas[0].date, '2026-01-02');

  // Somente leitura: o cliente da Meta não pode conter outro método HTTP.
  const codigo = fs.readFileSync(new URL('../lib/ads/meta.mjs', import.meta.url), 'utf8');
  for (const proibido of ["method: 'POST'", "method: 'DELETE'", "method: 'PUT'"]) {
    assert.ok(!codigo.includes(proibido), 'o cliente da Meta não pode ter ' + proibido);
  }

  // Falha não apaga o que já existia e fica registrada.
  falhar = true;
  await assert.rejects(() => sincronizar(db, cliente, { dias: 7, agora }), /token expirado/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_metrics').get().n, 1);
  const runs = db.prepare('SELECT ok, message FROM sync_runs ORDER BY id').all();
  assert.deepEqual(runs.map(r => r.ok), [1, 1, 0]);
  assert.match(runs.at(-1).message, /token expirado/);

  db.close();
  fs.rmSync(temporario, { recursive: true, force: true });
});

test('duas verdades: números da plataforma e da NGD não se misturam', () => {
  const db = openDb(':memory:');
  const c = funil.criarCampanhaManual(db, { name: 'Teste' });
  db.prepare('INSERT INTO daily_metrics (campaign_id, date, spend_cents, platform_leads) VALUES (?, ?, ?, ?)').run(c.id, '2026-01-02', 20000, 8);
  const l1 = funil.criarLead(db, { ref_code: c.ref_code });
  funil.criarLead(db, { ref_code: c.ref_code });
  funil.moverEstagio(db, l1.id, { stage: 'qualificado' });

  const v = funil.duasVerdades(db);
  assert.equal(v.plataforma.leads, 8, 'a plataforma diz 8');
  assert.equal(v.ngd.leads, 2, 'a NGD observou 2');
  assert.equal(v.ngd.qualificados, 1);
  assert.equal(v.custos.cpl_plataforma, 2500);   // R$ 25,00
  assert.equal(v.custos.cpl_ngd, 10000);         // R$ 100,00
  assert.equal(v.custos.cpql_ngd, 20000);        // R$ 200,00
  assert.equal(v.ngd.orcamentos, 0, 'ninguém pediu orçamento ainda');
  assert.equal(v.custos.cpo_ngd, null, 'gastou e ninguém pediu orçamento: custo indefinido, não zero');

  // Quem avança continua contado nas etapas por onde passou.
  funil.moverEstagio(db, l1.id, { stage: 'orcamento' });
  const depois = funil.duasVerdades(db);
  assert.equal(depois.ngd.qualificados, 1, 'virou orçamento e segue contando como qualificado');
  assert.equal(depois.ngd.orcamentos, 1);
  assert.equal(depois.custos.cpo_ngd, 20000);
  db.close();
});
