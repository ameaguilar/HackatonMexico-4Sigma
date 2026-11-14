<<<<<<< HEAD
# 4Sigma CheckIn · CobraVoz
=======
## V8 · Ayuda y documentos legales (frontend)
- Footer responsive con acceso a manual, 18 FAQs, términos y aviso de privacidad propios, enlaces oficiales a Pey/CoDi.
- Chatbot de FAQs **local y sin IA externa** en una ventana compacta, teclado y alto contraste. Nunca pide ni almacena credenciales bancarias o códigos OTP.
- Ruta `/ayuda.html#manual`, `#faq`, `#terms`, `#privacy`. El chat se abre desde cualquier pantalla.
- **Términos y privacidad son borradores**; no activar aceptación contractual ni producción antes de completar responsable jurídico, domicilio, contacto ARCO, transferencias, periodos y revisión legal.
- El servicio de cobros se mantiene separado e intacto. No se despliegan cobros Pey con esta actualización.

# CobraVoz · Hackatón México 2026
>>>>>>> f068bf1107398da01a960fd848947e7345d00e26

Aplicación web progresiva (PWA) de demostración para que pequeños comercios preparen y revisen cobros en pesos mexicanos mediante voz o calculadora. CobraVoz es el nombre que utiliza el código y la interfaz del proyecto; 4Sigma CheckIn identifica el proyecto de la hackatón.

> **Estado actual:** la aplicación es una demostración de frontend. Los códigos QR, pagos, confirmaciones y movimientos que muestra no son operaciones bancarias reales. La integración con la API PEY CoDi está planeada, pero no implementada en este repositorio.

## Propósito e inclusión

4Sigma CheckIn busca simplificar la preparación de cobros para personas comerciantes, en particular pequeños negocios que necesitan una experiencia clara y rápida en caja. La persona puede dictar un importe o los productos vendidos, revisar el total y, en la demo, generar un QR ilustrativo. La alternativa de calculadora permite introducir y corregir el importe sin usar voz.

La interacción por voz permite describir la operación —por ejemplo, “dos cafés de cuarenta pesos”—, agregar o quitar conceptos, consultar el total y solicitar su revisión. El reconocimiento está limitado a las capacidades y permisos del navegador. La lectura de respuestas puede anunciar importes y detalles de movimientos mediante la síntesis de voz del navegador.

Estas opciones pueden apoyar a personas con debilidad visual, y la interfaz escrita, las etiquetas accesibles y los avisos visuales ofrecen una alternativa a la voz para personas con debilidad auditiva. La voz no es obligatoria: los campos de texto, botones y calculadora permiten completar el flujo sin micrófono ni audio. La aplicación no afirma tener certificación de accesibilidad ni sustituir tecnologías de apoyo.

## Funcionalidad implementada

- Registro y acceso de demostración, navegación entre vistas y captura de información de negocio. Los datos bancarios y la verificación de identidad no se envían ni validan en un backend.
- Acceso opcional a Supabase Auth por SMS cuando se configura el cliente; si no, el modo demo acepta el código fijo `123456`. El código del navegador usa la URL y la clave publicable/anónima de Supabase, que no son secretos de servidor.
- Dictado en español de México mediante Web Speech API cuando el navegador lo admite, comandos para preparar y modificar un cobro y lectura opcional con SpeechSynthesis. También se puede escribir la descripción.
- Calculadora para operaciones aritméticas y revisión manual del total antes de continuar.
- QR de demostración rotulado como no pagable; comprobante e historial simulados en memoria de sesión. No hay solicitud de pago, transferencia, conciliación ni confirmación bancaria real.
- Vistas responsivas, PWA con recursos estáticos precargados y recursos de accesibilidad como etiquetas, estados y descripciones para lector de pantalla.

## Stack y arquitectura reales

El repositorio no contiene `package.json`, framework de frontend ni servidor backend.

| Parte | Tecnología / archivos | Responsabilidad y estado |
| --- | --- | --- |
| Interfaz | HTML, CSS y JavaScript nativos en `frontend/` | PWA de una sola página con plantillas HTML y navegación/control de vistas en `frontend/js/app.js`. |
| Estilos | Bootstrap 5.3.9 local y `frontend/css/styles.css` | Cuadrícula adaptable y estilos propios; Bootstrap está incluido como archivo local. |
| Voz y cobros | Web Speech API, `voice.js`, `voice-commands.js`, `payments.js` | Dictado, lectura opcional, interpretación de comandos, cálculos y generación de imagen/texto QR demostrativo; no llama a PEY. |
| Autenticación opcional | `frontend/js/supabase-auth.js` | Solicitudes de autenticación SMS desde el navegador usando Supabase Auth si se configura. No equivale a un backend de pagos. |
| PWA | `manifest.webmanifest`, `sw.js`, `_headers` | Manifiesto y caché de shell estático. El service worker excluye rutas de API y autenticación conocidas; no existe API de pagos en este proyecto. |
| Publicación de vista previa | Netlify, `netlify.toml` | Publica `frontend/` como sitio estático, sin comando de compilación. No despliega un backend. |
| Pruebas existentes | Node.js integrado, `node:test` | Pruebas de voz, comandos y movimientos en `tests/`. No hay scripts npm definidos. |

## PEY CoDi: estado, flujo y requisitos

### Lo que hace el código hoy

