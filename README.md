# CobraVoz — Frontend PWA (México Vivo)

**Rama de integración:** `developer`. Frontend accesible para el Hackatón México 2026.

Este sitio es una **demo**: el QR es ilustrativo y el botón de confirmación simula un pago. **No envía ni recibe dinero.**

## Uso
- Cobrar por voz (Web Speech API si el navegador es compatible) o texto.
- Calculadora y verificación manual del importe.
- Pantalla QR demo, historial de sesión demo.
- Texto ampliable, modo de alto contraste y lectura en voz alta.
- PWA instalable desde HTTPS, con shell disponible sin conexión; la pantalla de pagos nunca debe cachear transacciones reales.

## Diseño aprobado
- Paleta México Vivo: verde `#006341`, blanco `#FFFFFF`, rojo de acento `#B32635`, tinta `#161A1D`, suave `#F0F5F1`.
- Tipografía principal: Atkinson Hyperlegible Next, alternativa system-ui.
- Modo México Inclusivo (alto contraste) disponible en toda la app.

## Netlify
Proyecto: `cobravoz-preview`. Conectar GitHub y seleccionar la rama `developer` como rama de producción **solo para este sitio de vista previa**. El archivo `netlify.toml` publica el directorio raíz sin compilar.

No subir secretos a repositorio ni frontend. Las integraciones Pey, voz IA y registro real serán implementadas por el equipo backend.
