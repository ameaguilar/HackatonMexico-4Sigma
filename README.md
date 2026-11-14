# CobraVoz · Hackatón México 2026

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
- Pulsar `= TOTAL · GENERAR QR` prepara un QR real, que codifica únicamente texto de demostración y el importe; **no es un QR CoDi ni permite recibir pagos**.
- Flujo de demostración: QR preparado → Esperando pago → Simular pago recibido → Comprobante con etiqueta SIMULADO → Historial de sesión.
- El estado de pago real queda reservado al backend, tras validar webhook de Pey, importe, referencia e idempotencia. No debe ser posible que el cliente decida por sí solo que una operación bancaria fue exitosa.
- Verificación de humo: `2 × 45 + 3 × 30 = $180.00`.

## Rama de trabajo
`developer` contiene el **frontend de demostración**. `main` permanece sin cambios.

### Qué previsualizar
- `/`: CobraVoz V3, registro de identidad y edad, SMS mexicano simulado, correo de contacto y CLABE, estados de validación bancaria y biometría simulada.
- `/cobros-v1.html`: frontend V1 original con calculadora y experiencia inicial de cobro, preservado para integración.

**Atención:** Estos recorridos no envían SMS, no capturan datos reales en servidor, no autentican usuarios, no crean cuentas bancarias y no realizan cobros. El SMS de demostración usa `123456` y la pantalla QR NO es válida.

### Diseño aprobado
- Identidad México Vivo `#006341`, `#FFFFFF`, `#B32635` y texto `#161A1D`.
- Atkinson Hyperlegible Next, botones grandes, accesibilidad, alto contraste, lectura por voz.
- La PWA registra únicamente un shell estático para la demo; los módulos de pagos reales nunca deben cachearse ni exponer secretos.

### Integraciones pendientes del backend
- SMS transaccional y verificación de titularidad +52 real.
- Comprobación de mayoría de edad e identidad por medios aceptados, cuando correspondan.
- Passkeys/WebAuthn a través de servidor con sesiones y recuperación segura.
- Validación de CLABE y alta de cuenta de cobro en Pey con autorización para comercios.
- Consulta de estado de cuenta bancaria (pendiente/en proceso/activa/error), únicamente activa habilita QR real.
- API de transacciones, recepción de webhooks Pey validados e idempotencia.
- Privacidad, consentimiento y manejo protegido de datos bancarios.

### Netlify preview
Sitio: `cobravoz-preview`. Conectar repositorio `ameaguilar/HackatonMexico-4Sigma` en la cuenta de Netlify y seleccionar `developer` como rama del sitio preview. `netlify.toml` publica exclusivamente `frontend/`; no configurar build command.
