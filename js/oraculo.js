/* ==========================================================================
   ORACULO.JS — El Viaje del Oráculo Evolución
   --------------------------------------------------------------------------
   Un ritual de cinco pasos, robusto y elegante:
     1. Bienvenida
     2. Sintonía numérica → frase, canción, sentido, fase
     3. Cortometraje
     4. Construcción del mapa → elemento de siembra
     5. Vinculación → tiempo + reflexión → cosecha final (webhook Make)
   ========================================================================== */

(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var cfg = SP.config || {};
  var aviso = SP.toast || function (m) { window.alert(m); };

  /* ======================================================================
     ESTADO DEL VIAJE
     ====================================================================== */
  var estado = {
    // Datos del usuario (desde sessionStorage)
    usuarioId: null,
    usuarioNombre: null,
    usuarioEmail: null,
    tipoPase: null,
    
    // Datos del ritual
    numero: null,
    cancion: null,
    frase: null,
    sentido: null,
    fase: null,
    desarrolloFase: null, // <-- AGREGADO: texto largo, solo va al correo
    elemento: null,
    afirmacionElemento: null,
    tiempoLuz: null,
    preguntaTiempo: null,
    reflexionFinal: null
  };

  var filaDatos = null;
  var matrizFrases = null;
  var pasoActual = 1;

  /* ======================================================================
     UTILIDADES
     ====================================================================== */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function setTexto(id, valor) {
    var el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  function mostrarError(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg || '';
  }

  function partirTSV(linea) {
    return linea.split('\t').map(function (v) {
      return v.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
    });
  }

  function traerTexto(url, milisegundos) {
    if (!url) return Promise.reject(new Error('URL no configurada'));
    var control = new AbortController();
    var t = setTimeout(function () { control.abort(); }, milisegundos || 12000);
    return fetch(url, { signal: control.signal })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error('Respuesta HTTP ' + r.status);
        return r.text();
      })
      .catch(function (e) { clearTimeout(t); throw e; });
  }

  /* ======================================================================
     NAVEGACIÓN ENTRE PANTALLAS
     ====================================================================== */
  function actualizarProgreso(paso) {
    $$('.ritual-progress__step').forEach(function (el) {
      var n = parseInt(el.getAttribute('data-step'), 10);
      el.classList.toggle('is-current', n === paso);
      el.classList.toggle('is-done', n < paso);
    });
  }

  function irA(destino) {
    if (pasoActual === 2 && destino > 2 && !estado.numero) {
      aviso('Primero descubrí tu frase para poder continuar.', 'err');
      return;
    }
    if (pasoActual === 4 && destino > 4 && !estado.elemento) {
      aviso('Elegí tu elemento de siembra antes de avanzar.', 'err');
      return;
    }
    if (pasoActual === 5 && destino > 5 && !estado.tiempoLuz) {
      aviso('Elegí en qué tiempo resonás antes de finalizar.', 'err');
      return;
    }

    var salida = document.getElementById('paso-' + pasoActual);
    var entrada = document.getElementById('paso-' + destino);
    if (salida) salida.classList.remove('is-active');
    if (entrada) entrada.classList.add('is-active');

    pasoActual = destino;
    actualizarProgreso(destino);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ======================================================================
     PASO 2 — SINTONÍA NUMÉRICA
     ====================================================================== */
  function iniciarPaso2() {
    var form = $('#form-numero');
    if (!form) return;

    var input = $('#numero-elegido');
    if (input) {
      var min = (cfg.oraculo && cfg.oraculo.minNumero) || 1;
      var max = (cfg.oraculo && cfg.oraculo.maxNumero) || 70;
      input.min = String(min);
      input.max = String(max);
      setTexto('rango-min', min);
      setTexto('rango-max', max);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      consultarNumero();
    });
  }

  function consultarNumero() {
    var input = $('#numero-elegido');
    var boton = $('#btn-numero');
    mostrarError('error-numero', '');

    var valor = input ? String(input.value).trim() : '';
    var num = parseInt(valor, 10);
    var min = (cfg.oraculo && cfg.oraculo.minNumero) || 1;
    var max = (cfg.oraculo && cfg.oraculo.maxNumero) || 70;

    if (!valor || isNaN(num) || num < min || num > max) {
      mostrarError('error-numero', 'Introducí un número válido entre ' + min + ' y ' + max + '.');
      return;
    }

    if (boton) { boton.disabled = true; boton.textContent = 'Consultando la matriz…'; }

    var promesa = matrizFrases
      ? Promise.resolve(matrizFrases)
      : traerTexto((cfg.datos && cfg.datos.oraculo) || '').then(function (cuerpo) {
          matrizFrases = cuerpo.split(/\r?\n/);
          return matrizFrases;
        });

    promesa
      .then(function (filas) {
        var coincidencia = null;
        for (var i = 1; i < filas.length; i++) {
          if (!filas[i].trim()) continue;
          var cols = partirTSV(filas[i]);
          if (!cols || !cols[0]) continue;
          var limpio = cols[0].replace(/[^0-9]/g, '').trim();
          if (limpio === String(num)) { coincidencia = cols; break; }
        }

        if (!coincidencia) {
          mostrarError('error-numero', 'No encontramos esa frecuencia. Probá con otro número.');
          return;
        }

        filaDatos = coincidencia;
        estado.numero   = String(num);
        estado.frase    = coincidencia[1] || 'Sin frase';
        estado.cancion  = coincidencia[5] || 'Sin canción';
        estado.sentido  = coincidencia[2] || 'Sin sentido creativo';
        estado.fase     = coincidencia[6] || 'Sin fase asignada';
        estado.desarrolloFase = coincidencia[7] || '';

        if (input) input.disabled = true;
        if (boton) { boton.disabled = true; boton.textContent = 'Frecuencia fijada'; }

        setTexto('display-vibracion', 'N° ' + num);
        setTexto('display-frase', '"' + estado.frase + '"');
        setTexto('display-cancion', estado.cancion);

        setTexto('ctx-numero', estado.numero);
        setTexto('ctx-cancion', estado.cancion);
        setTexto('ctx-frase', '"' + estado.frase + '"');
        setTexto('ctx-sentido', estado.sentido);
        setTexto('ctx-fase', estado.fase);
        setTexto('ctx-conexion-siembra', coincidencia[3] || 'Sin conexión');

        var linkAlbum = $('#link-album');
        if (linkAlbum && cfg.oraculo && cfg.oraculo.videoAlbum) linkAlbum.href = cfg.oraculo.videoAlbum;

        var contenedorFrase = $('#frase-p2');
        if (contenedorFrase) {
          contenedorFrase.hidden = false;
          contenedorFrase.classList.add('revelado');
        }
        aviso('Tu vibración quedó fijada: ' + estado.frase, 'ok');
      })
      .catch(function (err) {
        console.error('[Oráculo] Error al consultar la sintonía:', err);
        mostrarError('error-numero', 'No pudimos leer la matriz de frecuencias.');
      })
      .then(function () {
        if (boton && !estado.numero) { boton.disabled = false; boton.textContent = 'Descubrir frase'; }
      });
  }

  /* ======================================================================
     PASO 4 — ELEMENTO DE SIEMBRA
     ====================================================================== */
  var MAPA_ELEMENTOS = {
    agua:   { titulo: '💧 AGUA · Intuición',     idx: 9 },
    fuego:  { titulo: '🔥 FUEGO · Impulso',      idx: 10 },
    tierra: { titulo: '🪵 TIERRA · Sabiduría',   idx: 11 },
    aire:   { titulo: '💨 AIRE · Integración',   idx: 12 }
  };

  function iniciarElementos() {
    $$('[data-elemento]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        revelarElemento(btn.getAttribute('data-elemento'));
      });
    });
  }

  function revelarElemento(tipo) {
    if (!filaDatos) { aviso('Primero descubrí tu frase en el paso II.', 'err'); return; }
    if (estado.elemento) return;

    var def = MAPA_ELEMENTOS[tipo];
    if (!def) return;

    estado.elemento = def.titulo;
    estado.afirmacionElemento = filaDatos[def.idx] || 'Sintonía en silencio.';

    setTexto('elemento-titulo', def.titulo);
    setTexto('elemento-texto', estado.afirmacionElemento);

    var caja = $('#revela-elemento');
    if (caja) { caja.hidden = false; caja.classList.add('revelado'); }

    $$('[data-elemento]').forEach(function (b) {
      if (b.getAttribute('data-elemento') === tipo) b.classList.add('is-chosen');
      else b.classList.add('is-locked');
    });
  }

  /* ======================================================================
     PASO 5 — TIEMPO Y REFLEXIÓN
     ====================================================================== */
  var MAPA_TIEMPOS = {
    noche:     { titulo: '🌌 NOCHE · Profundidad', idx: 14 },
    atardecer: { titulo: '🌇 ATARDECER · Voluntad', idx: 15 },
    aurora:    { titulo: '🔮 AURORA · Sentidos',    idx: 16 },
    amanecer:  { titulo: '🌅 AMANECER · Claridad',  idx: 17 }
  };

  function iniciarTiempos() {
    $$('[data-tiempo]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        revelarTiempo(btn.getAttribute('data-tiempo'));
      });
    });
  }

  function revelarTiempo(tipo) {
    if (!filaDatos) { aviso('Primero descubrí tu frase en el paso II.', 'err'); return; }
    if (estado.tiempoLuz) return;

    var def = MAPA_TIEMPOS[tipo];
    if (!def) return;

    estado.tiempoLuz = def.titulo;
    estado.preguntaTiempo = filaDatos[def.idx] || 'Reflexión integrada.';

    setTexto('tiempo-titulo', def.titulo);
    setTexto('tiempo-texto', estado.preguntaTiempo);

    var caja = $('#revela-tiempo');
    if (caja) { caja.hidden = false; caja.classList.add('revelado'); }

    $$('[data-tiempo]').forEach(function (b) {
      if (b.getAttribute('data-tiempo') === tipo) b.classList.add('is-chosen');
      else b.classList.add('is-locked');
    });
  }

  /* ======================================================================
     COSECHA FINAL
     ====================================================================== */
  function iniciarFinal() {
  var boton = $('#btn-finalizar');
  if (!boton) return;
  
  boton.addEventListener('click', function () {
    var area = $('#reflexion-final');
    var reflexion = area ? area.value.trim() : '';
    mostrarError('error-reflexion', '');
    
    if (!estado.tiempoLuz) {
      aviso('Elegí en qué tiempo resonás antes de finalizar.', 'err');
      return;
    }
    if (!reflexion) {
      mostrarError('error-reflexion', 'Escribí tu reflexión para completar la bitácora.');
      if (area) area.focus();
      return;
    }
    
    estado.reflexionFinal = reflexion;
    var original = boton.innerHTML;
    boton.disabled = true;
    boton.textContent = 'Cosechando mapa…';

    function terminar(mensaje, tipo) {
      aviso(mensaje, tipo || 'ok');
      setTexto('cierre-mensaje', mensaje);
      var salida = document.getElementById('paso-' + pasoActual);
      var entrada = document.getElementById('paso-final');
      if (salida) salida.classList.remove('is-active');
      if (entrada) entrada.classList.add('is-active');
      pasoActual = 6;
      actualizarProgreso(6);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      boton.disabled = false;
      boton.innerHTML = original;
    }

    // Enviar la bitácora al backend (Apps Script + MailApp)
    SP.api.post('enviar_bitacora', {
      id_usuario:         estado.usuarioId,
      email:              estado.usuarioEmail,
      nombre:             estado.usuarioNombre,
      numero:             estado.numero,
      frase:              estado.frase,
      cancion:            estado.cancion,
      sentido:            estado.sentido,
      fase:               estado.fase,
      desarrolloFase:     estado.desarrolloFase,
      elemento:           estado.elemento,
      afirmacionElemento: estado.afirmacionElemento,
      tiempoLuz:          estado.tiempoLuz,
      preguntaTiempo:     estado.preguntaTiempo,
      reflexionFinal:     estado.reflexionFinal
    })
      .then(function (respuesta) {
        if (respuesta && respuesta.exito) {
          terminar('¡Viaje concluido con éxito! Tu bitácora fue enviada a tu correo.', 'ok');
        } else {
          throw new Error(respuesta && respuesta.error ? respuesta.error : 'Respuesta inválida');
        }
      })
      .catch(function (err) {
        console.error('[Oráculo] Falla en la cosecha:', err);
        // Aun si falla el correo, el viaje se considera concluido (no bloqueamos al viajero)
        terminar('Tu viaje quedó registrado. Si no recibís el correo, avisale a Simón.', 'info');
      });
  });
}

  /* ======================================================================
     ARRANQUE Y PROTECCIÓN DE RUTA
     ====================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    // 1. Guardia de acceso unificada (una sola fuente de verdad: SP.sesion)
    var usuarioId = sessionStorage.getItem('usuario_id');
    var usuarioEstado = sessionStorage.getItem('usuario_estado');

    if (window.SP && SP.sesion) {
      var ses = SP.sesion.leer();
      if (!ses || !ses.id) {
        window.location.replace(SP.url('ingreso', { volver: 'oraculo.html', motivo: 'sesion' }));
        return;
      }
      if (!SP.sesion.esActivo(ses.estado)) {
        // Tiene cuenta pero todavía no pagó: lo llevamos a activar el pase
        window.location.replace(SP.url('pago', { email: ses.email, item: 'pase-permanente' }));
        return;
      }
      // Revalidación en segundo plano: no bloquea el viaje, pero si el token
      // ya no vale, el viajero vuelve al ingreso con un aviso claro.
      SP.sesion.revalidar().then(function (valida) {
        if (!valida) {
          aviso('Tu sesión expiró. Volvé a ingresar para continuar el viaje.', 'err');
          setTimeout(function () {
            window.location.replace(SP.url('ingreso', { volver: 'oraculo.html', motivo: 'expirada' }));
          }, 1600);
        }
      });
    } else if (!usuarioId || usuarioEstado !== 'ACTIVO') {
      // Respaldo si sp-api.js no estuviera cargado
      window.location.href = 'auth.html';
      return;
    }

    // 2. Cargar datos del usuario en el estado (desde el gestor de sesión)
    var sesion = (window.SP && SP.sesion && SP.sesion.leer()) || {};
    estado.usuarioId = sesion.id || usuarioId;
    estado.usuarioNombre = sesion.nombre || sessionStorage.getItem('usuario_nombre');
    estado.usuarioEmail = sesion.email || sessionStorage.getItem('usuario_email');
    estado.tipoPase = sesion.tipoPase || sessionStorage.getItem('usuario_tipo_pase');

    // 3. Personalizar la bienvenida (el HTML usa #nombre-viajero)
    var saludo = document.getElementById('nombre-viajero') ||
                 document.getElementById('saludo-bienvenida');
    if (saludo && estado.usuarioNombre) {
      saludo.textContent = estado.usuarioNombre.split(' ')[0];
    }

    // 4. Inicializar los pasos
    iniciarPaso2();
    iniciarElementos();
    iniciarTiempos();
    iniciarFinal();

    // 5. Botones de navegación
    $$('[data-ir]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var destino = parseInt(btn.getAttribute('data-ir'), 10);
        if (!isNaN(destino)) irA(destino);
      });
    });

    // 6. Bloqueo de la rueda del mouse en el input de sintonía
    var inputNum = $('#numero-elegido');
    if (inputNum) {
      inputNum.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    }

    actualizarProgreso(1);
    console.log('[Oráculo] El viaje está listo para:', estado.usuarioEmail);
  });
})();