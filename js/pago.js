/* ==========================================================================
PAGO.JS — CHECKOUT DEL ECOSISTEMA
Una sola página de pago que sirve para CUALQUIER ítem del catálogo:
el pase permanente del Oráculo, cursos, futuros productos o experiencias.
URL:  pago.html?item=pase-permanente&email=...
Resuelve el ítem (por ?item= o el principal del catálogo)
Registra la intención de compra (acción crear_orden) → queda en el Sheet
Dibuja los métodos de pago con sus precios reales
Arma el WhatsApp de transferencia con el mensaje ya redactado
Ofrece "Ya pagué, verificar mi acceso" para refrescar el estado
Si la cuenta ya está activa, muestra el estado de éxito en lugar del cobro
========================================================================== */
(function () {
'use strict';
var SP = (window.SP = window.SP || {});
var cfg = SP.config || {};
var aviso = SP.aviso || function (m) { window.alert(m); };
function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
function esc(v) { return SP.esc ? SP.esc(v) : String(v || ''); }
var item = null;
var sesion = null;
var ordenId = '';
/* ======================================================================
UTILIDADES DE INTERFAZ
====================================================================== */
function setTexto(id, valor) {
var el = document.getElementById(id);
if (el) el.textContent = valor;
}
function mostrar(id, visible) {
var el = document.getElementById(id);
if (el) SP.mostrar(el, visible);
}
/* ======================================================================
RESOLVER EL ÍTEM
====================================================================== */
function resolverItem() {
var id = SP.param ? SP.param('item') : '';
item = (id && SP.catalogo.obtener(id)) || SP.catalogo.principal();
if (!item) {
  // Sin catálogo configurado: la página sigue funcionando con los
  // textos que ya están escritos en el HTML.
  mostrar('checkout-vacio', true);
  return false;
}
return true;
}
/* ======================================================================
CABECERA DEL ÍTEM Y RESUMEN
====================================================================== */
function pintarItem() {
setTexto('titulo-pago', 'Activar: ' + item.nombre);
setTexto('eyebrow-pago', item.tipo === 'pase' ? 'Pase de acceso' : 'Compra');
setTexto('orden-item', item.nombre);
setTexto('orden-tipo', item.tipo === 'pase' ? 'Acceso permanente'
: item.tipo === 'curso' ? 'Curso' : 'Producto');
var lead = $('#lead-pago');
 if (lead) lead.textContent = item.descripcion || '';
 // Datos del comprador: sesión primero, luego ?email= de la URL
 var email = (sesion && sesion.email) || (SP.param ? SP.param('email') : '') || '';
 setTexto('email-usuario', email || '—');
 setTexto('orden-email', email || '—');
 // Estado de la cuenta (píldora)
 var pildora = $('#pildora-cuenta');
 if (pildora) {
   if (sesion && sesion.id) {
     var activo = SP.sesion.esActivo(sesion.estado);
     pildora.className = 'pill ' + (activo ? 'pill--ok' : 'pill--warn');
     pildora.innerHTML = '<i class="fa-solid ' +
       (activo ? 'fa-circle-check' : 'fa-hourglass-half') + '" aria-hidden="true"></i> ' +
       (activo ? 'Cuenta activa' : 'Cuenta pendiente');
     SP.mostrar(pildora, true);
   } else {
     SP.mostrar(pildora, false);
   }
 }
 // Bloque de aviso para quien llegó sin cuenta
 var sinCuenta = $('#aviso-sin-cuenta');
 if (sinCuenta) {
   if (sesion && sesion.id) {
     SP.mostrar(sinCuenta, false);
     sinCuenta.innerHTML = '';
   } else {
     sinCuenta.innerHTML =
       '<div class="aviso aviso--warn">' +
         '<i class="fa-solid fa-user-plus" aria-hidden="true"></i>' +
         '<div class="aviso__body">' +
           '<p><strong>¿Todavía no creaste tu cuenta?</strong><br>' +
           'El pago activa el acceso a tu correo, así que necesitamos tu cuenta primero. ' +
           'Crearla te lleva menos de un minuto.</p>' +
           '<a class="btn btn--primary btn--sm" href="' +
             esc(SP.url('ingreso', { modo: 'registro' })) + '">' +
             '<i class="fa-solid fa-user-plus" aria-hidden="true"></i> Crear mi cuenta</a>' +
         '</div>' +
       '</div>';
     SP.mostrar(sinCuenta, true);
   }
 }
}
/* ======================================================================
MÉTODOS DE PAGO
====================================================================== */
function mensajeWhatsApp(opcion) {
var lineas = [
'Hola Simón, quiero activar ' + item.nombre + ' en Oráculo Evolución.',
'',
];
if (sesion && sesion.email) lineas.push('📧 Correo: ' + sesion.email);
if (sesion && sesion.nombre) lineas.push('👤 Nombre: ' + sesion.nombre);
if (opcion && Number(opcion.precio) > 0) {
lineas.push('💳 Método: ' + opcion.etiqueta);
lineas.push('💰 Monto: ' + SP.precio(opcion.precio, opcion.moneda));
}
if (ordenId) lineas.push('🔖 Orden: ' + ordenId);
lineas.push('', '¿Me pasás los datos para completar el pago?');
return SP.wa(lineas.join('\n'));
}
function plantillaMetodo(opcion) {
  // ✨ NUEVO: detectar Mercado Pago y generar botón dinámico
  var esMP = opcion.metodo === 'mercadopago';
  var icono = esMP ? 'fa-solid fa-credit-card'
    : opcion.metodo === 'transferencia' ? 'fa-brands fa-whatsapp'
    : 'fa-solid fa-handshake';
  var accion;

  if (esMP) {
    // ✨ NUEVO: botón que genera el link de MP dinámicamente
    accion = '<button type="button" class="btn ' + (opcion.destacado ? 'btn--gold' : 'btn--primary') + ' btn--block"' +
      ' data-mp-generar="true"' +
      ' data-precio="' + esc(opcion.precio) + '"' +
      ' data-moneda="' + esc(opcion.moneda) + '"' +
      ' data-metodo="' + esc(opcion.metodo) + '">' +
      '<i class="' + icono + '" aria-hidden="true"></i> Pagar con ' + esc(opcion.etiqueta) +
      '</button>';
  } else if (opcion.url) {
    accion = '<a class="btn ' + (opcion.destacado ? 'btn--gold' : 'btn--primary') + ' btn--block"' +
      ' href="' + esc(opcion.url) + '" target="_blank" rel="noopener"' +
      ' data-pago-metodo="' + esc(opcion.metodo) + '">' +
      '<i class="' + icono + '" aria-hidden="true"></i> Pagar con ' + esc(opcion.etiqueta) +
      '</a>';
  } else {
    accion = '<a class="btn btn--primary btn--block" href="' + esc(mensajeWhatsApp(opcion)) + '"' +
      ' target="_blank" rel="noopener" data-pago-metodo="' + esc(opcion.metodo) + '">' +
      '<i class="' + icono + '" aria-hidden="true"></i> Coordinar por WhatsApp' +
      '</a>';
  }

  return '' +
    '<article class="metodo' + (opcion.destacado ? ' metodo--destacado' : '') + '">' +
      '<span class="metodo__ico"><i class="' + icono + '" aria-hidden="true"></i></span>' +
      '<div class="metodo__body">' +
        '<div class="metodo__cabecera">' +
          '<h3>' + esc(opcion.etiqueta) + '</h3>' +
          '<span class="metodo__precio">' + esc(SP.precio(opcion.precio, opcion.moneda)) + '</span>' +
        '</div>' +
        '<p class="metodo__nota">' + esc(opcion.detalle || '') +
          (opcion.nota ? ' ' + esc(opcion.nota) : '') + '</p>' +
        accion +
      '</div>' +
    '</article>';
}
function pintarMetodos() {
var cont = $('#metodos-pago');
if (!cont) return;
var opciones = (item.opciones || []).slice();
 if (!opciones.length) {
   // Ítem a coordinar: solo WhatsApp
   cont.innerHTML = plantillaMetodo({
     metodo: 'coordinacion',
     etiqueta: 'Coordinar',
     detalle: 'Acordamos precio y forma de pago por chat',
     precio: 0,
     moneda: 'ARS',
     url: '',
     destacado: true,
     nota: '',
   });
   setTexto('orden-total', 'A convenir');
   return;
 }
 // Destacado primero, luego el resto
 opciones.sort(function (a, b) { return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0); });
 cont.innerHTML = opciones.map(plantillaMetodo).join('');
 var principal = opciones[0];
 setTexto('orden-total', SP.precio(principal.precio, principal.moneda));
 setTexto('orden-metodo', principal.etiqueta);
 setTexto('orden-monto', SP.precio(principal.precio, principal.moneda));
 // Los enlaces de WhatsApp necesitan el ordenId y el email: se recalculan
 // cuando la orden termina de registrarse (ver registrarOrden).
 $$('[data-pago-metodo="transferencia"]', cont).forEach(function (a) {
   a.setAttribute('href', mensajeWhatsApp(SP.catalogo.opcion(item.id, 'transferencia')));
 });
}
/* ======================================================================
REGISTRAR LA ORDEN
====================================================================== */
function registrarOrden() {
if (!item || !sesion || !sesion.id) return;
SP.orden.crear(item.id, (item.opciones && item.opciones[0] && item.opciones[0].metodo) || '', {
  origen: SP.param ? SP.param('nuevo') === '1' ? 'registro' : 'checkout' : 'checkout',
})
  .then(function (r) {
    if (r && r.exito && (r.orden_id || r.id_orden)) {
      ordenId = r.orden_id || r.id_orden;
      setTexto('orden-id', ordenId);
      mostrar('fila-orden-id', true);
      // Refrescar los enlaces de WhatsApp para que incluyan la orden
      pintarMetodos();
    }
  })
  .catch(function (err) {
    console.warn('[Pago] No se pudo registrar la orden en el backend:', err);
  });
}
/* ======================================================================
ESTADO ACTIVO (ya tiene el pase)
====================================================================== */
function pintarActivo() {
mostrar('bloque-activo', true);
mostrar('bloque-pago', false);
var destino = item && item.acceso ? SP.url(item.acceso === 'oraculo' ? 'oraculo' : (item.acceso))
                                  : SP.url('oraculo');
var btn = $('#btn-ir-acceso');
if (btn) btn.setAttribute('href', destino);
var btnEspacio = $('#btn-ir-espacio');
if (btnEspacio) btnEspacio.setAttribute('href', SP.url('espacio'));
setTexto('titulo-pago', 'Tu acceso ya está activo');
setTexto('lead-pago', 'No hace falta pagar de nuevo: tu pase permanente ya está vigente.');
}
/* ======================================================================
VERIFICAR ACCESO
====================================================================== */
function conectarVerificar() {
var btn = $('#btn-verificar');
if (!btn) return;
btn.addEventListener('click', function (e) {
   e.preventDefault();
   if (!sesion || !sesion.id) {
     aviso('Primero ingresá con tu cuenta para poder verificar el acceso.', 'err');
     setTimeout(function () {
       window.location.href = SP.url('ingreso', { volver: 'pago.html' });
     }, 1200);
     return;
   }
   btn.disabled = true;
   btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Verificando…';
   SP.sesion.revalidar().then(function (valida) {
     if (valida && SP.sesion.esActivo(valida.estado)) {
       sesion = valida;
       aviso('¡Pago confirmado! Tu acceso está abierto.', 'ok');
       pintarActivo();
       return;
     }
     btn.disabled = false;
     btn.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Ya pagué, verificar mi acceso';
     aviso('Todavía no registramos tu pago. Si fue por transferencia, puede demorar unos minutos.', 'info');
   }).catch(function () {
     btn.disabled = false;
     btn.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Ya pagué, verificar mi acceso';
     aviso('No pudimos consultar el estado. Revisá tu conexión e intentá de nuevo.', 'err');
   });
 });
}
/* ======================================================================
REGLAS DE PAGO (qué pasa después)
====================================================================== */
function pintarReglas() {
var lista = $('#pasos-post-pago');
if (!lista) return;
var pasos = [
  'Completá el pago con el método que prefieras.',
  'Si pagás por transferencia, activamos tu acceso apenas se acredita (suele ser en minutos).',
  'Si pagás con Mercado Pago, la confirmación es automática.',
  'Volvé acá y tocá <strong>“Ya pagué, verificar mi acceso”</strong>, o ingresá desde tu cuenta.',
  'Listo: el Oráculo queda desbloqueado para vos, de forma permanente.',
];
lista.innerHTML = pasos.map(function (p) { return '<li>' + p + '</li>'; }).join('');
}
/* ======================================================================
✨ NUEVO: GENERAR LINK DE MERCADO PAGO DINÁMICAMENTE
----------------------------------------------------------------------
Cuando el usuario hace clic en "Pagar con Mercado Pago", pedimos al
Apps Script que genere una preferencia de Checkout Pro con el orden_id
como external_reference. Así el webhook matchea 100% determinístico.
====================================================================== */
function conectarBotonesMP() {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-mp-generar="true"]');
    if (!btn) return;
    e.preventDefault();

    if (!sesion || !sesion.id) {
      aviso('Primero ingresá con tu cuenta para poder pagar.', 'err');
      setTimeout(function () {
        window.location.href = SP.url('ingreso', { volver: 'pago.html' });
      }, 1200);
      return;
    }

    if (!ordenId) {
      aviso('Esperá un momento, estamos preparando tu orden…', 'info');
      return;
    }

    var precio = btn.getAttribute('data-precio');
    var moneda = btn.getAttribute('data-moneda') || 'ARS';

    btn.disabled = true;
    var htmlOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Preparando pago seguro…';

    SP.api.post('crear_preferencia_mp', {
      orden_id: ordenId,
      item_nombre: item ? item.nombre : 'Acceso Oráculo Evolución',
      precio: precio,
      moneda: moneda,
      email: sesion.email
    })
      .then(function (r) {
        if (r && r.exito && r.link_pago) {
          window.location.href = r.link_pago;
        } else {
          throw new Error((r && r.error) || 'No se pudo generar el link de pago.');
        }
      })
      .catch(function (err) {
        console.error('[Pago] Error generando preferencia MP:', err);
        aviso(err.message || 'No pudimos conectar con Mercado Pago. Intentá de nuevo.', 'err');
        btn.disabled = false;
        btn.innerHTML = htmlOriginal;
      });
  });
}
/* ======================================================================
ARRANQUE
====================================================================== */
document.addEventListener('DOMContentLoaded', function () {
  sesion = SP.sesion.leer();
  if (!resolverItem()) return;
  
  pintarItem();
  pintarReglas();
  pintarMetodos();
  conectarBotonesMP();
  conectarVerificar();

  // ✨ NUEVO: Detectar si el usuario vuelve de un pago exitoso de Mercado Pago
  var resultado = SP.param('resultado');
  if (resultado === 'exito' && sesion && sesion.id) {
    // Forzamos una revalidación rápida para asegurar que el webhook ya llegó
    SP.sesion.revalidar().then(function(valida) {
      if (valida && SP.sesion.esActivo(valida.estado)) {
        aviso('¡Pago confirmado con éxito! Redirigiendo al Oráculo…', 'ok');
        setTimeout(function () {
          window.location.href = SP.url('oraculo');
        }, 2500); // 2.5 segundos para que lean el mensaje
      } else {
        // Si por alguna razón el webhook tardó, mostramos el botón de verificar
        aviso('Procesando tu pago. Si no se desbloquea, usá el botón de verificar.', 'info');
      }
    });
    return; // Detenemos la ejecución aquí para no mostrar el bloque de pago
  }

  // Ya tiene el pase: mostramos el estado de éxito, no el cobro
  if (sesion && sesion.id && SP.sesion.esActivo(sesion.estado)) {
    pintarActivo();
    return;
  }

  mostrar('bloque-pago', true);
  registrarOrden();
});
})();