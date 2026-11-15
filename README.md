# CobraVoz · Hackatón México 2026

COBRAVOZ es una aplicación web progresiva (PWA) diseñada para facilitar los cobros digitales a usuarios comerciantes mediante el reconocimiento de voz. Permite dictar el monto de un cobro, incluso mediante la suma de varias cantidades, escuchar y confirmar el total antes de generar un código QR de pago. La generación del código se realiza mediante CoDi, a través de la integración con la API de PEY, mientras que la asistencia por voz facilita la interacción con la plataforma, promoviendo una experiencia de cobro más accesible, ágil e inclusiva.

## Características principales

- **Público objetivo:** comerciantes que necesitan realizar cobros de forma sencilla.
- **Innovación:** reconocimiento de voz para dictar cantidades, sumar importes y confirmar el total.
- **Integración tecnológica:** generación de códigos QR mediante CoDi, conectada a través de la API de PEY.

##  Demo en línea
**Enlace de acceso:**  
[🌐 Acceder a COBRAVOZ](https://cobravoz.netlify.app/)

COBRAVOZ se encuentra desplegada en Netlify y está disponible para utilizarse desde computadoras y dispositivos móviles (Android y iPhone).

### Lo que hace el código hoy

Actualmente, COBRAVOZ cuenta con un sistema de registro, autenticación de usuarios, gestión de sesiones y generación de cobros digitales mediante reconocimiento de voz e integración con CoDi.

#### 1. Registro y acceso de usuarios

La plataforma permite el registro de usuarios comerciantes mediante un formulario que solicita los siguientes datos:

- Nombre completo.
- Número telefónico.
- Fecha de nacimiento.
- CLABE interbancaria.
- Nombre del negocio (campo opcional).

Una vez completado el registro, el usuario puede iniciar sesión con sus credenciales y cerrar su sesión de manera segura desde la plataforma.

#### 2. Autenticación mediante SMS

Se contempla la implementación de un mecanismo de verificación de identidad mediante un código de confirmación enviado por SMS al número telefónico registrado.

Esta funcionalidad se encuentra pendiente de integración. Para efectos de demostración, actualmente se utiliza el código de acceso **123456**, que permite continuar con el flujo de autenticación.

#### 3. Generación de cobros mediante reconocimiento de voz

El proceso de cobro es una de las principales funcionalidades de COBRAVOZ. Permite al comerciante dictar cantidades mediante el micrófono del dispositivo, utilizando instrucciones sencillas y expresando únicamente los números que conforman el importe.

El sistema reconoce tanto operaciones de suma como cantidades individuales.

**Ejemplos de instrucciones por voz:**

- "Suma 30 más 20 más 1200".
- "Cobra 200".
- "Cobra 150 más 50".

El sistema interpreta las cantidades dictadas y calcula el importe total del cobro.

**Flujo para generar un cobro:**

1. **Dictar el importe:** el comerciante activa el reconocimiento de voz y expresa las cantidades que desea cobrar.
2. **Confirmar importe:** el sistema presenta el resultado de la operación para que el usuario pueda verificarlo. Al presionar el botón "Confirmar importe", valida el monto antes de continuar.
3. **Generar QR:** una vez confirmado el importe, el usuario presiona el botón "Generar QR" para iniciar la generación del código de pago mediante la integración de CoDi a través de la API de PEY.
4. **Limpiar cobro:** si el comerciante necesita corregir o actualizar las cantidades, puede utilizar el botón "Limpiar cobro" para reiniciar la operación e ingresar un nuevo importe.

#### 4. Código QR e integración con CoDi

COBRAVOZ integra la tecnología de pagos CoDi mediante la API de PEY, permitiendo generar códigos QR asociados al importe del cobro previamente confirmado.

El código QR facilita que el cliente pueda realizar el pago desde una aplicación bancaria compatible con CoDi.

La aplicación genera el código QR como parte del flujo de cobro; la confirmación del movimiento bancario debe corroborarse desde la aplicación del banco correspondiente.

#### 5. Historial de cobros

La plataforma conserva un historial de los cobros realizados, permitiendo al comerciante consultar los registros de sus operaciones.

Este historial funciona como referencia de los cobros generados. Para verificar los detalles bancarios y corroborar que un pago se haya realizado correctamente, el usuario debe consultar su aplicación bancaria.

**Importante:** el historial de COBRAVOZ no sustituye el comprobante ni la confirmación bancaria de una transacción.

#### 6. Gestión de sesiones

Los usuarios registrados pueden iniciar y cerrar sesión para acceder a las funcionalidades de la plataforma. Esto permite mantener una experiencia de uso asociada a cada cuenta de comerciante.

## Disponibilidad y alojamiento

COBRAVOZ se encuentra alojada en **Netlify**, una plataforma de hosting que permite desplegar y publicar aplicaciones web.

La aplicación está disponible desde cualquier dispositivo con un navegador web compatible:

- **Computadoras:** acceso desde navegadores como Google Chrome, Microsoft Edge, Firefox y Safari.
- **Dispositivos Android (10 o superior):** acceso desde el navegador y posibilidad de instalarla como aplicación web progresiva (PWA), si el dispositivo y navegador lo permiten.
- **Dispositivos iPhone (iOS 16 o superior):** acceso mediante Safari y posibilidad de agregarla a la pantalla de inicio para utilizarla como una aplicación.



Al estar desarrollada como PWA, COBRAVOZ facilita el acceso desde diferentes dispositivos sin necesidad de descargarla desde Google Play o App Store.

## Stack y arquitectura reales

| Parte | Tecnología / archivos | Responsabilidad y estado |
| --- | --- | --- |
| Interfaz | HTML, CSS y JavaScript nativos en `frontend/` | PWA de una sola página con plantillas HTML y navegación/control de vistas en `frontend/js/app.js`. |
| Estilos | Bootstrap 5.3.9 local y `frontend/css/styles.css` | Cuadrícula adaptable y estilos propios; Bootstrap está incluido como archivo local. |
| Voz y cobros | Web Speech API, `voice.js`, `voice-commands.js`, `payments.js` | Dictado, lectura opcional, interpretación de comandos, cálculos y generación de imagen/texto QR demostrativo; no llama a PEY. |
| Autenticación opcional | `frontend/js/supabase-auth.js` | Solicitudes de autenticación SMS desde el navegador usando Supabase Auth si se configura. No equivale a un backend de pagos. |
| PWA | `manifest.webmanifest`, `sw.js`, `_headers` | Manifiesto y caché de shell estático. El service worker excluye rutas de API y autenticación conocidas; no existe API de pagos en este proyecto. |
| Publicación de vista previa | Netlify, `netlify.toml` | Publica `frontend/` como sitio estático, sin comando de compilación. No despliega un backend. |
| Pruebas existentes | Node.js integrado, `node:test` | Pruebas de voz, comandos y movimientos en `tests/`. No hay scripts npm definidos. |

### API keys y configuración segura

La clave privada de PEY existe únicamente en el entorno secreto del backend que se envía desde ese servidor a PEY como credencial de autorización, de acuerdo con el contrato oficial. No se añade a `frontend/`, al service worker, al repositorio, a variables expuestas al proceso de compilación del frontend ni a respuestas del navegador. El `netlify.toml` actual publica solamente archivos estáticos; por sí solo no proporciona backend ni protege una clave incorporada al JavaScript.



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



