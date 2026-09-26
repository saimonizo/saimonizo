/* ==========================================================================
   TIENDA.JS — CATÁLOGO DE EXPERIENCIAS Y PRODUCTOS
   --------------------------------------------------------------------------
   · Renderiza el catálogo digital (pases, cursos, experiencias) desde
     SP.config.catalogo: agregar un ítem nuevo no requiere tocar el HTML.
   · Marca lo que el viajero ya tiene desbloqueado.
   · Mantiene los productos físicos del HTML y les arma su consulta de WhatsApp.
   ========================================================================== */
(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var aviso = SP.aviso || function (m) { window.alert(m); };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(v) { return SP.esc ? SP.esc(v) : String(v || ''); }

  var sesion = null;

  /* ======================================================================
     CATÁLOGO DIGITAL
     ====================================================================== */
  function tarjetaCatalogo(item) {
    var activo = sesion && sesion.id && SP.sesion.esActivo(sesion.estado);
    var poseido = item.tipo === 'pase' && activo;

    var tipoEtiqueta = item.tipo === 'pase' ? 'Pase de acceso'
      : item.tipo === 'curso' ? 'Curso'
      : item.tipo === 'experiencia' ? 'Experiencia'
      : 'Producto';

    var beneficios = (item.beneficios || []).map(function (b) {
      return '<li><i class="fa-solid fa-check" aria-hidden="true"></i>' + esc(b) + '</li>';
    }).join('');

    var accion;
    if (poseido) {
      accion = '<a class="btn btn--primary btn--sm" href="' + esc(SP.url('oraculo')) + '">' +
        '<i class="fa-solid fa-play" aria-hidden="true"></i> Entrar ahora</a>';
    } else if (item.tipo === 'producto') {
      accion = '<a class="btn btn--ghost btn--sm" href="' + esc(SP.url('pago', { item: item.id })) + '">' +
        '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Comprar</a>';
    } else {
      accion = '<a class="btn ' + (item.destacado ? 'btn--gold' : 'btn--primary') + ' btn--sm" href="' +
        esc(SP.url('pago', { item: item.id })) + '">' +
        '<i class="fa-solid fa-key" aria-hidden="true"></i> Desbloquear</a>';
    }

    return '' +
      '<article class="item-card' + (item.destacado ? ' item-card--featured' : '') + '">' +
        '<div class="item-card__media">' +
          (item.destacado ? '<span class="pill pill--warn item-card__tag">Recomendado</span>' : '') +
          '<i class="' + esc(item.icono || 'fa-solid fa-star') + '" aria-hidden="true"></i>' +
        '</div>' +
        '<div class="item-card__body">' +
          '<p class="item-card__tipo">' + esc(tipoEtiqueta) + '</p>' +
          '<h2 class="item-card__titulo">' + esc(item.nombre) + '</h2>' +
          (item.subtitulo ? '<p class="item-card__desc">' + esc(item.subtitulo) + '</p>' : '') +
          (beneficios ? '<ul class="item-card__lista">' + beneficios + '</ul>' : '') +
          '<div class="item-card__pie">' +
            '<span class="item-card__precio">' + esc(SP.catalogoPrecioDesde(item)) +
              '<small>' + (poseido ? 'Ya es tuyo' : 'Pago único') + '</small></span>' +
            accion +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function pintarCatalogo() {
    var grid = $('#grid-catalogo');
    if (!grid) return;

    var items = SP.catalogo.todos();
    if (!items.length) {
      var seccion = $('#seccion-catalogo');
      if (seccion) SP.mostrar(seccion, false);
      return;
    }

    grid.innerHTML = items.map(tarjetaCatalogo).join('');
    SP.mostrar(grid, true);
  }

  /* ======================================================================
     PRODUCTOS FÍSICOS DEL HTML
     ----------------------------------------------------------------------
     Los artículos se siguen escribiendo en el HTML (son piezas artesanales
     con su propia descripción), pero el precio y el mensaje de WhatsApp se
     resuelven acá para no duplicar datos.
     ====================================================================== */
  function prepararProductosFisicos() {
    $$('.producto').forEach(function (card) {
      var titulo = card.querySelector('.producto__titulo');
      var nombre = titulo ? titulo.textContent.trim() : 'un producto';
      var precioEl = card.querySelector('.producto__precio');
      var precio = card.getAttribute('data-precio');

      if (precioEl) {
        var n = Number(precio);
        precioEl.textContent = n > 0 ? SP.precio(n, 'ARS') : 'Precio a consultar';
      }

      $$('a[data-link="whatsapp"]', card).forEach(function (a) {
        var base = a.getAttribute('data-msg') || ('Hola Simón, quiero encargar ' + nombre + '.');
        a.href = SP.wa(base);
      });
    });
  }

  /* ======================================================================
     MARCO PARA QUIEN YA TIENE EL PASE
     ====================================================================== */
  function pintarEstado() {
    var barra = $('#estado-tienda');
    if (!barra) return;

    if (sesion && sesion.id && SP.sesion.esActivo(sesion.estado)) {
      barra.innerHTML =
        '<div class="aviso aviso--ok">' +
          '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>' +
          '<div class="aviso__body">' +
            '<p><strong>Tu pase permanente está activo.</strong><br>' +
            'Podés entrar al Oráculo cuando quieras desde Mi Espacio.</p>' +
            '<div class="btn-row" style="justify-content:flex-start">' +
              '<a class="btn btn--primary btn--sm" href="' + esc(SP.url('oraculo')) + '">' +
                '<i class="fa-solid fa-play" aria-hidden="true"></i> Entrar al Oráculo</a>' +
              '<a class="btn btn--quiet btn--sm" href="' + esc(SP.url('espacio')) + '">' +
                '<i class="fa-solid fa-user" aria-hidden="true"></i> Mi Espacio</a>' +
            '</div>' +
          '</div>' +
        '</div>';
      barra.classList.remove('hidden');
    } else {
      SP.mostrar(barra, false);
      barra.innerHTML = '';
    }
  }

  /* ======================================================================
     ARRANQUE
     ====================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    sesion = SP.sesion.leer();
    pintarCatalogo();
    pintarEstado();
    prepararProductosFisicos();
  });
})();
