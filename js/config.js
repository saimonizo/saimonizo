/* ==========================================================================
   CONFIGURACIÓN CENTRAL — SIMÓN PÉREZ · ORÁCULO EVOLUCIÓN
   --------------------------------------------------------------------------
   TODOS los enlaces, webhooks, precios y datos de contacto del ecosistema
   viven acá. Editar este único archivo actualiza todo el sitio.

   ÍNDICE
     1. Identidad y contacto
     2. Backend (Google Sheets + Apps Script)
     3. Sesión del viajero
     4. Rutas del ecosistema
     5. Catálogo de compras (pases, cursos, productos)
     6. Webhooks de automatización (Make)
     7. Oráculo
   ========================================================================== */

window.SP = window.SP || {};

window.SP.config = {

  /* ======================================================================
     1. IDENTIDAD Y CONTACTO
     ====================================================================== */
  marca: {
    nombre: 'Simón Pérez',
    rol: 'Compositor & Productor',
    iniciales: 'SP',
    experiencia: 'Oráculo Evolución',
  },

  contacto: {
    // WhatsApp en formato internacional, SIN signos (Argentina +54 9 2984 758260)
    whatsapp: '5492984758260',
    email: 'simon_12_perez@hotmail.com',
    instagram: 'https://www.instagram.com/saimonizo',
    youtube: 'https://www.youtube.com/channel/UCw_f7BlfAZwBG4biX72hFMQ',
    spotify: 'https://open.spotify.com/artist/1YeaEBiirLa8anufUbsk6w?si=Hzp33EBzSNaDkBh7bUIZSg',
  },

  /* ======================================================================
     2. BACKEND — GOOGLE SHEETS + APPS SCRIPT
     ----------------------------------------------------------------------
     Una sola URL para todo el sistema de cuentas, llaves y órdenes.
     El Apps Script recibe { accion: '...' } y responde JSON { exito: true }.

     Acciones que el Apps Script debe implementar:
       registrar          → crea la cuenta (email único, contraseña hasheada)
       login              → valida credenciales, devuelve estado y tipo de pase
       verificar_sesion   → revalida un token guardado ("Recordarme")
       cerrar_sesion      → invalida el token
       solicitar_reset    → envía por correo el enlace/clave de recuperación
       cambiar_password   → cambia la contraseña con el token de recuperación
       obtener_experiencias → lista lo desbloqueado por el usuario
       crear_orden        → registra una intención de compra y devuelve orden_id
       estado_orden       → devuelve si la orden fue pagada y qué desbloquea
       obtener_catalogo   → (opcional) si devuelve ítems, reemplaza al catálogo local

     El detalle de cada contrato está en README.md.
     ====================================================================== */
  api: {
    url: 'https://script.google.com/macros/s/AKfycbzkIUuWBLOVOrOpG7YeS6QnXBRdDD2RPjDF11EOkWXjTPXw-8YZvENYzbtX87H9UNpB/exec',
    // Apps Script no responde preflight CORS: se envía siempre como
    // "simple request" (Content-Type: text/plain) para evitar el OPTIONS.
    timeout: 15000,
    reintentos: 1,
  },

  /* ======================================================================
     3. SESIÓN DEL VIAJERO
     ----------------------------------------------------------------------
     · sessionStorage → claves heredadas (usuario_id, usuario_estado, …) que
       leen oraculo.js y el resto del ecosistema.
     · localStorage   → "Recordarme": la sesión sobrevive al cerrar el
       navegador y se revalida contra Apps Script al volver.
     ====================================================================== */
  sesion: {
    clave: 'sp.sesion.v1',
    recordarPorDefecto: true,
    // Días de validez del token de "Recordarme" (debe coincidir con el Apps Script)
    duracionDias: 30,
    // Si el backend no responde al revalidar, ¿mantenemos la sesión local?
    // (permite entrar igual con token válido y sin conexión al backend)
    toleranteSinBackend: true,
  },

  /* ======================================================================
     4. RUTAS DEL ECOSISTEMA
     ====================================================================== */
  rutas: {
    inicio:   'index.html',
    portal:   'portal-evolucion.html',
    ingreso:  'auth.html',
    espacio:  'mi-espacio.html',
    oraculo:  'oraculo.html',
    pago:     'pago.html',
    tienda:   'tienda.html',
  },

  /* ======================================================================
     5. CATÁLOGO DE COMPRAS
     ----------------------------------------------------------------------
     Cada ítem es una compra posible. Agregar uno nuevo NO requiere tocar
     HTML: se renderiza solo en la tienda, el portal, el pago y Mi Espacio.

       id          → identificador estable (debe coincidir con la llave del Sheet)
       tipo        → 'pase' | 'curso' | 'producto' | 'experiencia'
       desbloquea  → qué experiencia habilita (se compara con el estado del pase)
       opciones[]  → medios de pago. Si está vacío, se ofrece coordinar por WhatsApp.
     ====================================================================== */
  catalogo: [

    /* ---- Pase permanente al Oráculo ---------------------------------- */
    {
      id: 'pase-permanente',
      tipo: 'pase',
      nombre: 'Pase Permanente Evolución',
      subtitulo: 'Acceso ilimitado al Oráculo',
      descripcion:
        'Tu llave no expira. Volvé al Oráculo cuantas veces necesites reconectar, ' +
        'recorré el ritual completo y recibí tu bitácora evolutiva por correo.',
      beneficios: [
        'Ritual completo de 5 pasos, sin límite de tiempo',
        'Cortometraje conceptual + mapa personal de evolución',
        'Bitácora evolutiva enviada a tu correo',
        'Nuevas obras y sintonías que se suman con el tiempo',
      ],
      destacado: true,
      acceso: 'oraculo',
      icono: 'fa-solid fa-infinity',
      opciones: [
        {
          metodo: 'mercadopago',
          etiqueta: 'Mercado Pago',
          detalle: 'Tarjeta o dinero en cuenta',
          precio: 22000,
          moneda: 'ARS',
          destacado: true,
          url: '',
          nota: 'Pago automático y seguro. Tu acceso se activa apenas se confirma el pago.', 
                  },
        {
          metodo: 'transferencia',
          etiqueta: 'Transferencia bancaria',
          detalle: 'Pago en pesos argentinos · 10% OFF',
          precio: 20000,
          moneda: 'ARS',
          destacado: false,
          url: '',                       // se coordina por WhatsApp
          nota: 'Coordinamos los datos de transferencia por WhatsApp y activamos tu acceso en menos de 2 horas.',

        },
      ],
    },

    /* ---- Curso: ejemplo listo para el futuro --------------------------
       Descomentar (y ajustar) cuando el curso esté disponible:
    {
      id: 'curso-produccion',
      tipo: 'curso',
      nombre: 'Curso: Producción desde la idea',
      subtitulo: 'Del boceto al master',
      descripcion: 'Recorrido práctico por captura, arreglos, mezcla y master.',
      beneficios: ['8 módulos en video', 'Sesiones de escucha comentadas', 'Acceso de por vida'],
      destacado: false,
      acceso: 'curso-produccion',
      icono: 'fa-solid fa-sliders',
      opciones: [
        { metodo: 'mercadopago', etiqueta: 'Mercado Pago', detalle: 'Pago único',
          precio: 0, moneda: 'ARS', destacado: true, url: '', nota: '' },
      ],
    },
    ------------------------------------------------------------------- */

  ],

  /* ======================================================================
     6. WEBHOOKS DE AUTOMATIZACIÓN (MAKE)
     ====================================================================== */
  webhooks: {
    // Registro de nuevos usuarios desde el Portal
    registro: 'https://script.google.com/macros/s/AKfycbzkIUuWBLOVOrOpG7YeS6QnXBRdDD2RPjDF11EOkWXjTPXw-8YZvENYzbtX87H9UNpB/exec',
    // Cosecha final del Oráculo (envío de la bitácora por correo)
    cosecha: 'https://script.google.com/macros/s/AKfycbzkIUuWBLOVOrOpG7YeS6QnXBRdDD2RPjDF11EOkWXjTPXw-8YZvENYzbtX87H9UNpB/exec', // <-- Pegar acá el webhook de Make para el correo final
  },

  /* ---- Economía / donaciones ------------------------------------------ */
  pagos: {
    donacion: 'https://link.mercadopago.com.ar/saimonizo',
    // Compatibilidad con enlaces heredados de las páginas
    paseUnico: '#',
    accesoLibre: '#',
  },

/* ======================================================================
7. ORÁCULO Y DATOS
====================================================================== */
oraculo: {
  minNumero: 1,
  maxNumero: 70,
  videoCortometrajeId: '8WrmhWBfZL4',
  videoAlbum: 'https://www.youtube.com/embed/sqgqcQdTCY4',
},
datos: {
  // URL de la hoja publicada como TSV (Valores separados por tabulaciones)
  oraculo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQAP4_BQodOL28ouphUToFgtKsZqomGg2VKn3c6O93CKoE3MUW62INH3GhWrDPg2_UaADoaaLnsk9pZ/pub?gid=1785436404&single=true&output=tsv',
  testimonios: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQAP4_BQodOL28ouphUToFgtKsZqomGg2VKn3c6O93CKoE3MUW62INH3GhWrDPg2_UaADoaaLnsk9pZ/pub?gid=393757126&single=true&output=tsv'
}
};