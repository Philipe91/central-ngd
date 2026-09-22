// Testes da aba Dashboard do módulo Mídia Paga. Executados por `npm test`.
// Chamado por: package.json (script test, padrão tests/*.test.mjs). Não exporta nada.
// Usa banco em memória e pasta temporária do sistema; não toca em data/ nem em plataforma
// de anúncio. Campos exercitados: daily_metrics (campaign_id + date "2026-01-10",
// spend_cents e platform_leads inteiros), leads (created_at ISO) e lead_events (at, to_stage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../lib/ads/db.mjs';
import * as painel from '../lib/ads/dashboard.mjs';
import { criarRotasAds } from '../lib/ads/routes.mjs';

// 31 de janeiro fixo: assim "últimos 30 dias" é sempre 02/01 a 31/01 e o teste não muda de
// resultado conforme o dia em que roda.
const AGORA = new Date('2026-01-31T12:00:00.000Z');
const opcoes = extra => ({ agora: AGORA, ...extra });

/* Cenário desenhado à mão, com uma armadilha de cada tipo:
   A (MP-001): 3 leads no período, um chegou a orçamento, um parou em qualificado, um só entrou
   B (MP-002): 1 lead no período, percorreu o funil inteiro até Fechado
   C (MP-003): gastou dinheiro e não trouxe lead nenhum, para o custo cair em null
   Fora do período: um gasto de dezembro e um lead de dezembro, que não podem aparecer. */
function semear() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO ad_accounts (platform, external_id, name) VALUES ('meta', 'act_1', 'Conta')").run();
  const criarCampanha = (ext, ref, nome) => {
    db.prepare(`INSERT INTO campaigns (ad_account_id, external_id, name, status, ref_code, first_seen, last_seen)
      VALUES (1, ?, ?, 'ACTIVE', ?, '2026-01-01', '2026-01-31')`).run(ext, nome, ref);
    return db.prepare('SELECT id FROM campaigns WHERE external_id = ?').get(ext).id;
  };
  const a = criarCampanha('c-a', 'MP-001', 'PDV');
  const b = criarCampanha('c-b', 'MP-002', 'Eventos');
  const c = criarCampanha('c-c', 'MP-003', 'Agro');

  const gasto = db.prepare('INSERT INTO daily_metrics (campaign_id, date, spend_cents, impressions, clicks, platform_leads) VALUES (?, ?, ?, ?, ?, ?)');
  gasto.run(a, '2026-01-10', 100000, 5000, 200, 40);
  gasto.run(b, '2026-01-10', 50000, 2000, 90, 10);
  gasto.run(c, '2026-01-10', 30000, 1000, 40, 0);
  gasto.run(a, '2025-12-01', 999999, 9999, 999, 999);   // fora do período: não pode entrar em nada

  const criarLead = (campanha, criado, caminho) => {
    const r = db.prepare("INSERT INTO leads (created_at, campaign_id, stage, notes) VALUES (?, ?, ?, '')")
      .run(criado, campanha, caminho.at(-1)?.[0] || 'lead');
    const evento = db.prepare("INSERT INTO lead_events (lead_id, at, from_stage, to_stage, note) VALUES (?, ?, ?, ?, '')");
    evento.run(r.lastInsertRowid, criado, null, 'lead');
    let anterior = 'lead';
    for (const [etapa, quando] of caminho) { evento.run(r.lastInsertRowid, quando, anterior, etapa); anterior = etapa; }
  };
  criarLead(a, '2026-01-05T09:00:00.000Z', [['contato', '2026-01-06T09:00:00.000Z'], ['qualificado', '2026-01-07T09:00:00.000Z'], ['orcamento', '2026-01-09T09:00:00.000Z']]);
  criarLead(a, '2026-01-05T10:00:00.000Z', [['contato', '2026-01-06T10:00:00.000Z'], ['qualificado', '2026-01-08T10:00:00.000Z']]);
  criarLead(a, '2026-01-05T11:00:00.000Z', []);
  criarLead(b, '2026-01-06T09:00:00.000Z', [['contato', '2026-01-07T09:00:00.000Z'], ['qualificado', '2026-01-08T09:00:00.000Z'],
    ['orcamento', '2026-01-09T09:00:00.000Z'], ['proposta', '2026-01-10T09:00:00.000Z'], ['venda', '2026-01-12T09:00:00.000Z']]);
  criarLead(a, '2025-12-20T09:00:00.000Z', [['qualificado', '2025-12-21T09:00:00.000Z']]);
  return { db, a, b, c };
}

