/* ==========================================================================
   MAIN.JS — Comportamiento compartido del ecosistema Simón Pérez
   --------------------------------------------------------------------------
   · Estado de la cabecera al hacer scroll
   · Menú móvil
   · Marcado automático del enlace activo
   · Animaciones de aparición (reveal)
   · Carruseles accesibles (auto, puntos, flechas)
   · Sistema de avisos (toasts) reemplazando los alert() nativos
   · Utilidades de contacto (WhatsApp)
   ========================================================================== */
(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var cfg = SP.config || {};

  /* ======================================================================
     UTILIDADES
     ====================================================================== */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /** Devuelve el nombre de archivo de la página actual ('' si es raíz). */
  function paginaActual() {
    var parte = window.location.pathname.split('/').pop();
    return parte || 'index.html';
  }

  /* ======================================================================
     AVISOS (TOASTS)
     ====================================================================== */
  var ICONOS = { ok: '✦', err: '✕', info: '❖' };

  function stackDeAvisos() {
    var stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    return stack;
  }

  /**
   * Muestra un aviso flotante. Reemplaza elegantemente a alert().
   * @param {string} mensaje
   * @param {'ok'|'err'|'info'} [tipo]
   * @param {number} [duracion] ms
   */
  SP.toast = function (mensaje, tipo, duracion) {
    tipo = tipo || 'info';
    var stack = stackDeAvisos();
    var el = document.createElement('div');
    el.className = 'toast toast--' + tipo;
    el.innerHTML = '<span class="toast__ico">' + (ICONOS[tipo] || ICONOS.info) + '</span>' +
                   '<span class="toast__msg"></span>';
    el.querySelector('.toast__msg').textContent = mensaje;
    stack.appendChild(el);

    var vida = duracion || (tipo === 'err' ? 6200 : 4600);
    var temporizador = setTimeout(quitar, vida);

    function quitar() {
      clearTimeout(temporizador);
      el.classList.add('is-leaving');
      el.addEventListener('animationend', function () { el.remove(); }, { once: true });
      setTimeout(function () { if (el.parentNode) el.remove(); }, 600);
    }
    el.addEventListener('click', quitar);
    return el;
  };

  /* ======================================================================
     CONTACTO
     ====================================================================== */
  /** Construye un enlace de WhatsApp con mensaje precargado. */
  SP.whatsapp = function (mensaje) {
    var num = (cfg.contacto && cfg.contacto.whatsapp) || '';
    var base = 'https://wa.me/' + num;
    return mensaje ? base + '?text=' + encodeURIComponent(mensaje) : base;
  };

  /* ======================================================================
     CABECERA
     ====================================================================== */
  function iniciarCabecera() {
    var header = $('.site-header');
    if (!header) return;

    // Sombra / fondo al hacer scroll
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Menú móvil
    var toggle = $('#nav-toggle', header);
    var nav = $('#nav-principal', header);
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var abierto = nav.classList.toggle('is-open');
        toggle.classList.toggle('is-open', abierto);
        toggle.setAttribute('aria-expanded', String(abierto));
      });
      // Cerrar al navegar o al tocar fuera
      $$('a', nav).forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('is-open');
          toggle.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) {
          nav.classList.remove('is-open');
          toggle.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        }
      });
    }

    // Marcar el enlace activo según la página
    var actual = paginaActual();
    $$('.nav__link', header).forEach(function (a) {
      var destino = (a.getAttribute('href') || '').split('/').pop();
      if (destino && destino === actual) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* ======================================================================
     REVEAL AL SCROLL
     ====================================================================== */
  function iniciarReveals() {
    var objetivos = $$('[data-reveal]');
    if (!objetivos.length) return;

    if (!('IntersectionObserver' in window)) {
      objetivos.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var delay = parseInt(e.target.getAttribute('data-reveal') || '0', 10) || 0;
        setTimeout(function () { e.target.classList.add('is-visible'); }, delay);
        obs.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    objetivos.forEach(function (el) { obs.observe(el); });
  }

  /* ======================================================================
     CARRUSELES
     ====================================================================== */
  /**
   * Inicializa un carrusel declarado con [data-carousel].
   * Requiere dentro: .carrusel__riel y uno o más .carrusel__item.
   */
  function iniciarCarrusel(raiz) {
    var riel = $('.carrusel__riel', raiz);
    if (!riel) return;
    var items = $$('.carrusel__item', riel);
    if (items.length < 2) return;

    var intervalo = parseInt(raiz.getAttribute('data-carousel') || '0', 10) || 0;
    var contenedorPuntos = $('[data-carousel-dots]', raiz);
    var indice = 0;
    var temporizador = null;

    // Puntos de navegación
    var puntos = [];
    if (contenedorPuntos) {
      items.forEach(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'carrusel__dot' + (i === 0 ? ' is-active' : '');
        b.setAttribute('aria-label', 'Ir al testimonio ' + (i + 1));
        b.addEventListener('click', function () { ir(i); reiniciar(); });
        contenedorPuntos.appendChild(b);
        puntos.push(b);
      });
    }

    function ir(i) {
      indice = (i + items.length) % items.length;
      riel.style.transform = 'translateX(' + (-indice * 100) + '%)';
      puntos.forEach(function (p, k) {
        p.classList.toggle('is-active', k === indice);
        p.setAttribute('aria-current', k === indice ? 'true' : 'false');
      });
    }

    function siguiente() { ir(indice + 1); }

    function reiniciar() {
      if (!intervalo) return;
      clearInterval(temporizador);
      temporizador = setInterval(siguiente, intervalo);
    }

    // Flechas opcionales
    var prev = $('[data-carousel-prev]', raiz);
    var next = $('[data-carousel-next]', raiz);
    if (prev) prev.addEventListener('click', function () { ir(indice - 1); reiniciar(); });
    if (next) next.addEventListener('click', function () { ir(indice + 1); reiniciar(); });

    // Pausa al pasar el mouse / al tocar
    raiz.addEventListener('mouseenter', function () { clearInterval(temporizador); });
    raiz.addEventListener('mouseleave', reiniciar);
    raiz.addEventListener('focusin', function () { clearInterval(temporizador); });

    // Swipe táctil básico
    var inicioX = null;
    raiz.addEventListener('touchstart', function (e) {
      inicioX = e.touches[0].clientX;
      clearInterval(temporizador);
    }, { passive: true });
    raiz.addEventListener('touchend', function (e) {
      if (inicioX === null) return;
      var delta = e.changedTouches[0].clientX - inicioX;
      if (Math.abs(delta) > 45) ir(indice + (delta < 0 ? 1 : -1));
      inicioX = null;
      reiniciar();
    });

    ir(0);
    reiniciar();
  }

  /* ======================================================================
     GALERÍA DESLIZABLE (riel con scroll-snap)
     ====================================================================== */
  function iniciarGaleria(raiz) {
    var riel = $('[data-galeria-riel]', raiz);
    if (!riel) return;
    var navegar = function (dir) {
      var total = riel.children.length;
      var paso = riel.clientWidth || 1;
      var actual = Math.round(riel.scrollLeft / paso);
      var destino = (actual + dir + total) % total;
      riel.scrollTo({ left: destino * paso, behavior: 'smooth' });
    };
    var prev = $('[data-galeria-prev]', raiz);
    var next = $('[data-galeria-next]', raiz);
    if (prev) prev.addEventListener('click', function () { navegar(-1); });
    if (next) next.addEventListener('click', function () { navegar(1); });
  }

  /* ======================================================================
     VARIOS
     ====================================================================== */
  function anioFooter() {
    $$('[data-anio]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /** Rellena dinámicamente todos los enlaces de contacto declarados en el HTML. */
  function enlacesAutomaticos() {
    var c = cfg.contacto || {};
    $$('[data-link="whatsapp"]').forEach(function (a) {
      a.href = SP.whatsapp(a.getAttribute('data-msg') || 'Hola Simón, te escribo desde la web.');
    });
    $$('[data-link="email"]').forEach(function (a) { a.href = 'mailto:' + c.email; });
    $$('[data-link="instagram"]').forEach(function (a) { if (c.instagram) a.href = c.instagram; });
    $$('[data-link="youtube"]').forEach(function (a) { if (c.youtube) a.href = c.youtube; });
    $$('[data-link="spotify"]').forEach(function (a) { if (c.spotify) a.href = c.spotify; });
    $$('[data-link="donacion"]').forEach(function (a) { if (cfg.pagos && cfg.pagos.donacion) a.href = cfg.pagos.donacion; });
    $$('[data-link="paseUnico"]').forEach(function (a) { if (cfg.pagos && cfg.pagos.paseUnico) a.href = cfg.pagos.paseUnico; });
    $$('[data-link="accesoLibre"]').forEach(function (a) { if (cfg.pagos && cfg.pagos.accesoLibre) a.href = cfg.pagos.accesoLibre; });
  }

  /* ======================================================================
     ACCESO EN LA CABECERA
     ----------------------------------------------------------------------
     Si el viajero ya tiene sesión, el botón "Ingresar" pasa a ser un acceso
     directo a Mi Espacio. Refuerza la sensación de cuenta sellada: el sitio
     reconoce a quien ya entró.
     ====================================================================== */
  function ajustarAccesoCabecera() {
    var ctas = $$('.nav__cta');
    if (!ctas.length || !SP.sesion) return;

    var sesion = SP.sesion.leer();
    if (!sesion || !sesion.id) return;

    var activo = SP.sesion.esActivo(sesion.estado);
    var destino = SP.url ? SP.url('espacio') : 'mi-espacio.html';

    ctas.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      // Solo reemplazamos el enlace de ingreso, no los del Oráculo
      if (href.indexOf('auth.html') === -1) return;
      a.href = destino;
      a.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i> Mi Espacio' +
        (activo ? '' : ' <span class="visually-hidden">(pase pendiente)</span>');
      a.setAttribute('aria-label', 'Ir a Mi Espacio, ' + (sesion.nombre || 'tu cuenta'));
    });
  }

  /* ======================================================================
     ARRANQUE
     ====================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    iniciarCabecera();
    iniciarReveals();
    $$('[data-carousel]').forEach(iniciarCarrusel);
    $$('[data-galeria]').forEach(iniciarGaleria);
    anioFooter();
    enlacesAutomaticos();
    ajustarAccesoCabecera();
  });
})();