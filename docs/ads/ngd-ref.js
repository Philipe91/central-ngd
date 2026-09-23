/* ngd-ref.js — leva o código do anúncio da URL para a conversa do WhatsApp.
 *
 * Onde entra: no site da NGD (nucleografico.com.br), em todas as páginas. Uma linha no
 * rodapé do template resolve:   <script src="/js/ngd-ref.js" defer></script>
 *
 * Por que existe: o anúncio MP-104 é um carrossel que leva ao site. Quem chega tem
 * ?ngd_ref=MP-104 na URL. Se a pessoa depois clica em "Chamar no WhatsApp", a mensagem sai
 * sem nenhuma marca e o atendimento não sabe de onde ela veio. Este arquivo carimba o
 * código na mensagem, e aí o painel da loja consegue ligar a conversa ao anúncio.
 *
 * Não usa biblioteca, não faz requisição, não manda nada para lugar nenhum. Guarda só o
 * código do anúncio no navegador de quem visita, por 30 dias.
 */
(function () {
  'use strict';
  var CHAVE = 'ngd_ref';
  var DIAS = 30;

  function guardar(ref) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ ref: ref, ate: Date.now() + DIAS * 864e5 }));
    } catch (e) { /* navegação privada: segue sem guardar */ }
  }

  function lido() {
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (!bruto) return '';
      var o = JSON.parse(bruto);
      if (!o || !o.ref || Date.now() > o.ate) { localStorage.removeItem(CHAVE); return ''; }
      return o.ref;
    } catch (e) { return ''; }
  }

  // Aceita só o formato do painel (MP-001). Qualquer outra coisa é ignorada, para ninguém
  // conseguir injetar texto na mensagem pela URL.
  function daUrl() {
    var p = new URLSearchParams(location.search);
    var ref = (p.get('ngd_ref') || p.get('utm_campaign') || '').toUpperCase();
    return /^MP-\d{3,4}$/.test(ref) ? ref : '';
  }

  var ref = daUrl();
  if (ref) guardar(ref); else ref = lido();
  if (!ref) return;

  var marca = '[ref ' + ref + ']';

  function carimbar(a) {
    var href = a.getAttribute('href') || '';
    if (!/wa\.me|api\.whatsapp\.com/i.test(href)) return;
    if (href.indexOf(marca) !== -1) return;          // já carimbado
    var u;
    try { u = new URL(href, location.href); } catch (e) { return; }
    var texto = u.searchParams.get('text') || 'Olá! Vim pelo site e quero um orçamento.';
    u.searchParams.set('text', texto.trim() + ' ' + marca);
    a.setAttribute('href', u.toString());
  }

  function varrer() {
    var links = document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    for (var i = 0; i < links.length; i++) carimbar(links[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', varrer);
  else varrer();

  // Botão que aparece depois (menu, modal, carregamento por script): carimba no clique,
  // antes de o navegador seguir o link.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (a) carimbar(a);
  }, true);
})();
