# CobraVoz · Hackatón México 2026

Plataforma de cobros CoDi para pequeños comercios: el comerciante dicta la venta, el backend la valida contra su catálogo y genera un QR CoDi con Pey. Una venta solo se marca como pagada cuando Pey confirma la transacción.

## Ramas

| Rama | Contenido |
|---|---|
| `developer` | Frontend PWA (`frontend/`), desplegado en Netlify |
| `backend` | Backend, base de datos y documentación de arquitectura |
| `main` | Integración final |

## Estructura (rama `backend`)

```
docs/
  ARQUITECTURA.md     decisiones, hallazgos del spec de Pey, estados, despliegue
  API.md              contratos REST v1
supabase/
  migrations/         esquema PostgreSQL con RLS (multi-negocio)
  tests/              pruebas de aislamiento y consistencia financiera
  README.md           crear el proyecto y aplicar migraciones
scripts/
  test-db.sh          prueba las migraciones en un PostgreSQL temporal
pey-openapi.json      spec oficial de la API CoDi de Pey (2026-10-20)
```

## Probar la base de datos

```bash
scripts/test-db.sh
```

## Avance

- [x] Fase 1 · Auditoría del frontend
- [x] Fase 2 · Diseño del backend (`docs/`)
- [x] Fase 3 · Esquema Supabase, RLS y pruebas
- [ ] Fase 4 · Backend Node.js + Express
- [ ] Fase 5 · Integración Pey CoDi
- [ ] Fase 6 · Ollama (qwen2.5:7b)
- [ ] Fase 7 · Conexión del frontend
- [ ] Fase 8 · Despliegue (Docker, Tailscale Funnel, Netlify)
