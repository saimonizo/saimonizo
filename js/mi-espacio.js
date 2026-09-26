/* ==========================================================================
   MI-ESPACIO.JS — LA CUENTA DEL VIAJERO
   --------------------------------------------------------------------------
   · Protege la ruta (sesión válida; si el pase no está activo, envía al pago)
   · Saluda y muestra el estado real de la cuenta (píldoras ACTIVO / PENDIENTE)
   · Lista las experiencias desbloqueadas desde el Sheet (obtener_experiencias)
   · Muestra el catálogo de compras disponibles (pases, cursos, futuros productos)
   · Permite refrescar el estado tras pagar por transferencia

   Si el backend no responde, la página NO se rompe: muestra las experiencias
   por defecto del catálogo local y un aviso claro.
   ========================================================================== */
(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var aviso = SP.aviso || function (m) { window.alert(m); };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function esc(v) { return SP.esc ? SP.esc(v) : String(v || ''); }

  var sesion = null;
  var contenedor = null;
  var panelCuenta = null;

  /* ======================================================================
     PINTAR EL ESTADO DE LA CUENTA
     ====================================================================== */
  function pintarCuenta(s) {
    var activo = SP.sesion.esActivo(s.estado);

    var nombreEl = $('#nombre-usuario');
    if (nombreEl) nombreEl.textContent = SP.primerNombre(s.nombre);

    var emailEl = $('#email-usuario');
    if (emailEl) emailEl.textContent = s.email || '';

    var pildoras = $('#pildoras-cuenta');
    if (pildoras) {
      pildoras.innerHTML =
        '<span class="pill ' + (activo ? 'pill--ok' : 'pill--warn') + '">' +
          '<i class="fa-solid ' + (activo ? 'fa-circle-check' : 'fa-hourglass-half') + '" aria-hidden="true"></i> ' +
          (activo ? 'Pase activo' : 'Pendiente de activación') +
        '</span>' +
        (s.tipoPase ? '<span class="pill pill--info"><i class="fa-solid fa-key" aria-hidden="true"></i> ' +
          esc(s.tipoPase) + '</span>' : '');
    }

    // Aviso accionable cuando todavía no puede entrar al Oráculo
    var barra = $('#aviso-estado');
    if (barra) {
      if (activo) {
        SP.mostrar(barra, false);
        barra.innerHTML = '';
      } else {
        barra.innerHTML =
          '<div class="aviso aviso--warn">' +
            '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>' +
            '<div class="aviso__body">' +
              '<p><strong>Tu pase aún no está activo.</strong><br>' +
              'Completá el pago para desbloquear el Oráculo. Si ya pagaste por transferencia, ' +
              'avisale a Simón y refrescá el estado en un momento.</p>' +
              '<div class="btn-row" style="justify-content:flex-start">' +
                '<a class="btn btn--primary btn--sm" href="' +
                  esc(SP.url('pago', { email: s.email, item: 'pase-permanente' })) + '">' +
                  '<i class="fa-solid fa-credit-card" aria-hidden="true"></i> Activar mi pase</a>' +
                '<button class="btn btn--quiet btn--sm" type="button" id="btn-refrescar">' +
                  '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Refrescar estado</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        SP.mostrar(barra, true);
      }
    }
  }

  function conectarRefrescar() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('#btn-refrescar');
      if (!btn) return;
      e.preventDefault();
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Consultando…';

      SP.sesion.revalidar().then(function (valida) {
        if (!valida) {
          aviso('Tu sesión expiró. Ingresá de nuevo.', 'err');
          setTimeout(function () { window.location.href = SP.url('ingreso'); }, 900);
          return;
        }
        sesion = valida;
        pintarCuenta(sesion);
        if (SP.sesion.esActivo(valida.estado)) {
          aviso('¡Pase confirmado! Ya podés entrar al Oráculo.', 'ok');
          cargarExperiencias();
        } else {
          aviso('Todavía no registramos tu pago.', 'info');
        }
      }).catch(function () {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Refrescar estado';
      });
    });
  }

  /* ======================================================================
     TARJETAS DE EXPERIENCIA (lo desbloqueado)
     ====================================================================== */
  function tarjetaExperiencia(exp) {
    var activo = String(exp.estado || '').toLowerCase() === 'activo' ||
                 String(exp.estado || '').toLowerCase() === 'activa';

    var articulo = document.createElement('article');
    articulo.className = 'acceso ' + (activo ? 'acceso--activo' : 'acceso--bloqueado');

    var url = exp.url || '';
    var urlCompra = exp.url_compra || SP.url('pago', { item: 'pase-permanente' });
    var boton = activo
      ? '<a class="btn btn--primary btn--sm" href="' + esc(url) + '">' +
          '<i class="fa-solid fa-play" aria-hidden="true"></i> ' +
          esc(exp.boton_texto || 'Continuar') + '</a>'
      : '<a class="btn btn--ghost btn--sm" href="' + esc(urlCompra) + '">' +
          '<i class="fa-solid fa-key" aria-hidden="true"></i> Desbloquear</a>';

    articulo.innerHTML =
      '<span class="acceso__ico">' +
        '<i class="fa-solid ' + (activo ? 'fa-unlock' : 'fa-lock') + '" aria-hidden="true"></i>' +
      '</span>' +
      '<div class="acceso__body">' +
        '<h3 class="acceso__titulo">' + esc(exp.nombre || 'Experiencia') + '</h3>' +
        '<p class="acceso__desc">' + esc(exp.descripcion || '') + '</p>' +
        '<div class="acceso__etiquetas">' +
          '<span class="pill ' + (activo ? 'pill--ok' : 'pill--muted') + '">' +
            esc(activo ? 'Desbloqueado' : 'Bloqueado') +
          '</span>' +
        '</div>' +
        boton +
      '</div>';

    return articulo;
  }

  /** Experiencias mínimas del ecosistema cuando el backend no responde. */
  function experienciasPorDefecto() {
    var activo = SP.sesion.esActivo(sesion.estado);
    return [{
      nombre: 'Oráculo Evolución',
      descripcion: 'El viaje completo: sintonía, cortometraje, mapa personal y tu bitácora.',
      estado: activo ? 'Activo' : 'Bloqueado',
      url: SP.url('oraculo'),
      boton_texto: 'Entrar al Oráculo',
      url_compra: SP.url('pago', { email: sesion.email, item: 'pase-permanente' }),
    }];
  }

  function mostrar(lista, origen) {
    if (!contenedor) return;
    contenedor.innerHTML = '';
    var carga = $('#estado-carga');
    var vacio = $('#mensaje-vacio');

    if (carga) SP.mostrar(carga, false);

    if (!lista || !lista.length) {
      SP.mostrar(vacio, true);
      return;
    }

    lista.forEach(function (exp) { contenedor.appendChild(tarjetaExperiencia(exp)); });
    SP.mostrar(contenedor, true);

    var nota = $('#nota-origen');
    if (nota && origen === 'local') {
      nota.textContent = 'Mostrando la experiencia principal. Volvé a intentar más tarde para ver todo tu contenido.';
      SP.mostrar(nota, true);
    }
  }

  function cargarExperiencias() {
    if (!contenedor) return Promise.resolve();

    var carga = $('#estado-carga');
    var vacio = $('#mensaje-vacio');
    SP.mostrar(carga, true);
    SP.mostrar(vacio, false);
    SP.mostrar(contenedor, false);

    return SP.api.post('obtener_experiencias', {
      id_usuario: sesion.id,
      email: sesion.email,
      token: sesion.token,
    })
      .then(function (data) {
        if (data.exito && Array.isArray(data.experiencias) && data.experiencias.length) {
          mostrar(data.experiencias, 'backend');
        } else {
          mostrar(experienciasPorDefecto(), 'local');
        }
      })
      .catch(function (err) {
        console.error('[Mi Espacio] No se pudieron traer las experiencias:', err);
        mostrar(experienciasPorDefecto(), 'local');
      });
  }

  /* ======================================================================
     CATÁLOGO DE COMPRAS DISPONIBLES
     ====================================================================== */
  function pintarCatalogo() {
    var grid = $('#grid-catalogo');
    if (!grid) return;

    var items = SP.catalogo.todos();
    if (!items.length) {
      SP.mostrar(grid, false);
      return;
    }

    var activo = SP.sesion.esActivo(sesion.estado);

    grid.innerHTML = items.map(function (item) {
      var poseido = item.tipo === 'pase' && activo;
      var desde = SP.catalogoPrecioDesde(item);
      var tipoEtiqueta = item.tipo === 'pase' ? 'Pase'
        : item.tipo === 'curso' ? 'Curso'
        : item.tipo === 'experiencia' ? 'Experiencia'
        : 'Producto';

      var boton = poseido
        ? '<span class="pill pill--ok" style="align-self:flex-start">' +
            '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Ya es tuyo</span>'
        : item.tipo === 'producto'
          ? '<a class="btn btn--quiet btn--sm" href="' + esc(SP.url('tienda')) + '">' +
              '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Ver en la tienda</a>'
          : '<a class="btn btn--ghost btn--sm" href="' +
              esc(SP.url('pago', { item: item.id })) + '">' +
              '<i class="fa-solid fa-key" aria-hidden="true"></i> Desbloquear</a>';

      return '' +
        '<article class="item-card' + (item.destacado ? ' item-card--featured' : '') + '">' +
          '<div class="item-card__media">' +
            (item.destacado ? '<span class="pill pill--warn item-card__tag">Recomendado</span>' : '') +
            '<i class="' + esc(item.icono || 'fa-solid fa-star') + '" aria-hidden="true"></i>' +
          '</div>' +
          '<div class="item-card__body">' +
            '<p class="item-card__tipo">' + esc(tipoEtiqueta) + '</p>' +
            '<h3 class="item-card__titulo">' + esc(item.nombre) + '</h3>' +
            '<p class="item-card__desc">' + esc(item.subtitulo || '') + '</p>' +
            '<div class="item-card__pie">' +
              '<span class="item-card__precio">' + esc(desde) +
                '<small>Precio</small></span>' +
              boton +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');

    SP.mostrar(grid, true);
  }
  /* ======================================================================
     ARRANQUE
     ====================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    contenedor = $('#grid-experiencias');

    sesion = SP.sesion.leer();
    if (!sesion || !sesion.id) {
      var destino = window.location.pathname.split('/').pop();
      window.location.replace(SP.url('ingreso', { volver: destino, motivo: 'sesion' }));
      return;
    }

    pintarCuenta(sesion);
    conectarRefrescar();
    pintarCatalogo();

    // Revalidar contra el backend y, con el estado fresco, cargar el contenido
    SP.sesion.revalidar().then(function (valida) {
      if (!valida) {
        window.location.replace(SP.url('ingreso', { motivo: 'expirada' }));
        return;
      }
      sesion = valida;
      pintarCuenta(sesion);
      pintarCatalogo();
      cargarExperiencias();
    });
  });
})();