test('dashboard: o período soma só o que caiu dentro dele', () => {
  const { db } = semear();
  const d = painel.resumo(db, opcoes());
  assert.equal(d.periodo.desde, '2026-01-02');
  assert.equal(d.periodo.ate, '2026-01-31');
  assert.equal(d.periodo.rotulo, 'Últimos 30 dias');
  assert.equal(d.indicadores.investido_cents, 180000, 'o gasto de dezembro não pode entrar');
  assert.equal(d.indicadores.leads, 4, 'o lead de dezembro não pode entrar');

  // Período curto: nada aconteceu nos últimos 7 dias desse cenário.
  const curto = painel.resumo(db, opcoes({ periodo: '7' }));
  assert.equal(curto.periodo.desde, '2026-01-25');
  assert.equal(curto.indicadores.leads, 0);
  assert.equal(curto.indicadores.investido_cents, 0);

  // Intervalo escolhido a dedo, fechado nas duas pontas.
  const escolhido = painel.resumo(db, opcoes({ periodo: 'personalizado', desde: '2026-01-05', ate: '2026-01-05' }));
  assert.equal(escolhido.indicadores.leads, 3, 'só os três leads nascidos no dia 5');
  assert.equal(escolhido.periodo.rotulo, 'Período escolhido');

  // Datas invertidas viram intervalo válido, em vez de tela vazia sem explicação.
  const invertido = painel.resumo(db, opcoes({ periodo: 'personalizado', desde: '2026-01-10', ate: '2026-01-05' }));
  assert.equal(invertido.periodo.desde, '2026-01-05');
  assert.equal(invertido.periodo.ate, '2026-01-10');

  // "Tudo" alcança o que ficou para trás.
  const tudo = painel.resumo(db, opcoes({ periodo: 'tudo' }));
  assert.equal(tudo.periodo.desde, '2025-12-01');
  assert.equal(tudo.indicadores.leads, 5);
  db.close();
});

test('dashboard: o filtro de campanha isola uma campanha e ignora código inexistente', () => {
  const { db, a, b } = semear();
  const soA = painel.resumo(db, opcoes({ campanha: a }));
  assert.equal(soA.campanha, a);
  assert.equal(soA.indicadores.leads, 3);
  assert.equal(soA.indicadores.qualificados, 2);
  assert.equal(soA.indicadores.orcamentos, 1);
  assert.equal(soA.indicadores.investido_cents, 100000, 'só o gasto de janeiro da campanha A');
  assert.equal(soA.campanhas.length, 1);

  const soB = painel.resumo(db, opcoes({ campanha: b }));
  assert.equal(soB.indicadores.leads, 1);
  assert.equal(soB.funil.find(e => e.stage === 'venda').n, 1);

  // Campanha que não existe volta a mostrar o geral, em vez de uma tela vazia mentirosa.
  const inventada = painel.resumo(db, opcoes({ campanha: 9999 }));
  assert.equal(inventada.campanha, null);
  assert.equal(inventada.indicadores.leads, 4);
  db.close();
});

test('dashboard: a série diária tem um ponto por dia, e dia parado vale zero', () => {
  const { db } = semear();
  const { serie } = painel.resumo(db, opcoes());
  assert.equal(serie.dias.length, 30, 'trinta dias, sem buraco');
  assert.equal(serie.dias[0], '2026-01-02');
  assert.equal(serie.dias.at(-1), '2026-01-31');
  for (const chave of ['leads', 'qualificados', 'orcamentos']) {
    assert.equal(serie[chave].length, 30);
    assert.ok(serie[chave].every(v => typeof v === 'number'), chave + ' tem de ser número em todo dia');
  }
  const em = dia => serie.dias.indexOf(dia);
  assert.equal(serie.leads[em('2026-01-05')], 3, 'três leads entraram no dia 5');
  assert.equal(serie.leads[em('2026-01-20')], 0, 'dia sem nada vale zero e continua no gráfico');
  // A série usa a data do evento, não a do nascimento do lead.
  assert.equal(serie.qualificados[em('2026-01-07')], 1);
  assert.equal(serie.qualificados[em('2026-01-08')], 2);
  assert.equal(serie.orcamentos[em('2026-01-09')], 2);
  // Quem passou por qualificado e depois por orçamento conta uma vez só na linha de
  // qualificados, no dia da primeira vez.
  assert.equal(serie.qualificados.reduce((x, y) => x + y, 0), 3);
  db.close();
});

