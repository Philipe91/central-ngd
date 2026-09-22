// Dados de demonstração do módulo Mídia Paga.
//
// Chamado à mão: `node automation/ads-demo.mjs`. Não é importado por nenhum arquivo e
// não exporta nada. Nada aqui fala com plataforma: é tudo escrito direto no banco local.
// Tabelas gravadas em data/ads.sqlite: products (sku, price_cents inteiro), campaigns
// (ref_code "MP-101"), daily_metrics (campanha + dia "2026-01-02", spend_cents inteiro),
// leads e lead_events.
//
// Uso:  node automation/ads-demo.mjs            insere os dados de exemplo
//       node automation/ads-demo.mjs --limpar   remove só o que este script criou
//
// Segurança: tudo que ele cria leva a marca DEMO (sku começa com DEMO-, campanha com
// external_id demo:, lead com notes começando em [demo]). A limpeza apaga só isso,
// então dados reais nunca são tocados.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/ads/db.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.NGD_DATA_DIR || path.join(raiz, 'data');
const db = openDb(path.join(dataDir, 'ads.sqlite'));
const limpar = process.argv.includes('--limpar');

const hoje = new Date();
const diaISO = d => d.toISOString().slice(0, 10);
const agora = () => new Date().toISOString();
const menosDias = n => new Date(hoje.getTime() - n * 86400000);
// Sorteio previsível: rodar duas vezes gera os mesmos números, então a tela não "dança".
let semente = 20260922;
const sorteio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const entre = (a, b) => Math.round(a + sorteio() * (b - a));

if (limpar) {
  const p = db.prepare("DELETE FROM products WHERE sku LIKE 'DEMO-%'").run();
  const l = db.prepare("DELETE FROM leads WHERE notes LIKE '[demo]%'").run();
  const c = db.prepare("DELETE FROM campaigns WHERE external_id LIKE 'demo:%'").run();
  db.exec("DELETE FROM ad_accounts WHERE external_id = 'act_demo'");
  console.log(`Removidos: ${p.changes} produtos, ${c.changes} campanhas, ${l.changes} leads de demonstração.`);
  db.close();
  process.exit(0);
}

const PRODUTOS = [
  ['Display de chão em poliondas', 'PDV', 38000, 'Display resistente para ponto de venda, impressão digital e montagem rápida.'],
  ['Totem promocional 2m', 'PDV', 52000, 'Totem em PS com impressão UV, ideal para lançamento de produto.'],
  ['Backdrop para evento 3x2', 'Eventos', 74000, 'Painel de fundo para fotos e coletivas, tecido ou lona com estrutura.'],
  ['Rollup banner 80x200', 'Eventos', 18000, 'Porta-banner retrátil com bolsa de transporte.'],
  ['Placa de campo agro', 'Agro', 29000, 'Chapa galvanizada com impressão resistente a sol e chuva.'],
  ['Cubo promocional', 'PDV', 21000, 'Cubo em papelão estrutural para ativação em loja.'],
];

const CAMPANHAS = [
  ['PDV para varejo', 'MP-101', 'LEAD_GENERATION', 5000],
  ['Eventos e feiras', 'MP-102', 'LEAD_GENERATION', 4000],
  ['Agro sinalização', 'MP-103', 'LINK_CLICKS', 3000],
];

const NOMES = ['Marcos Vieira', 'Paula Andrade', 'Rede Bom Preço', 'Agência Ponto', 'Fazenda Sete Lagoas', 'Camila Prado', 'Distribuidora Sul', 'Eduardo Lima', 'Supermercados Kiru', 'Studio Rosa', 'Construtora Aval', 'Feira Brasil Agro'];
const ESTAGIOS = [['lead', 4], ['contato', 2], ['qualificado', 2], ['orcamento', 2], ['proposta', 1], ['venda', 3], ['perdido', 2]];

