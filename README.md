# CobraVoz · Hackatón México 2026

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

**Atención:** Estos recorridos no envían SMS, no capturan datos reales en servidor, no autentican usuarios, no crean cuentas bancarias y no realizan cobros. El SMS de demostración usa `123456` y la pantalla QR NO es válida.

### Diseño aprobado
- Identidad México Vivo `#006341`, `#FFFFFF`, `#B32635` y texto `#161A1D`.
- Barlow, botones grandes, accesibilidad, alto contraste, lectura por voz.
- La PWA registra únicamente un shell estático para la demo; los módulos de pagos reales nunca deben cachearse ni exponer secretos.

### Esquema SQL preliminar
- `supabase/migrations/20261114141600_preliminary_entities.sql` extiende el esquema existente de Supabase/PostgreSQL: `charges` representa un cobro y `charge_history` expone las transacciones pagadas.
- `auth.users` administra contraseñas, correo, identidades de Google y OTP SMS; el teléfono del perfil es único. Los códigos de seis dígitos son temporales y no se guardan en tablas propias.
- `profiles.adult_consent` registra la declaración; `adult_verified_at` queda reservado a una verificación real realizada por el backend.
- `merchant_accounts` conserva solo los últimos cuatro dígitos legibles de la CLABE; el backend debe cifrar el valor completo. `passkey_credentials` almacena claves públicas WebAuthn, nunca datos biométricos.
- La creación de cobros, el registro de transacciones y la verificación de pagos corresponden al backend/webhook, no al cliente.

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
