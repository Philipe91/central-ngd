// Dados fictícios para a aba "Site" enquanto o robô do Google não está ligado.
// Sempre marcados com exemplo: true; a tela mostra a faixa "dados de exemplo" em cima de tudo.
// Mesmo formato de data/site.json, gerado de forma determinística a partir da data de hoje.
import { janelas, PAGINAS_PRINCIPAIS, diaSP } from './collect.mjs';

const onda = (i, base, amp, fase = 0) => Math.max(0, Math.round(base + amp * Math.sin(i / 3.1 + fase) + (i % 7 === 5 || i % 7 === 6 ? -base * 0.3 : 0)));
const dias = (j) => { const out = []; for (let t = Date.parse(j.inicio + 'T12:00:00Z'); t <= Date.parse(j.fim + 'T12:00:00Z'); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out; };

export function dadosExemplo(agora = Date.now()) {
  const em = new Date(agora).toISOString();
  const g = janelas(agora, 3), a = janelas(agora, 1);
  const serieGsc = dias(g.atual).map((dia, i) => ({ dia, clicks: onda(i, 14, 5), impressions: onda(i, 620, 140, 1) }));
  const serieGa = dias(a.atual).map((dia, i) => ({ dia, users: onda(i, 48, 14, 2), sessions: onda(i, 61, 17, 2) }));
  const soma = (s, k) => s.reduce((t, x) => t + x[k], 0);
  const clicks = soma(serieGsc, 'clicks'), impressions = soma(serieGsc, 'impressions');
  const historico = [];
  for (let i = 13; i >= 0; i--) historico.push({ dia: diaSP(agora - i * 86400000), velocidade: { '/': { m: 52 + (13 - i) % 4 + Math.floor((13 - i) / 3), d: 78 + (i % 3) }, '/backdrop': { m: 61 + (i % 5), d: 88 - (i % 4) } } });
  return {
    exemplo: true, atualizadoEm: em,
    fontes: { gsc: { ok: true, em }, indexacao: { ok: true, em }, ga4: { ok: true, em }, velocidade: { ok: true, em } },
    gsc: {
      periodo: g.atual, atual: { clicks, impressions, ctr: Math.round(clicks / impressions * 10000) / 100, position: 18.4 }, anterior: { clicks: Math.round(clicks * 0.82), impressions: Math.round(impressions * 0.9), ctr: 1.9, position: 21.2 },
      serie: serieGsc,
      buscas: [['gráfica brasília', 61, 1830], ['backdrop brasília', 44, 920], ['roll up preço', 31, 1210], ['box truss aluguel', 22, 640], ['fachada comercial acm', 18, 870], ['letra caixa aço inox', 14, 410], ['placa de campo poliondas', 11, 300], ['envelopamento automotivo df', 9, 520], ['núcleo gráfico digital', 8, 40], ['impressão lona brasília', 6, 380]]
        .map(([busca, c, i], k) => ({ busca, clicks: c, impressions: i, ctr: Math.round(c / i * 1000) / 10, position: 4 + k * 1.7 })),
      paginas: [['/', 120], ['/backdrop', 74], ['/roll-up', 51], ['/lp/box-truss', 33], ['/fachada-comercial', 28], ['/letra-caixa-aco', 19], ['/lp/placas-de-campo', 15], ['/portfolio', 11], ['/contato', 9], ['/blog', 4]]
        .map(([pagina, c], k) => ({ url: 'https://nucleografico.com.br' + pagina, pagina, clicks: c, impressions: c * 31, ctr: 3.2, position: 6 + k })),
    },
    indexacao: {
      sitemaps: [{ url: 'https://nucleografico.com.br/sitemap.xml', enviado: em, lido: em, pendente: false, erros: 0, avisos: 0, paginas: 50 }, { url: 'https://nucleografico.com.br/loja/sitemap.xml', enviado: em, lido: em, pendente: false, erros: 0, avisos: 1, paginas: 32 }],
      paginas: PAGINAS_PRINCIPAIS.map((pagina, i) => ({ pagina, veredito: i === 9 ? 'NEUTRAL' : 'PASS', cobertura: i === 9 ? 'Descoberta, ainda não indexada' : 'Enviada e indexada', ultimoRastreio: new Date(agora - (i + 1) * 86400000 * 1.7).toISOString(), canonica: pagina, em })),
      alertas: [{ pagina: '/lp/placas-de-campo', tipo: 'saiu', texto: '/lp/placas-de-campo saiu do índice do Google (Descoberta, ainda não indexada)', em }],
      inspecionadoEm: em,
    },
    ga4: {
      periodo: a.atual, atual: { users: soma(serieGa, 'users'), sessions: soma(serieGa, 'sessions'), views: Math.round(soma(serieGa, 'sessions') * 2.4) }, anterior: { users: Math.round(soma(serieGa, 'users') * 1.07), sessions: Math.round(soma(serieGa, 'sessions') * 1.04), views: Math.round(soma(serieGa, 'sessions') * 2.2) },
      serie: serieGa,
      canais: [['Google (orgânico)', 640], ['Direto', 410], ['Anúncios em redes', 290], ['Redes sociais', 230], ['Google Ads', 120], ['Outros sites', 40]].map(([nome, sessoes]) => ({ nome, sessoes })),
      origens: [['google', 700], ['(direct)', 410], ['instagram', 260], ['facebook', 180], ['l.instagram.com', 60], ['bing', 22]].map(([nome, sessoes]) => ({ nome, sessoes })),
      paginas: [['/', 1320], ['/backdrop', 610], ['/roll-up', 380], ['/portfolio', 300], ['/lp/box-truss', 250], ['/contato', 190], ['/fachada-comercial', 160], ['/servicos', 140], ['/letra-caixa-aco', 90], ['/obrigado_contato', 37]].map(([pagina, views]) => ({ pagina, views, users: Math.round(views * 0.62) })),
    },
    velocidade: { atual: { '/': { mobile: { nota: 58, lcp: 4.6, cls: 0.02, tbt: 420 }, desktop: { nota: 81, lcp: 1.5, cls: 0.01, tbt: 90 } }, '/backdrop': { mobile: { nota: 64, lcp: 3.9, cls: 0.04, tbt: 310 }, desktop: { nota: 90, lcp: 1.1, cls: 0.01, tbt: 40 } } } },
    historico,
  };
}