db.exec('BEGIN');
try {
  const inserirProduto = db.prepare(`INSERT INTO products (sku, name, category, description, price_cents, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ativo', ?, ?) ON CONFLICT(sku) DO NOTHING`);
  for (const [nome, categoria, preco, descricao] of PRODUTOS) {
    const sku = 'DEMO-' + nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30);
    inserirProduto.run(sku, nome, categoria, descricao, preco, agora(), agora());
  }

  db.prepare(`INSERT INTO ad_accounts (platform, external_id, name) VALUES ('meta', 'act_demo', 'Conta de demonstração')
    ON CONFLICT(platform, external_id) DO NOTHING`).run();
  const conta = db.prepare("SELECT * FROM ad_accounts WHERE external_id = 'act_demo'").get();
  const inserirCampanha = db.prepare(`INSERT INTO campaigns (ad_account_id, external_id, name, objective, status, daily_budget_cents, ref_code, first_seen, last_seen)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?) ON CONFLICT(external_id) DO NOTHING`);
  for (const [nome, ref, objetivo, orcamento] of CAMPANHAS) {
    inserirCampanha.run(conta.id, 'demo:' + ref, nome, objetivo, orcamento, ref, diaISO(menosDias(29)), agora());
  }
  const campanhas = db.prepare("SELECT * FROM campaigns WHERE external_id LIKE 'demo:%' ORDER BY id").all();

  const inserirMetrica = db.prepare(`INSERT INTO daily_metrics (campaign_id, date, spend_cents, impressions, clicks, platform_leads)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(campaign_id, date) DO UPDATE SET spend_cents = excluded.spend_cents,
      impressions = excluded.impressions, clicks = excluded.clicks, platform_leads = excluded.platform_leads`);
  for (const c of campanhas) {
    for (let d = 29; d >= 0; d -= 1) {
      inserirMetrica.run(c.id, diaISO(menosDias(d)), entre(1800, 5200), entre(900, 4200), entre(12, 90), entre(0, 3));
    }
  }

  const inserirLead = db.prepare(`INSERT INTO leads (created_at, campaign_id, ref_code, source, contact_name, contact_phone, stage, quoted_cents, won_cents, closed_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const inserirEvento = db.prepare('INSERT INTO lead_events (lead_id, at, from_stage, to_stage, note) VALUES (?, ?, ?, ?, ?)');
  let n = 0;
  for (const [estagio, quantidade] of ESTAGIOS) {
    for (let i = 0; i < quantidade; i += 1) {
      const c = campanhas[n % campanhas.length];
      const criado = menosDias(entre(1, 25)).toISOString();
      const orcado = ['orcamento', 'proposta', 'venda'].includes(estagio) ? entre(150000, 900000) : null;
      const ganho = estagio === 'venda' ? Math.round(orcado * 0.92) : null;
      const r = inserirLead.run(criado, c.id, c.ref_code, ['whatsapp', 'whatsapp', 'site'][n % 3],
        NOMES[n % NOMES.length], '(61) 9' + entre(1000, 9999) + '-' + entre(1000, 9999),
        estagio, orcado, ganho, ['venda', 'perdido'].includes(estagio) ? agora() : null,
        '[demo] cadastro de demonstração');
      inserirEvento.run(r.lastInsertRowid, criado, null, 'lead', 'Lead registrado');
      if (estagio !== 'lead') inserirEvento.run(r.lastInsertRowid, agora(), 'lead', estagio, 'Mudança de demonstração');
      n += 1;
    }
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

const contar = sql => db.prepare(sql).get().n;
console.log('Dados de demonstração inseridos.');
console.log(`  produtos: ${contar("SELECT COUNT(*) AS n FROM products WHERE sku LIKE 'DEMO-%'")}`);
console.log(`  campanhas: ${contar("SELECT COUNT(*) AS n FROM campaigns WHERE external_id LIKE 'demo:%'")}`);
console.log(`  dias de métrica: ${contar('SELECT COUNT(*) AS n FROM daily_metrics')}`);
console.log(`  leads: ${contar("SELECT COUNT(*) AS n FROM leads WHERE notes LIKE '[demo]%'")}`);
console.log('Para remover tudo isso: node automation/ads-demo.mjs --limpar');
db.close();
