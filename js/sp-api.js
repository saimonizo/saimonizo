/* ==========================================================================
   SP-API — NÚCLEO DEL SISTEMA DE CUENTAS Y COMPRAS
   --------------------------------------------------------------------------
   Un único punto de contacto con el backend (Google Sheets + Apps Script)
   y una única fuente de verdad para la sesión del viajero.

   Expone:
     SP.api.post(accion, datos)          → llamada al Apps Script
     SP.sesion.*                         → leer / guardar / cerrar sesión
     SP.protegerRuta(opciones)           → guardia de acceso por página
     SP.precio(valor, moneda)            → formato de moneda es-AR
     SP.catalogo.obtener(id)             → ítem de compra por id
     SP.orden.crear(itemId, metodo)      → registra la intención de compra
     SP.esc(texto)                       → escapa HTML antes de inyectar

   Orden de carga en el HTML:
     config.js  →  sp-api.js  →  main.js  →  (script de la página)
   ========================================================================== */
(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var cfg = SP.config || {};

  /* ======================================================================
     UTILIDADES BÁSICAS
     ====================================================================== */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /** Escapa texto para poder inyectarlo con innerHTML sin riesgo. */
  SP.esc = function (valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /** Lee un parámetro de la URL actual. */
  SP.param = function (nombre, url) {
    try {
      return new URLSearchParams(url || window.location.search).get(nombre) || '';
    } catch (e) {
      return '';
    }
  };

  /** Aviso tolerante: usa SP.toast si main.js ya cargó, si no un alert. */
  function aviso(msg, tipo) {
    if (typeof SP.toast === 'function') return SP.toast(msg, tipo);
    window.alert(msg);
  }
  SP.aviso = aviso;

  /** Resuelve una ruta del ecosistema, con parámetros opcionales. */
  SP.url = function (clave, params) {
    var base = (cfg.rutas && cfg.rutas[clave]) || clave || 'index.html';
    if (!params) return base;
    var query = new URLSearchParams(params).toString();
    return query ? base + '?' + query : base;
  };

  /* ======================================================================
     1. BACKEND — APPS SCRIPT
     ====================================================================== */
  var API = {
    url: (cfg.api && cfg.api.url) || '',
    timeout: (cfg.api && cfg.api.timeout) || 15000,
    reintentos: (cfg.api && cfg.api.reintentos) || 0,
  };

  /** Normaliza la respuesta del Apps Script: acepta exito / ok / success. */
  function normalizar(data) {
    if (!data || typeof data !== 'object') return { exito: false, error: 'Respuesta inválida del servidor.' };
    if (typeof data.exito === 'undefined') {
      if (typeof data.ok !== 'undefined') data.exito = !!data.ok;
      else if (typeof data.success !== 'undefined') data.exito = !!data.success;
      else data.exito = false;
    }
    return data;
  }

  function traerConTimeout(cuerpo) {
    var control = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var temporizador = setTimeout(function () { if (control) control.abort(); }, API.timeout);

    var opciones = {
      method: 'POST',
      // text/plain evita el preflight OPTIONS que Apps Script no responde.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
      redirect: 'follow',
    };
    if (control) opciones.signal = control.signal;

    return fetch(API.url, opciones)
      .then(function (r) {
        clearTimeout(temporizador);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (texto) {
        try {
          return normalizar(JSON.parse(texto));
        } catch (e) {
          throw new Error('El servidor no devolvió JSON válido.');
        }
      })
      .catch(function (err) {
        clearTimeout(temporizador);
        throw err;
      });
  }

  /**
   * Llama al Apps Script.
   * @param {string} accion  nombre de la acción (ver README)
   * @param {object} [datos] campos adicionales
   * @returns {Promise<object>} respuesta normalizada (con .exito)
   */
  SP.api = {
    post: function (accion, datos) {
      if (!API.url) {
        return Promise.reject(new Error('Falta configurar SP.config.api.url.'));
      }
      var cuerpo = Object.assign({ accion: accion }, datos || {});
      var intentos = API.reintentos;

      function intentar() {
        return traerConTimeout(cuerpo).catch(function (err) {
          if (intentos > 0) {
            intentos -= 1;
            return new Promise(function (res) { setTimeout(res, 700); }).then(intentar);
          }
          throw err;
        });
      }
      return intentar();
    },
  };

  /* ======================================================================
     2. SESIÓN DEL VIAJERO
     ----------------------------------------------------------------------
     Se guarda en localStorage (persistente con "Recordarme") y se espeja
     en sessionStorage con las claves heredadas que ya usa el resto del sitio:
       usuario_id · usuario_nombre · usuario_email
       usuario_estado · usuario_tipo_pase
     ====================================================================== */
  var CLAVE = (cfg.sesion && cfg.sesion.clave) || 'sp.sesion.v1';
  var CAMPOS_LEGADO = {
    id: 'usuario_id',
    nombre: 'usuario_nombre',
    email: 'usuario_email',
    estado: 'usuario_estado',
    tipoPase: 'usuario_tipo_pase',
  };

  function leerAlmacen() {
    try {
      var crudo = window.localStorage.getItem(CLAVE);
      return crudo ? JSON.parse(crudo) : null;
    } catch (e) {
      return null;
    }
  }

  function escribirAlmacen(datos) {
    try {
      if (datos) window.localStorage.setItem(CLAVE, JSON.stringify(datos));
      else window.localStorage.removeItem(CLAVE);
    } catch (e) { /* modo privado: se ignora, queda solo sessionStorage */ }
  }

  /** Vuelca la sesión a las claves heredadas de sessionStorage. */
  function espejarLegado(datos) {
    try {
      if (!datos) {
        Object.keys(CAMPOS_LEGADO).forEach(function (k) { sessionStorage.removeItem(CAMPOS_LEGADO[k]); });
        return;
      }
      Object.keys(CAMPOS_LEGADO).forEach(function (k) {
        if (datos[k] !== undefined && datos[k] !== null) {
          sessionStorage.setItem(CAMPOS_LEGADO[k], String(datos[k]));
        }
      });
    } catch (e) { /* ignorar */ }
  }

  /**
   * Muestra u oculta un elemento de forma fiable.
   * Cubre a la vez la CLASE .hidden y el ATRIBUTO [hidden]: el HTML usa
   * muchas veces el atributo y, si solo quitáramos la clase, el elemento
   * seguiría invisible (por eso antes no aparecía el catálogo).
   */
  SP.mostrar = function (el, visible) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    if (visible) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  };

  /** ¿El estado de la cuenta permite entrar al Oráculo? */
  function esActivo(estado) {
    var e = String(estado || '').toUpperCase();
    return e === 'ACTIVO' || e === 'ACTIVA' || e === 'PAID' || e === 'PAGADO' ||
           e === 'PERMANENTE' || e === 'ILIMITADO' || e === 'LIBRE';
  }

  SP.sesion = {
    /** Devuelve la sesión activa o null. */
    leer: function () {
      var datos = leerAlmacen();
      if (datos && datos.id) return datos;
      // Respaldo: sesión viva solo en esta pestaña (sin "Recordarme")
      try {
        var id = sessionStorage.getItem(CAMPOS_LEGADO.id);
        if (!id) return null;
        return {
          id: id,
          nombre: sessionStorage.getItem(CAMPOS_LEGADO.nombre) || '',
          email: sessionStorage.getItem(CAMPOS_LEGADO.email) || '',
          estado: sessionStorage.getItem(CAMPOS_LEGADO.estado) || 'PENDIENTE',
          tipoPase: sessionStorage.getItem(CAMPOS_LEGADO.tipoPase) || '',
          token: '',
          recordar: false,
          origen: 'pestana',
        };
      } catch (e) {
        return null;
      }
    },

    /**
     * Guarda la sesión tras un login o registro exitoso.
     * @param {object} respuesta  respuesta del Apps Script
     * @param {boolean|null} recordar  null → usar el valor por defecto de config
     * @param {object} [extras]  datos locales (nombre/email del formulario)
     */
    guardar: function (respuesta, recordar, extras) {
      var r = respuesta || {};
      var e = extras || {};
      var duracionDias = (cfg.sesion && cfg.sesion.duracionDias) || 30;

      var datos = {
        id: r.id_usuario || r.id || e.id || '',
        nombre: r.nombre || e.nombre || '',
        email: r.email || e.email || '',
        estado: (r.estado || e.estado || 'PENDIENTE'),
        tipoPase: r.tipo_pase || r.tipoPase || e.tipoPase || '',
        token: r.token || r.token_sesion || '',
        recordar: recordar === null || typeof recordar === 'undefined'
          ? !!((cfg.sesion && cfg.sesion.recordarPorDefecto))
          : !!recordar,
        guardado: Date.now(),
        expira: Date.now() + duracionDias * 24 * 60 * 60 * 1000,
      };

      if (datos.recordar) escribirAlmacen(datos);
      else escribirAlmacen(null);

      espejarLegado(datos);
      return datos;
    },

    /** Actualiza campos sueltos sin perder el resto. */
    actualizar: function (parcial) {
      var actual = SP.sesion.leer() || {};
      var datos = Object.assign({}, actual, parcial || {});
      if (datos.recordar !== false && leerAlmacen()) escribirAlmacen(datos);
      espejarLegado(datos);
      return datos;
    },

    limpiar: function () {
      escribirAlmacen(null);
      espejarLegado(null);
      try { sessionStorage.clear(); } catch (e) { /* ignorar */ }
    },

    /** ¿Hay sesión y además la cuenta está activa? */
    estaActivo: function () {
      var s = SP.sesion.leer();
      return !!(s && s.id && esActivo(s.estado));
    },

    /** ¿Hay sesión aunque la cuenta siga pendiente de pago? */
    estaLogueado: function () {
      var s = SP.sesion.leer();
      return !!(s && s.id);
    },

    esActivo: esActivo,

    /**
     * Revalida el token contra Apps Script (acción verificar_sesion).
     * Así una sesión vieja o manipulada no desbloquea contenido pago.
     * @returns {Promise<object|null>} la sesión validada, o null si ya no vale
     */
    revalidar: function () {
      var s = SP.sesion.leer();
      if (!s || !s.id) return Promise.resolve(null);

      var tolerante = !(cfg.sesion && cfg.sesion.toleranteSinBackend === false);

      return SP.api
        .post('verificar_sesion', { id_usuario: s.id, token: s.token, email: s.email })
        .then(function (r) {
          if (r && r.exito) {
            // El backend puede confirmar o actualizar estado y tipo de pase
            if (r.estado) s.estado = r.estado;
            if (r.tipo_pase) s.tipoPase = r.tipo_pase;
            if (r.nombre) s.nombre = r.nombre;
            return SP.sesion.actualizar(s);
          }
          // El backend dice explícitamente que la sesión no vale
          SP.sesion.limpiar();
          return null;
        })
        .catch(function () {
          // Backend inalcanzable: si es tolerante, confiamos en el token local
          return tolerante ? s : null;
        });
    },

    /** Cierra sesión en el backend (si se puede) y localmente. */
    cerrar: function () {
      var s = SP.sesion.leer();
      var limpiarLocal = function () { SP.sesion.limpiar(); };

      if (!s || !s.id) { limpiarLocal(); return Promise.resolve(); }

      return SP.api
        .post('cerrar_sesion', { id_usuario: s.id, token: s.token })
        .then(limpiarLocal)
        .catch(limpiarLocal);
    },
  };

  /* ======================================================================
     3. GUARDIA DE RUTAS
     ----------------------------------------------------------------------
     Uso al final del script de una página protegida:
       SP.protegerRuta({ requiereActivo: true });
       SP.protegerRuta({ requiereActivo: false });   // basta con estar logueado
     ====================================================================== */
  SP.protegerRuta = function (opciones) {
    var o = Object.assign({
      requiereActivo: true,
      revalidar: true,
      destino: 'ingreso',
      volver: true,
    }, opciones || {});

    var sesion = SP.sesion.leer();

    function irAIngreso(motivo) {
      var params = {};
      if (o.volver) {
        params.volver = window.location.pathname.split('/').pop() + window.location.search;
      }
      if (motivo) params.motivo = motivo;
      window.location.replace(SP.url(o.destino, params));
    }

    // 1. Sin sesión → al ingreso
    if (!sesion || !sesion.id) { irAIngreso('sesion'); return Promise.resolve(false); }

    // 2. Cuenta pendiente de pago → al pago
    if (o.requiereActivo && !SP.sesion.esActivo(sesion.estado)) {
      if (o.destino === 'ingreso') {
        window.location.replace(SP.url('pago', { email: sesion.email, item: 'pase-permanente' }));
        return Promise.resolve(false);
      }
    }

    // 3. Revalidación opcional contra el backend
    if (!o.revalidar) return Promise.resolve(true);

    return SP.sesion.revalidar().then(function (valida) {
      if (!valida) { irAIngreso('expirada'); return false; }
      if (o.requiereActivo && !SP.sesion.esActivo(valida.estado)) {
        window.location.replace(SP.url('pago', { email: valida.email, item: 'pase-permanente' }));
        return false;
      }
      return true;
    });
  };

  /* ======================================================================
     4. CATÁLOGO Y MONEDA
     ====================================================================== */
  SP.precio = function (valor, moneda) {
    var n = Number(valor);
    if (!n || isNaN(n)) return 'A convenir';
    try {
      return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: moneda || 'ARS',
        maximumFractionDigits: 0,
      }).format(n);
    } catch (e) {
      return '$ ' + n.toLocaleString('es-AR');
    }
  };

  /** Precio de referencia de un ítem (el más bajo de sus opciones). */
  SP.catalogoPrecioDesde = function (item) {
    if (!item || !item.opciones || !item.opciones.length) return 'A convenir';
    var conPrecio = item.opciones.filter(function (op) { return Number(op.precio) > 0; });
    if (!conPrecio.length) return 'A convenir';
    var menor = conPrecio.reduce(function (a, b) {
      return Number(a.precio) <= Number(b.precio) ? a : b;
    });
    return SP.precio(menor.precio, menor.moneda);
  };

  SP.catalogo = {
    todos: function () {
      return Array.isArray(cfg.catalogo) ? cfg.catalogo.slice() : [];
    },
    porTipo: function (tipo) {
      return SP.catalogo.todos().filter(function (it) { return it.tipo === tipo; });
    },
    obtener: function (id) {
      if (!id) return null;
      var lista = SP.catalogo.todos();
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === id) return lista[i];
      }
      return null;
    },
    /** Ítem por defecto (el destacado, o el primero). */
    principal: function () {
      var lista = SP.catalogo.todos();
      if (!lista.length) return null;
      for (var i = 0; i < lista.length; i++) if (lista[i].destacado) return lista[i];
      return lista[0];
    },
    /** Opción de pago por método dentro de un ítem. */
    opcion: function (id, metodo) {
      var item = SP.catalogo.obtener(id);
      if (!item || !item.opciones) return null;
      for (var i = 0; i < item.opciones.length; i++) {
        if (item.opciones[i].metodo === metodo) return item.opciones[i];
      }
      return null;
    },
  };

  /* ======================================================================
     5. ÓRDENES / COMPRAS
     ----------------------------------------------------------------------
     Registra la intención de compra en el Sheet (acción crear_orden) para
     que el pago quede trazado y el acceso se active automáticamente.
     ====================================================================== */
  SP.orden = {
    /**
     * @param {string} itemId
     * @param {string} metodo  'mercadopago' | 'transferencia' | ...
     * @param {object} [extra] datos del comprador
     * @returns {Promise<object>} respuesta con orden_id
     */
    crear: function (itemId, metodo, extra) {
      var item = SP.catalogo.obtener(itemId);
      var opcion = SP.catalogo.opcion(itemId, metodo);
      var sesion = SP.sesion.leer() || {};

      var cuerpo = Object.assign({
        item_id: itemId,
        item_nombre: item ? item.nombre : '',
        item_tipo: item ? item.tipo : '',
        metodo: metodo || '',
        precio: opcion ? opcion.precio : '',
        moneda: opcion ? opcion.moneda : 'ARS',
        id_usuario: sesion.id || '',
        email: sesion.email || '',
        nombre: sesion.nombre || '',
      }, extra || {});

      return SP.api.post('crear_orden', cuerpo);
    },

    /** Consulta si una orden ya fue pagada (para refrescar el acceso). */
    estado: function (ordenId) {
      return SP.api.post('estado_orden', { orden_id: ordenId });
    },
  };

  /* ======================================================================
     6. AYUDAS DE INTERFAZ
     ====================================================================== */
  /** Primer nombre, para saludos cálidos. */
  SP.primerNombre = function (completo) {
    var n = String(completo || '').trim();
    if (!n) return 'Viajero/a';
    return n.split(/\s+/)[0];
  };

  /** Enlace de WhatsApp con mensaje precargado (delegando en main.js si está). */
  SP.wa = function (mensaje) {
    if (typeof SP.whatsapp === 'function') return SP.whatsapp(mensaje);
    var num = (cfg.contacto && cfg.contacto.whatsapp) || '';
    var base = 'https://wa.me/' + num;
    return mensaje ? base + '?text=' + encodeURIComponent(mensaje) : base;
  };

  /**
   * Conecta el botón de cerrar sesión si existe en la página.
   * Busca [data-cerrar-sesion] o #btn-cerrar-sesion.
   */
  SP.conectarCerrarSesion = function (destino) {
    var botones = $$('[data-cerrar-sesion], #btn-cerrar-sesion');
    botones.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        btn.disabled = true;
        SP.sesion.cerrar().then(function () {
          window.location.href = destino || SP.url('inicio');
        });
      });
    });
  };

  /* ======================================================================
     ARRANQUE COMÚN
     ====================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    // Ocultar imágenes rotas conservando el placeholder del contenedor
    $$('img').forEach(function (img) {
      img.addEventListener('error', function () { img.classList.add('is-missing'); });
      if (img.complete && img.naturalWidth === 0) img.classList.add('is-missing');
    });

    // Cerrar sesión desde cualquier cabecera
    SP.conectarCerrarSesion();
  });
})();
