# CobraVoz · Hackatón México 2026

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
