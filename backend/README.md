# CobraVoz · Backend (Node.js + Express)

API REST que verifica la sesión de Supabase, aplica la autorización por negocio y, en las siguientes fases, integra Pey (CoDi) y Ollama. Contratos completos en [`docs/API.md`](../docs/API.md).

## Requisitos

- Node.js **22.9 o superior**. Kali y Debian suelen traer una versión anterior: instala Node 22 con `nvm` o con el repositorio de NodeSource. En Arch: `sudo pacman -S nodejs npm`.
- Proyecto de Supabase con las migraciones aplicadas (ver [`supabase/README.md`](../supabase/README.md)).

## Puesta en marcha

```bash
cd backend
```
```bash
npm ci
```
```bash
cp .env.example .env
```
Completa `.env` con la URL y las llaves de Supabase y arranca en modo desarrollo:
```bash
npm run dev
```
Comprueba que responde:
```bash
curl http://127.0.0.1:3000/api/health
```

## Pruebas

| Comando | Qué prueba | Requiere |
|---|---|---|
| `npm test` | 41 pruebas: JWT (firma, emisor, audiencia, expiración, `alg` y rol), membresía, roles, validación, errores, límite de solicitudes, CORS y consultas de los repositorios | Nada externo |
| `npm run test:integration` | Flujo real contra tu proyecto Supabase: JWT real, RLS, `INSERT … RETURNING`, cambio de precio e historial, aislamiento entre usuarios | `.env` y migraciones aplicadas |
| `../scripts/test-db.sh` | 76 pruebas de las migraciones en un PostgreSQL temporal | PostgreSQL local |

## Estructura

```
src/
  app.js                         arma Express con dependencias inyectadas
  server.js                      arranque, configuración real y cierre ordenado
  config/env.js                  variables de entorno validadas (zod)
  controllers/                   account, catalog, sales
  routes/index.js                rutas y permisos por rol
  middleware/                    auth (JWT), membership, validate, cors, request-context, error-handler
  integrations/supabase/         clientes (usuario/servicio) y verificación del JWT
  repositories/supabase.js       consultas con supabase-js
  validators/schemas.js          esquemas de entrada (objetos estrictos)
  lib/                           errores y logger
test/                            pruebas unitarias y de HTTP; integration/ para Supabase real
```

`services/` se agrega en la fase 5, cuando haya lógica de negocio que coordine varias fuentes (ventas con Pey) y en la fase 6 (voz con Ollama). Por ahora los controladores llaman directo a los repositorios.

## Reglas de seguridad aplicadas

- La identidad sale **solo** del JWT verificado. Los cuerpos con `owner_id`, `user_id`, `actor_id` u otros campos desconocidos se rechazan.
- Todo lo que cuelga de `/businesses/:bid` exige membresía verificada en la base de datos. Si no eres miembro, la respuesta es `404`, para no revelar que el negocio existe.
- Las consultas usan el JWT del usuario, así que RLS aplica también como segunda barrera. La secret key solo se usa para `set_product_price` y, más adelante, para las funciones de cobro.
- Los registros ocultan los tokens y la CLABE. Los errores internos no se envían al cliente.
- Límite de solicitudes por usuario (`RATE_LIMIT_PER_MINUTE`) y cuerpos JSON de máximo 32 KB.
