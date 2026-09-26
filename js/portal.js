/* ==========================================================================
   PORTAL.JS — EMBUDO "PORTAL EVOLUCIÓN"
   --------------------------------------------------------------------------
   Fase 1: captura del interés (nombre, correo, WhatsApp, ubicación)
           → se envía al webhook de Make y se guarda localmente
   Fase 2: revelado de las pasarelas de acceso
           → el visitante crea su cuenta y elige cómo activar el pase

   El Portal NO crea la cuenta: presenta la experiencia y deriva al
   registro sellado de auth.html, que es el único punto de alta de usuarios.
   ========================================================================== */
(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var cfg = SP.config || {};
  var aviso = SP.aviso || function (m) { window.alert(m); };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function esc(v) { return SP.esc ? SP.esc(v) : String(v || ''); }

  var CLAVE_LEAD = 'sp.lead.v1';
  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ======================================================================
     DATOS DEL VISITANTE (borrador local)
     ====================================================================== */
  function guardarLead(datos) {
    try { sessionStorage.setItem(CLAVE_LEAD, JSON.stringify(datos)); } catch (e) { /* ignorar */ }
  }

  /** Prellena el registro de auth.html con lo que ya escribió en el Portal. */
  function urlRegistro(datos) {
    var params = { modo: 'registro' };
    if (datos && datos.correo) params.email = datos.correo;
    if (datos && datos.nombre) params.nombre = datos.nombre;
    return SP.url('ingreso', params);
  }

  /* ======================================================================
     PASARELAS
     ----------------------------------------------------------------------
     Se generan desde el catálogo central. Si el catálogo estuviera vacío,
     queda el contenido estático del HTML como respaldo.
     ====================================================================== */
  function pintarPasarelas(lead) {
    var cont = $('#grid-pasarelas');
    if (!cont) return;

    var items = SP.catalogo.todos();
    if (!items.length) return;

    var destino = urlRegistro(lead);

    cont.innerHTML = items.map(function (item) {
      var desde = SP.catalogoPrecioDesde(item);
      var opciones = (item.opciones || []).length;
      var etiquetaTipo = item.tipo === 'pase'
        ? 'Acceso ilimitado · sin límite de tiempo'
        : item.tipo === 'curso' ? 'Curso completo' : 'Compra única';

      return '' +
        '<article class="pasarela' + (item.destacado ? ' pasarela--featured' : '') + '">' +
          (item.destacado ? '<span class="pasarela__badge">Recomendado</span>' : '') +
          '<h3><i class="' + esc(item.icono || 'fa-solid fa-key') + '" aria-hidden="true"></i> ' +
            esc(item.nombre) + '</h3>' +
          '<p class="pasarela__tipo">' + esc(etiquetaTipo) + '</p>' +
          '<p style="font-size:1.6rem;font-family:var(--font-display);font-weight:700;color:var(--gold-soft);margin:.5rem 0 1rem">' +
            esc(desde) + '</p>' +
          '<p>' + esc(item.descripcion || '') + '</p>' +
          '<a class="btn ' + (item.destacado ? 'btn--primary' : 'btn--ghost') + ' btn--block" href="' +
            esc(destino) + '">' +
            '<i class="fa-solid fa-user-plus" aria-hidden="true"></i> Crear cuenta' +
            (opciones > 1 ? ' y elegir pago' : '') +
          '</a>' +
        '</article>';
    }).join('') +
      // Alternativa para quien prefiere hablar antes de pagar
      '<article class="pasarela">' +
        '<h3><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Hablar con Simón</h3>' +
        '<p class="pasarela__tipo">Coordinación directa</p>' +
        '<p>¿Preferís consultar antes de decidir? Escribime y vemos juntos la mejor forma de empezar.</p>' +
        '<a class="btn btn--quiet btn--block" href="' +
          esc(SP.wa('Hola Simón, quiero conocer más sobre el Oráculo Evolución.' +
            (lead && lead.nombre ? '\n\nSoy ' + lead.nombre + '.' : ''))) +
          '" target="_blank" rel="noopener">' +
          '<i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Comunicate</a>' +
      '</article>';
  }

  /* ======================================================================
     FASE 1 — REGISTRO
     ====================================================================== */
  function iniciarRegistro() {
    var form = $('#form-registro');
    if (!form) return;

    var boton = $('#btn-registro');
    var seccionRegistro = $('#registro');
    var seccionPasarelas = $('#seccion-pasarelas');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var nombre = (($('#p-nombre') || {}).value || '').trim();
      var correo = (($('#p-correo') || {}).value || '').trim();
      var whatsapp = (($('#p-whatsapp') || {}).value || '').trim();
      var ubicacion = (($('#p-ubicacion') || {}).value || '').trim();

      // Validación local con avisos elegantes
      if (!nombre || !correo || !ubicacion) {
        aviso('Completá nombre, correo y ubicación para continuar.', 'err');
        return;
      }
      if (!RE_EMAIL.test(correo)) {
        aviso('Revisá el formato de tu correo electrónico.', 'err');
        return;
      }

      var lead = { nombre: nombre, correo: correo, whatsapp: whatsapp, ubicacion: ubicacion };
      guardarLead(lead);

      if (boton) {
        boton.disabled = true;
        boton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Sincronizando…';
      }

      // Envío en segundo plano: no bloquea la experiencia si falla la red
      var url = (cfg.webhooks && cfg.webhooks.registro) || '';
      if (url) {
        try {
          fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              Nombre: nombre, Correo: correo, Whatsapp: whatsapp, Ubicacion: ubicacion,
            }),
          }).catch(function (err) {
            console.error('[Portal] No se pudo enviar el registro:', err);
          });
        } catch (err) {
          console.error('[Portal] Error al preparar el envío:', err);
        }
      }

      // Revelado elástico de las pasarelas (ya personalizadas con sus datos)
      setTimeout(function () {
        pintarPasarelas(lead);

        if (seccionRegistro) SP.mostrar(seccionRegistro, false);
        if (seccionPasarelas) {
          SP.mostrar(seccionPasarelas, true);
          aviso('¡Registro recibido! Elegí tu llave de acceso.', 'ok');
          var destino = seccionPasarelas.getBoundingClientRect().top + window.scrollY - 70;
          window.scrollTo({ top: destino, behavior: 'smooth' });
        }
        if (boton) {
          boton.disabled = false;
          boton.innerHTML = 'Registrarme y ver opciones de acceso';
        }
      }, 420);
    });
  }

  /* ======================================================================
     ARRANQUE
     ====================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    // Si ya tiene sesión activa, el Portal le ofrece entrar directo
    if (window.SP && SP.sesion) {
      var ses = SP.sesion.leer();
      var barra = $('#aviso-sesion-portal');
      if (ses && ses.id && barra) {
        var activo = SP.sesion.esActivo(ses.estado);
        barra.innerHTML =
          '<div class="aviso ' + (activo ? 'aviso--ok' : 'aviso--warn') + '">' +
            '<i class="fa-solid ' + (activo ? 'fa-circle-check' : 'fa-hourglass-half') + '" aria-hidden="true"></i>' +
            '<div class="aviso__body">' +
              '<p><strong>Hola de nuevo, ' + esc(SP.primerNombre(ses.nombre)) + '.</strong><br>' +
              (activo ? 'Tu pase está activo: podés continuar el viaje.'
                      : 'Tu cuenta está lista; falta activar el pase.') + '</p>' +
              '<a class="btn btn--primary btn--sm" href="' +
                esc(SP.url(activo ? 'oraculo' : 'pago', activo ? {} : { item: 'pase-permanente' })) + '">' +
                (activo ? 'Entrar al Oráculo' : 'Activar mi pase') + '</a>' +
            '</div>' +
          '</div>';
        SP.mostrar(barra, true);
      }
    }

    iniciarRegistro();
  });
})();