El código disponible crea un QR ilustrativo que incluye datos explícitos de demostración. La pantalla indica “QR DEMO · NO PAGABLE”; la simulación no consulta PEY, no procesa pagos y no prueba que un pago se haya recibido. El estado “confirmado” de los datos de ejemplo tampoco acredita una transacción bancaria. `supabase-auth.js` cubre autenticación, no la API de cobros.

### Flujo objetivo descrito en el plan, aún pendiente

`PLAN_IMPLEMENTACION_PEY.md` propone una integración servidor-a-servidor: registrar una cuenta de comercio, consultar su estado y permitir la generación de cobros CoDi solo cuando la cuenta esté activa; crear el QR con el importe y concepto revisados; y reflejar el pago en el historial después de verificar la transacción o una notificación de PEY en el backend. La aplicación actual no ejecuta ninguno de esos pasos. Las rutas PEY que aparecen en ese plan son una propuesta basada en un archivo OpenAPI citado allí, pero `pey-openapi.json` no está presente en este repositorio para verificar el contrato. Confirma el contrato vigente con PEY antes de implementar.

El plan menciona como rutas candidatas de PEY `POST /bank-account`, `GET /bank-account/{id}`, `POST /codi/qr` y consultas de transacciones. No hay cliente, endpoints propios `/api/pey/*`, servidor, funciones edge, webhooks, tablas ni migraciones implementadas. La integración también requiere definir autenticación/autorización del backend, almacenamiento por comercio, validación de notificaciones, idempotencia, conciliación, expiración y tratamiento de errores.

### API keys y configuración segura

La clave privada de PEY debe existir únicamente en el entorno secreto del backend que se implemente y enviarse desde ese servidor a PEY como credencial de autorización, de acuerdo con el contrato oficial. No debe añadirse a `frontend/`, al service worker, al repositorio, a variables expuestas al proceso de compilación del frontend ni a respuestas del navegador. El `netlify.toml` actual publica solamente archivos estáticos; por sí solo no proporciona backend ni protege una clave incorporada al JavaScript.

Todavía no hay nombre de variable de entorno PEY configurado por código porque la integración no existe. `PEY_API_KEY` y `PEY_API_BASE_URL` aparecen como nombres propuestos en `PLAN_IMPLEMENTACION_PEY.md`, no como variables activas. Si se usa Supabase Auth, la configuración pública actual puede suministrarse mediante metadatos `supabase-url` y `supabase-publishable-key`, o `globalThis.COBRAVOZ_SUPABASE`, según `supabase-auth.js`. La clave publicable/anónima no debe confundirse con una clave privada de servidor; protege los datos con políticas y permisos apropiados.

## Requisitos e inicio local

- Un navegador moderno. El dictado depende de que el navegador implemente Web Speech API y permita el micrófono; si no, usa texto o calculadora.
- Python 3 para servir los archivos estáticos localmente.
- Node.js para ejecutar las pruebas existentes.

Desde la raíz del repositorio, inicia un servidor HTTP:

```powershell
python -m http.server 8000 --directory frontend
```

Abre `http://localhost:8000/`. Para entrar directamente a la vista de cobros de demostración, usa `http://localhost:8000/#cobros`. Sirve el sitio por HTTP; abrir `index.html` mediante `file://` no permite cargar correctamente sus módulos y plantillas.

Sin configuración de Supabase, usa el acceso demo y el código `123456`. Para habilitar SMS real con Supabase, configura en el HTML los metadatos públicos que lee `supabase-auth.js` o `globalThis.COBRAVOZ_SUPABASE`, y habilita un proveedor SMS en Supabase. Esto no activa pagos PEY.

## Pruebas disponibles

No se requiere instalar dependencias npm: el repositorio no define `package.json`. Desde la raíz, ejecuta las pruebas existentes con Node.js:

```powershell
node --test tests/voice.test.mjs
node --test tests/voice-commands.test.mjs
node --test tests/movements.test.mjs
```

## Despliegue de vista previa

`netlify.toml` configura `frontend/` como directorio publicado y no define un comando de build. Para desplegar, conecta el repositorio al sitio de Netlify y selecciona la rama de vista previa deseada; la configuración del sitio debe conservar `frontend/` como directorio de publicación. Esto publica únicamente la PWA estática. No despliega una API PEY ni hace posible cobrar realmente. No se ha verificado el estado actual de una cuenta o sitio de Netlify.

La PWA puede mostrar el shell previamente guardado sin conexión; una operación real, una vez que exista integración, deberá requerir conexión y confirmación del backend. No guardes secretos en archivos publicados o en el caché del service worker.

## Pendientes para completar PEY

- Obtener y versionar de forma segura la especificación oficial vigente de PEY y confirmar acceso, credenciales, entorno y condiciones de cuenta/comercio.
- Decidir y desplegar el backend (o funciones serverless/edge), su autenticación, configuración de secretos y límites de solicitudes.
- Diseñar y aplicar almacenamiento seguro, autorización por comercio, políticas de acceso y retención de datos.
- Implementar alta y consulta de cuenta, creación de QR CoDi real, consulta/verificación de transacciones y webhook firmado o mecanismo oficial de notificación, con idempotencia y conciliación.
- Conectar el frontend a ese backend y distinguir estados reales de simulados en recibos e historial.
- Configurar dominios, variables privadas, CORS y observabilidad en el entorno de despliegue.

Consulta `PLAN_IMPLEMENTACION_PEY.md` para el diseño propuesto. Sus rutas y esquemas son referencias de planificación y deben cotejarse con la documentación oficial antes de usarse en producción.
