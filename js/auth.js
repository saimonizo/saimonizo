/* ==========================================================================
   AUTH.JS — INGRESO, REGISTRO Y RECUPERACIÓN
   --------------------------------------------------------------------------
   Un solo flujo, sellado y predecible:

     1. Pestañas Ingresar / Registrarme (con estado claro y accesible)
     2. Login     → guarda la sesión (con "Recordarme") y decide el destino
                    · cuenta ACTIVA   → Oráculo
                    · cuenta PENDIENTE → pago (a elegir su pase)
     3. Registro  → crea la cuenta y lleva al pago
     4. Recuperar → envía la clave de recuperación por correo
     5. Volver    → ?volver=... regresa al destino que pidió la página

   Toda la comunicación con Google Sheets + Apps Script pasa por SP.api.
   ========================================================================== */
(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var cfg = SP.config || {};
  var aviso = SP.aviso || function (m) { window.alert(m); };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(v) { return SP.esc ? SP.esc(v) : String(v || ''); }

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /** Página a la que volver tras iniciar sesión (?volver=...). */
  function destinoVolver() {
    var v = SP.param ? SP.param('volver') : '';
    // Solo rutas relativas simples del propio sitio (evita redirecciones externas)
    if (!v || /^[a-z]+:\/\//i.test(v) || v.indexOf('//') === 0) return '';
    return v;
  }

  function ir(ruta) { window.location.href = ruta; }

  /* ======================================================================
     ESTADO DE BOTONES
     ====================================================================== */
  function ocupado(btn, texto) {
    if (!btn) return;
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> ' + esc(texto || 'Procesando…');
  }
  function libre(btn) {
    if (!btn) return;
    btn.disabled = false;
    if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
  }

  /* ======================================================================
     1. PESTAÑAS
     ====================================================================== */
  function iniciarPestanas() {
    var tabs = $$('.auth-tab');
    var forms = $$('.auth-form');
    if (!tabs.length) return;

    function activar(id) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-target') === id;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      forms.forEach(function (f) { f.classList.toggle('is-active', f.id === id); });
      $$('.field-error').forEach(function (el) { el.textContent = ''; });

      var activo = document.getElementById(id);
      var foco = activo && activo.querySelector('input:not([type="hidden"]), select, textarea');
      if (foco) setTimeout(function () { foco.focus(); }, 60);

      // Reflejar la pestaña en la URL para poder compartir el enlace directo
      if (window.history && window.history.replaceState) {
        var url = new URL(window.location.href);
        if (id === 'form-registro') url.searchParams.set('modo', 'registro');
        else url.searchParams.delete('modo');
        window.history.replaceState({}, '', url.toString());
      }
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { activar(tab.getAttribute('data-target')); });
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var i = tabs.indexOf(tab);
        var siguiente = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        siguiente.focus();
        activar(siguiente.getAttribute('data-target'));
      });
    });

    // Permitir entrar directo al registro con ?modo=registro
    if ((SP.param ? SP.param('modo') : '') === 'registro') activar('form-registro');
  }

  /* ======================================================================
     2. MOSTRAR / OCULTAR CONTRASEÑA
     ====================================================================== */
  function iniciarVerPassword() {
    $$('.field-password__toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.getAttribute('data-para'));
        if (!input) return;
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        btn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
        btn.setAttribute('aria-pressed', visible ? 'false' : 'true');
        var ico = btn.querySelector('i');
        if (ico) ico.className = visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
      });
    });
  }

  /* ======================================================================
     3. MEDIDOR DE FUERZA DE CONTRASEÑA
     ====================================================================== */
  function fuerzaDe(pass) {
    var p = String(pass || '');
    var puntos = 0;
    if (p.length >= 6) puntos++;
    if (p.length >= 10) puntos++;
    if (/[A-ZÁÉÍÓÚÑ]/.test(p) && /[a-záéíóúñ]/.test(p)) puntos++;
    if (/[0-9]/.test(p)) puntos++;
    if (/[^A-Za-z0-9]/.test(p)) puntos++;
    if (p.length < 6) puntos = 1;
    return Math.max(1, Math.min(4, puntos));
  }

  function iniciarMedidor() {
    var input = $('#reg-password');
    var medidor = $('#medidor-password');
    if (!input || !medidor) return;

    var barras = $$('.pass-meter__bar', medidor);
    var leyenda = $('#medidor-texto');

    input.addEventListener('input', function () {
      if (!input.value) {
        barras.forEach(function (b) { b.className = 'pass-meter__bar'; });
        if (leyenda) leyenda.textContent = '';
        return;
      }
      var nivel = fuerzaDe(input.value);
      var clase = nivel <= 1 ? 'is-weak' : nivel === 2 ? 'is-mid' : 'is-strong';
      var nombres = { 1: 'Débil', 2: 'Aceptable', 3: 'Buena', 4: 'Muy fuerte' };

      barras.forEach(function (b, i) {
        b.className = 'pass-meter__bar' + (i < nivel ? ' is-on ' + clase : '');
      });
      if (leyenda) leyenda.textContent = nombres[nivel];
    });
  }

  /* ======================================================================
     4. LOGIN
     ====================================================================== */
  function iniciarLogin() {
    var form = $('#form-login');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var btn = $('#btn-login');
      var errorDiv = $('#error-login');
      var email = ($('#login-email') || {}).value || '';
      var password = ($('#login-password') || {}).value || '';
      var recordarEl = $('#login-recordar');

      email = email.trim();
      if (errorDiv) errorDiv.textContent = '';

      if (!RE_EMAIL.test(email)) {
        if (errorDiv) errorDiv.textContent = 'Revisá el formato de tu correo electrónico.';
        return;
      }
      if (!password) {
        if (errorDiv) errorDiv.textContent = 'Escribí tu contraseña para continuar.';
        return;
      }

      ocupado(btn, 'Verificando…');

      SP.api.post('login', { email: email, password: password })
        .then(function (data) {
          if (!data.exito) {
            if (errorDiv) errorDiv.textContent = data.error || 'Correo o contraseña incorrectos.';
            libre(btn);
            return;
          }

          var recordar = recordarEl ? !!recordarEl.checked : null;
          var sesion = SP.sesion.guardar(data, recordar, { email: email });
          var nombre = SP.primerNombre(sesion.nombre);

          if (SP.sesion.esActivo(sesion.estado)) {
            aviso('Bienvenido/a de vuelta, ' + nombre + '.', 'ok');
            setTimeout(function () { ir(destinoVolver() || SP.url('oraculo')); }, 700);
          } else {
            aviso('Tu cuenta está lista. Falta activar tu pase.', 'info');
            setTimeout(function () {
              ir(SP.url('pago', { email: sesion.email, item: 'pase-permanente' }));
            }, 800);
          }
        })
        .catch(function (err) {
          console.error('[Auth] Falló el login:', err);
          if (errorDiv) {
            errorDiv.textContent = 'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.';
          }
          libre(btn);
        });
    });
  }

  /* ======================================================================
     5. REGISTRO
     ====================================================================== */
  function iniciarRegistro() {
    var form = $('#form-registro');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var btn = $('#btn-registro');
      var errorDiv = $('#error-registro');

      var nombre = (($('#reg-nombre') || {}).value || '').trim();
      var email = (($('#reg-email') || {}).value || '').trim();
      var password = ($('#reg-password') || {}).value || '';
      var password2 = ($('#reg-password2') || {}).value || '';
      var whatsapp = (($('#reg-whatsapp') || {}).value || '').trim();
      var ubicacion = (($('#reg-ubicacion') || {}).value || '').trim();
      var terminosEl = $('#reg-terminos');

      if (errorDiv) errorDiv.textContent = '';

      if (nombre.length < 2) {
        if (errorDiv) errorDiv.textContent = 'Escribí tu nombre completo.';
        return;
      }
      if (!RE_EMAIL.test(email)) {
        if (errorDiv) errorDiv.textContent = 'Revisá el formato de tu correo electrónico.';
        return;
      }
      if (password.length < 6) {
        if (errorDiv) errorDiv.textContent = 'La contraseña necesita al menos 6 caracteres.';
        return;
      }
      if (password2 && password !== password2) {
        if (errorDiv) errorDiv.textContent = 'Las dos contraseñas no coinciden.';
        return;
      }
      if (terminosEl && !terminosEl.checked) {
        if (errorDiv) errorDiv.textContent = 'Necesitamos tu aceptación para poder enviarte la bitácora.';
        return;
      }

      ocupado(btn, 'Creando tu espacio…');

      SP.api.post('registrar', {
        nombre: nombre,
        email: email,
        password: password,
        whatsapp: whatsapp,
        ubicacion: ubicacion,
      })
        .then(function (data) {
          if (!data.exito) {
            if (errorDiv) errorDiv.textContent = data.error || 'No pudimos completar el registro.';
            libre(btn);
            return;
          }

          // Aviso al webhook de automatización (Make) sin bloquear el flujo
          var hook = (cfg.webhooks && cfg.webhooks.registro) || '';
          if (hook) {
            try {
              fetch(hook, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  Nombre: nombre, Correo: email, Whatsapp: whatsapp, Ubicacion: ubicacion,
                }),
              }).catch(function () { /* el registro ya quedó en el Sheet */ });
            } catch (err) { /* ignorar */ }
          }

          var sesion = SP.sesion.guardar(data, true, {
            id: data.id_usuario || '',
            nombre: nombre,
            email: email,
            estado: 'PENDIENTE',
          });

          aviso('¡Tu espacio quedó creado! Ahora elegí tu pase.', 'ok');
          setTimeout(function () {
            ir(SP.url('pago', { email: sesion.email, item: 'pase-permanente', nuevo: '1' }));
          }, 900);
        })
        .catch(function (err) {
          console.error('[Auth] Falló el registro:', err);
          if (errorDiv) {
            errorDiv.textContent = 'No pudimos crear tu cuenta. Revisá tu conexión e intentá de nuevo.';
          }
          libre(btn);
        });
    });
  }

  /* ======================================================================
     6. RECUPERAR CONTRASEÑA
     ====================================================================== */
  function iniciarRecuperar() {
    var form = $('#form-recuperar');
    if (!form) return;

    var panelRecuperar = $('#form-recuperar');
    var btnAbrir = $('#btn-abrir-recuperar');

    if (btnAbrir && panelRecuperar) {
      btnAbrir.addEventListener('click', function (e) {
        e.preventDefault();
        var oculto = panelRecuperar.classList.contains('hidden');
        SP.mostrar(panelRecuperar, oculto);
        btnAbrir.setAttribute('aria-expanded', oculto ? 'true' : 'false');
        if (oculto) {
          var campo = $('#rec-email');
          var correoLogin = ($('#login-email') || {}).value || '';
          if (campo && !campo.value && correoLogin) campo.value = correoLogin.trim();
          if (campo) campo.focus();
        }
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#btn-recuperar');
      var errorDiv = $('#error-recuperar');
      var okDiv = $('#ok-recuperar');
      var email = (($('#rec-email') || {}).value || '').trim();
      if (errorDiv) errorDiv.textContent = '';
      if (okDiv) okDiv.textContent = '';

      if (!RE_EMAIL.test(email)) {
        if (errorDiv) errorDiv.textContent = 'Revisá el formato de tu correo electrónico.';
        return;
      }

      ocupado(btn, 'Enviando…');

      SP.api.post('solicitar_reset', { email: email })
        .then(function (data) {
          libre(btn);
          if (data.exito) {
            if (okDiv) {
              okDiv.textContent = data.mensaje ||
                'Listo. Si ese correo está registrado, vas a recibir un enlace para crear una nueva contraseña.';
            }
          } else {
            if (errorDiv) errorDiv.textContent = data.error || 'No pudimos enviar el enlace. Intentá más tarde.';
          }
        })
        .catch(function () {
          libre(btn);
          if (errorDiv) errorDiv.textContent = 'No pudimos conectarnos con el servidor. Intentá de nuevo.';
        });
    });
  }

  /* ======================================================================
     7. SESIÓN YA INICIADA
     ----------------------------------------------------------------------
     Si alguien llega a auth.html con la sesión abierta, no le hacemos
     escribir todo otra vez: le ofrecemos continuar.
     ====================================================================== */
  function iniciarSesionExistente() {
    var sesion = SP.sesion.leer();
    if (!sesion || !sesion.id) return;

    var barra = $('#aviso-sesion');
    if (!barra) return;

    var activo = SP.sesion.esActivo(sesion.estado);
    var destino = activo ? (destinoVolver() || SP.url('oraculo'))
                         : SP.url('pago', { email: sesion.email, item: 'pase-permanente' });
    var etiqueta = activo ? 'Continuar al Oráculo' : 'Completar mi pase';

    barra.innerHTML =
      '<div class="aviso ' + (activo ? 'aviso--ok' : 'aviso--warn') + '">' +
        '<i class="fa-solid ' + (activo ? 'fa-circle-check' : 'fa-hourglass-half') + '" aria-hidden="true"></i>' +
        '<div class="aviso__body">' +
          '<p><strong>Ya iniciaste sesión como ' + esc(sesion.email) + '.</strong><br>' +
          (activo ? 'Tu pase está activo.' : 'Tu cuenta todavía está pendiente de pago.') + '</p>' +
          '<div class="btn-row" style="justify-content:flex-start">' +
            '<a class="btn btn--primary btn--sm" href="' + esc(destino) + '">' +
              '<i class="fa-solid fa-arrow-right" aria-hidden="true"></i> ' + etiqueta +
            '</a>' +
            '<button class="btn btn--quiet btn--sm" type="button" id="btn-salir-bar">Usar otra cuenta</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    SP.mostrar(barra, true);

    var salir = $('#btn-salir-bar');
    if (salir) {
      salir.addEventListener('click', function () {
        salir.disabled = true;
        SP.sesion.cerrar().then(function () {
          SP.mostrar(barra, false);
          barra.innerHTML = '';
          aviso('Sesión cerrada. Podés ingresar con otra cuenta.', 'info');
        });
      });
    }
  }

  /* ======================================================================
     ARRANQUE
     ====================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    iniciarPestanas();
    iniciarVerPassword();
    iniciarMedidor();
    iniciarLogin();
    iniciarRegistro();
    iniciarRecuperar();
    iniciarSesionExistente();
  });
})();