test('dashboard: o funil conta as etapas percorridas, não só onde o lead parou', () => {
  const { db } = semear();
  const { funil } = painel.resumo(db, opcoes());
  const n = etapa => funil.find(e => e.stage === etapa).n;
  assert.deepEqual(funil.map(e => e.stage), ['lead', 'contato', 'qualificado', 'orcamento', 'proposta', 'venda']);
  assert.equal(n('lead'), 4);
  assert.equal(n('contato'), 3, 'quem chegou a qualificado passou pelo contato');
  assert.equal(n('qualificado'), 3);
  assert.equal(n('orcamento'), 2);
  assert.equal(n('proposta'), 1);
  assert.equal(n('venda'), 1);
  assert.ok(funil.every((e, i) => i === 0 || e.n <= funil[i - 1].n), 'o funil nunca pode alargar para baixo');

  const orcamento = funil.find(e => e.stage === 'orcamento');
  assert.equal(orcamento.pctLeads, 50);
  assert.equal(orcamento.pctAnterior, 66.7, 'dois dos três qualificados pediram orçamento');
  assert.equal(funil[0].pctAnterior, null, 'a primeira etapa não tem etapa anterior');
  // Nenhum valor de venda sai daqui: o fim do funil é uma contagem.
  assert.deepEqual(Object.keys(funil[0]).sort(), ['n', 'pctAnterior', 'pctLeads', 'rotulo', 'stage']);
  db.close();
});

test('dashboard: custo por lead, por qualificado e por orçamento, e null quando não dá para dividir', () => {
  const { db, c } = semear();
  const d = painel.resumo(db, opcoes());
  assert.equal(d.indicadores.cpl, 45000, 'R$ 1.800,00 ÷ 4 leads');
  assert.equal(d.indicadores.cpql, 60000, '÷ 3 qualificados');
  assert.equal(d.indicadores.cpo, 90000, '÷ 2 orçamentos');

  // Campanha que gastou e não trouxe ninguém: custo desconhecido, que é diferente de zero.
  const soC = painel.resumo(db, opcoes({ campanha: c }));
  assert.equal(soC.indicadores.investido_cents, 30000);
  assert.equal(soC.indicadores.leads, 0);
  assert.equal(soC.indicadores.cpl, null, 'sem lead não existe custo por lead');
  assert.equal(soC.indicadores.cpql, null);
  assert.equal(soC.indicadores.cpo, null);
  assert.notEqual(soC.indicadores.cpl, 0, 'zero diria que o lead saiu de graça');

  // Sem gasto lançado também não dá para calcular, mesmo havendo lead.
  const semGasto = painel.resumo(db, opcoes({ periodo: 'personalizado', desde: '2026-01-05', ate: '2026-01-05' }));
  assert.equal(semGasto.indicadores.leads, 3);
  assert.equal(semGasto.indicadores.cpl, null);

  // Quem não tem número vai para o fim da fila, e nunca vira primeiro lugar.
  const porCusto = [...d.campanhas].sort((x, y) => (x.cpl ?? Infinity) - (y.cpl ?? Infinity));
  assert.equal(porCusto.at(-1).ref_code, 'MP-003');
  db.close();
});

