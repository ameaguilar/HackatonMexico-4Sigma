# CobraVoz — Hackatón México 2026

**Rama de integración:** `developer`. Frontend PWA accesible, diseñado con México Vivo.

## Organización
- `frontend/`: interfaz de 3 acciones, calculadora, lectura por voz, modo alto contraste y QR de demostración.
- Futuras carpetas de backend, integraciones o pruebas **no se publicarán** por el sitio de previsualización.
- `netlify.toml`: configuración del sitio Netlify `cobravoz-preview`, publica únicamente `frontend/`.

## Diseño
- Verde `#006341`, blanco `#FFFFFF`, rojo de acento `#B32635`, tinta `#161A1D`.
- Tipografía: Atkinson Hyperlegible Next con reserva del sistema.
- Alternativa México Inclusivo de alto contraste y textos ampliables.

## Seguridad y estado del prototipo
Esta versión **no cobra dinero**. QR y confirmación son ficticios y siempre se identifican como DEMO. Nunca se deberán incluir credenciales bancarias, tokens, claves privadas ni llamadas a Pey en el frontend.

## Despliegue continuo
1. En Netlify, abrir el proyecto `cobravoz-preview`.
2. Vincular GitHub: `ameaguilar/HackatonMexico-4Sigma`.
3. Elegir `developer` como rama principal del sitio preview; mantener `main` separada.
4. No escribir comando de build; `netlify.toml` fija el directorio de publicación a `frontend`.
5. Activar Deploy Previews para pull requests hacia `developer`.
