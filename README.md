# CobraVoz · Hackatón México 2026

## V7 — registro de negocio y comprobante personalizado
- Paso 2 del registro: `businessName` — Nombre del negocio (obligatorio, de 2 a 70 caracteres), distinto del nombre legal del titular bancario.
- Selector existente `entity`: conserva valores `person` y `business` para la integración, pero muestra **Persona física** y **Persona moral** bajo «Régimen fiscal (tipo de contribuyente)». Si se emiten facturas, habrá que pedir el régimen fiscal específico del SAT en un campo aparte.
- El nombre del comercio aparece en la vista QR, en el recibo y en el historial de movimientos.
- Ejemplo en el recibo: `Pagaste $150.00 MXN en Tacos Juanita`. La lectura de voz anuncia `Pagaste 150 pesos mexicanos en Tacos Juanita`.
- Se toma una copia del nombre al crear cada solicitud de cobro; backend debe persistir ese dato bajo la autorización del comercio, sin confiar en modificaciones del cliente.
- El botón de datos ficticios rellena «Tacos Juanita» como ejemplo.
- **Todo sigue siendo demostrativo:** no se confirma ni transfiere dinero por estas pantallas; Pey y webhooks deberán implementarse por backend.

## V6 — dictado Modelo A (Web Speech API, solo MXN)
- Adaptación de voz de `de31e97`: controlador compartido en `frontend/js/voice.js`, mensajes para permisos y errores, cancelación al navegar y lectura de respuestas opcional.
- Pruebas del micrófono simulado: `node --test tests/voice.test.mjs`.
- Voz por turnos usando `SpeechRecognition` / `webkitSpeechRecognition` con `lang = es-MX` si el navegador lo permite.
- Alternativa escrita con las mismas frases e integración de `SpeechSynthesis` para lectura accesible del total.
- Comandos de ejemplo: `Cobra 150 pesos`, `Dos tacos de 25 pesos y tres aguas de 20 pesos`, `Agrega 25 pesos`, `¿Cuánto llevo?`, `Quita el último producto`, `Cancelar`, `Confirmar`.
- Solo se permiten **pesos mexicanos (MXN)**. Otras monedas como USD, dólares, euros y pesos extranjeros se rechazan explícitamente, sin conversión.
- El usuario revisa el total antes de generar el QR. El QR es de prueba, no contiene una instrucción CoDi real.
- Micrófono limitado por la compatibilidad y permisos del navegador; la calculadora sigue disponible como alternativa.
- Para probar sin un alta real, entra con el botón de acceso de demostración o abre `/index.html#cobros`.
- La integración con `developer` conserva el registro, la calculadora y el historial V5.

## V5 — movimientos (solo interfaz de demostración)
- Ruta hash de listado: `/#/movimientos`.
- Ruta hash de detalle: `/#/movimientos/:referencia`.
- Ejemplos ficticios visibles al abrir el historial por primera vez; dejan de mostrarse cuando se crea el primer cobro de prueba de esa sesión.
- Resumen de total confirmado, pendientes, búsqueda por referencia o monto, filtros Todos / Confirmados / Pendientes / Sin pago, agrupación por día y vista accesible de detalle con lectura de voz.
- Estados admitidos por la vista: `confirmed`, `pending`, `expired`, `failed`. Solo `confirmed` se incluye en el total, pero **el cliente nunca debe determinar por sí solo que un pago real está confirmado**.
- Los movimientos de prueba solo viven en memoria de la sesión; recargar puede borrar esos datos.

### Contrato orientativo para el equipo backend (no implementado)
- Listado autenticado por negocio: `GET /api/movements?status=...&search=...` con paginación.
- Detalle de una operación autorizada: `GET /api/movements/:id`.
- Campos mínimos sugeridos: `id`, `reference`, `amount_mxn`, `currency`, `status`, `created_at`, `confirmed_at`, `method` y `merchant_id`.
- Estado `confirmed` únicamente tras verificar webhook de Pey, importe, referencia y titularidad. Verificación idempotente en backend; no actualizar dinero confirmado mediante interacción del frontend.
- Nunca devolver CLABE completa, API keys ni datos bancarios sensibles en listado o detalle.
- Se requiere autorización por negocio y RLS, si se usa una base multiusuario.