test('dashboard: leads da plataforma e leads da NGD ficam em caixas separadas', () => {
  const { db } = semear();
  const d = painel.resumo(db, opcoes());
  assert.equal(d.plataforma.leads, 50, 'a plataforma atribui 50');
  assert.equal(d.indicadores.leads, 4, 'a NGD registrou 4');
  assert.equal(d.indicadores.qualificados, 3);
  // O número da plataforma não pode ter vazado para dentro do bloco da NGD.
  assert.equal(d.indicadores.leads_plataforma, undefined);
  assert.notEqual(d.indicadores.leads, d.plataforma.leads);
  // E nada de venda, receita ou retorno sobre investimento em lugar nenhum do payload.
  const texto = JSON.stringify(d);
  for (const proibido of ['receita', 'roas', 'won_cents', 'cac']) {
    assert.ok(!texto.includes(proibido), 'o payload não pode trazer ' + proibido);
  }
  db.close();
});

test('dashboard: a comparação por campanha ordena por orçamento e traz o custo de cada etapa', () => {
  const { db } = semear();
  const { campanhas } = painel.resumo(db, opcoes());
  assert.equal(campanhas.length, 3);
  // Ordem padrão: mais pedidos de orçamento primeiro, e o empate desce para os leads.
  assert.ok(campanhas.every((c, i) => i === 0 || c.orcamentos <= campanhas[i - 1].orcamentos), 'fora de ordem por orçamento');
  assert.deepEqual(campanhas.map(c => c.ref_code), ['MP-001', 'MP-002', 'MP-003']);
  assert.equal(campanhas.at(-1).orcamentos, 0, 'quem não trouxe orçamento fica por último');
  const a = campanhas.find(x => x.ref_code === 'MP-001');
  assert.equal(a.leads, 3);
  assert.equal(a.qualificados, 2);
  assert.equal(a.orcamentos, 1);
  assert.equal(a.investido_cents, 100000);
  assert.equal(a.cpl, 33333);
  assert.equal(a.cpql, 50000);
  assert.equal(a.cpo, 100000);
  // As três medidas são etapas do mesmo funil: nunca podem crescer para baixo.
  assert.ok(campanhas.every(x => x.orcamentos <= x.qualificados && x.qualificados <= x.leads));
  db.close();
});

test('dashboard: dados de demonstração são identificados como tais', () => {
  const { db } = semear();
  assert.equal(painel.resumo(db, opcoes()).demonstracao, false);
  db.prepare(`INSERT INTO campaigns (ad_account_id, external_id, name, status, ref_code, first_seen, last_seen)
    VALUES (1, 'demo:MP-101', 'Demonstração', 'ACTIVE', 'MP-101', '2026-01-01', '2026-01-31')`).run();
  assert.equal(painel.resumo(db, opcoes()).demonstracao, true, 'com dado fictício a tela precisa avisar');
  db.close();
});

test('dashboard: o endpoint só lê, e o arquivo de cálculo não sabe escrever', async t => {
  // Comentário explicando que o arquivo não escreve não pode reprovar o próprio arquivo,
  // então a varredura olha só o código de verdade.
  const codigo = fs.readFileSync(new URL('../lib/ads/dashboard.mjs', import.meta.url), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').toUpperCase();
  for (const escrita of ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ']) {
    assert.ok(!codigo.includes(escrita), 'dashboard.mjs não pode conter ' + escrita.trim());
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngd-dash-'));
  const rotas = criarRotasAds(dir);
  const app = express();
  app.use(express.json());
  app.use('/api/ads', rotas);
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  // Windows segura o arquivo do banco: sem fechar, apagar a pasta falha com EPERM.
  t.after(() => { servidor.close(); rotas.fechar(); fs.rmSync(dir, { recursive: true, force: true }); });

  const r = await fetch(base + '/api/ads/dashboard?periodo=30');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const corpo = await r.json();
  for (const campo of ['periodo', 'indicadores', 'plataforma', 'funil', 'serie', 'campanhas', 'demonstracao', 'ultimaSync']) {
    assert.ok(campo in corpo, 'falta ' + campo + ' na resposta');
  }
  assert.equal(corpo.indicadores.cpl, null, 'banco novo e vazio não inventa custo');
  assert.equal(corpo.serie.dias.length, 30);
  assert.equal(corpo.demonstracao, false);

  // Escrever nessa rota não existe: nenhum verbo além de GET responde.
  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const resposta = await fetch(base + '/api/ads/dashboard', { method: metodo });
    assert.ok(resposta.status >= 400, `${metodo} em /dashboard tinha de ser recusado, veio ${resposta.status}`);
  }
});