## V4 — caja y comprobante de demostración
- Calculadora numérica visible, con suma, resta, multiplicación y cálculo de total.
- La calculadora permite revisar y corregir el total antes de generar el QR. Este codifica únicamente texto de demostración y el importe; **no es un QR CoDi ni permite recibir pagos**.
- Flujo de demostración: QR preparado → Esperando pago → Simular pago recibido → Comprobante con etiqueta SIMULADO → Historial de sesión.
- El estado de pago real queda reservado al backend, tras validar webhook de Pey, importe, referencia e idempotencia. No debe ser posible que el cliente decida por sí solo que una operación bancaria fue exitosa.
- Verificación de humo: `2 × 45 + 3 × 30 = $180.00`.

## Rama de trabajo
`developer` contiene el **frontend de demostración**. `main` permanece sin cambios.

### Qué previsualizar
- `/`: aplicación unificada de registro, acceso y cobros de demostración.
- `/index.html#cobros`: acceso directo al inicio de cobros, sin completar el registro de prueba.

### Estructura del frontend
- `frontend/index.html` contiene la estructura común de la SPA.
- `frontend/css/bootstrap.min.css` contiene Bootstrap 5.3.9 para la cuadrícula responsive y el modo offline.
- `frontend/css/styles.css` contiene los estilos propios.
- `frontend/js/app.js` controla la navegación, validaciones y carga de vistas.
- `frontend/js/payments.js` contiene interpretación de importes, cálculo y QR ilustrativo, sin llamadas bancarias.
- `frontend/js/voice-commands.js`, `demo-qr.js` y `movements.js` conservan los comandos Modelo A, el QR de texto y los movimientos de las versiones remotas.
- `frontend/js/supabase-auth.js` integra SMS y WebOTP, con modo demo cuando no se configura Supabase.
- `frontend/pages/` contiene seis vistas. Los pasos y estados de una misma tarea comparten plantilla; los formularios SMS, mensajes y elementos repetidos se reutilizan como fragmentos HTML.
- `frontend/sw.js` precarga esos archivos para la vista previa offline.

| Vista | Contenido y estados |
| --- | --- |
| `access.html` | Bienvenida, acceso con celular/SMS y biometría simulada |
| `registration.html` | Identidad, verificación SMS, datos bancarios, revisión y estado pendiente con acceso rápido |
| `home.html` | Inicio del comerciante y elección de acción |
| `charge.html` | Voz o calculadora y confirmación común del importe |
| `payment.html` | QR ilustrativo pendiente y confirmación de pago simulado |
| `history.html` | Lista y total de operaciones simuladas de la sesión |

La lógica de cobros de V1 y el registro de V3 utilizan ahora el mismo shell, estilos y navegación. El historial y los formularios viven solo en memoria y se limpian al cerrar la sesión de demostración. Sirve `frontend/` por HTTP (por ejemplo, `python -m http.server 8000 --directory frontend`); las plantillas y módulos no se cargan abriendo `index.html` con `file://`.

**Atención:** Sin configuración de Supabase, el acceso y SMS son simulados con código `123456`. Si se configuran `supabase-url` y `supabase-publishable-key` mediante metadatos, o `globalThis.COBRAVOZ_SUPABASE`, el módulo utiliza Supabase Auth para SMS; se requiere un proveedor SMS habilitado. Los registros bancarios, passkeys y cobros siguen siendo demostrativos. El QR NO permite pagar. Ninguna migración se aplica automáticamente al publicar el frontend.

### Diseño aprobado
- Identidad México Vivo `#006341`, `#FFFFFF`, `#B32635` y texto `#161A1D`.
- Barlow, botones grandes, accesibilidad, alto contraste, lectura por voz.
- La PWA registra únicamente un shell estático para la demo; los módulos de pagos reales nunca deben cachearse ni exponer secretos.

### Integraciones pendientes del backend
- Configurar el proveedor OAuth de Google en Supabase Auth y sus credenciales en el entorno del servidor.
- SMS transaccional y verificación de titularidad +52 real.
- Comprobación de mayoría de edad e identidad por medios aceptados, cuando correspondan.
- Passkeys/WebAuthn a través de servidor con sesiones y recuperación segura.
- Validación de CLABE y alta de cuenta de cobro en Pey con autorización para comercios.
- Consulta de estado de cuenta bancaria (pendiente/en proceso/activa/error), únicamente activa habilita QR real.
- API de transacciones, recepción de webhooks Pey validados e idempotencia.
- Privacidad, consentimiento y manejo protegido de datos bancarios.

### Netlify preview
Sitio: `cobravoz-preview`. Conectar repositorio `ameaguilar/HackatonMexico-4Sigma` en la cuenta de Netlify y seleccionar `developer` como rama del sitio preview. `netlify.toml` publica exclusivamente `frontend/`; no configurar build command.
