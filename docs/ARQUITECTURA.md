# CobraVoz · Arquitectura y decisiones técnicas

Estado: **Fases 2, 3 y 4 completas** (diseño, base de datos y backend base). Siguiente: Fase 5, integración con Pey.

## 1. Vista general

```
Teléfono / navegador
   │ HTTPS
   ▼
Netlify  ── frontend/ (PWA estática, rama developer)
   │  /api/*  → proxy (mismo origen para el navegador, sin CORS)
   ▼
Tailscale Funnel  https://<maquina>.<tailnet>.ts.net   (HTTPS gratis, URL fija)
   ▼
Máquina Kali (servidor de demo)
   ├─ backend Node.js + Express   (Docker, :3000)
   └─ Ollama (modelo configurable) (nativo, 127.0.0.1:11434, nunca expuesto)
          │
          ├──► Supabase Cloud (Auth + PostgreSQL con RLS)
          └──► Pey CoDi API  https://api.pey.mx
```

**Situación temporal:** la máquina Kali que alojará la demo **no tiene GPU**, así que Ollama correrá en CPU (ver D4). La máquina con GPU NVIDIA de 6 GB queda para desarrollo y para cuando haya un alojamiento con GPU. Ambas usan la misma configuración Docker y Ollama; solo una tiene Funnel activo a la vez.

## 2. Decisiones

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Frontend en Netlify**, con proxy `/api/*` hacia el backend | Ya estaba configurado (`netlify.toml`, `_headers`, sitio de preview). Aplica cabeceras de seguridad y permite el proxy, cosa que GitHub Pages no hace. |
| D2 | **Backend expuesto con Tailscale Funnel** | No tenemos dominio. Funnel da HTTPS y una URL `*.ts.net` fija gratis, sin abrir puertos del router. La URL fija importa para el proxy de Netlify y para registrar webhooks en Pey. Si compran dominio, se migra a Cloudflare Tunnel cambiando solo la URL del proxy. |
| D3 | **Supabase Cloud, plan gratuito** | Instalar Supabase localmente son unos 10 contenedores que competirían por los 16 GB de RAM con Ollama. Ojo: el plan gratuito pausa el proyecto tras unos 7 días sin actividad. |
| D4 | **Ollama nativo** (no en Docker) y **modelo configurable** (`OLLAMA_MODEL`) | **Con GPU** (NVIDIA de 6 GB): `qwen2.5:7b`. El Q4_K_M ocupa unos 4.7 GB y cabe en VRAM con `num_ctx` 4096. **Sin GPU** (la Kali actual): en CPU un modelo 7B tardaría previsiblemente decenas de segundos por comando, demasiado para cobrar en vivo. Empezamos con `qwen2.5:3b` (unos 2 GB) y en la fase 6 se mide la latencia real en esa máquina antes de decidir. Ajustes: `OLLAMA_KEEP_ALIVE=24h`, `OLLAMA_NUM_PARALLEL=1`, `temperature: 0`, `format` con esquema JSON y un timeout. Por eso D15 importa aún más: las frases comunes las resuelven las reglas al instante, sin modelo. |
| D5 | **Importes en centavos (`bigint`)** | Exactitud. La conversión a pesos decimales ocurre solo en la frontera con Pey, que usa `number` en MXN. |
| D6 | **Escritura financiera solo con `service_role`**, mediante funciones SQL | Los usuarios únicamente leen, filtrados por RLS. `create_sale` y `apply_provider_transaction` son atómicas y vuelven a verificar la membresía del usuario. |
| D7 | **La máquina de estados vive en la base de datos** (trigger) | Ni un error del backend puede llevar un cobro de CREATED a PAID ni modificar uno ya pagado. |
| D8 | **Confirmación de pago por consulta a Pey** (`GET /transaction/codi/qr/{IDC}`) | El spec no define webhooks de pago (`"webhooks": {}`); la documentación solo menciona *Bank Account Updated*. Un webhook futuro se tratará solo como **aviso**: dispara una consulta a la API con nuestra llave, y nunca marca PAID con lo que trae su cuerpo. Así es seguro sea cual sea el esquema de firma. |
| D9 | **Pey no permite anular un QR**, así que CANCELLED es solo local | Si el cliente paga un QR ya cancelado o vencido, el dinero es real: la venta pasa a PAID con `paid_after_close = true` para revisarla. |
| D10 | **Pey no soporta idempotencia**, así que la venta se crea antes de pedir el QR | La venta se registra en CREATED con nuestra `Idempotency-Key`. Si `POST /codi/qr` falla o se agota el tiempo, pasa a FAILED. Ese QR nunca se mostró, así que nadie puede pagarlo, y además vence (`expiration` de 600 s). |
| D11 | **Modo demo con la cuenta de la API key** (sin `bankAccountId`) | Dar de alta una CLABE tarda hasta 5 días hábiles en quedar `ACTIVE`. En modo demo (`PEY_ALLOW_DEFAULT_ACCOUNT=true`) **todo lo cobrado llega a la cuenta de la plataforma**. En producción cada negocio usa su propia cuenta `ACTIVE`. |
| D12 | **Pey no tiene sandbox**: se prueba en producción con $0.01 MXN, más un simulador | Lo recomienda el propio spec. Las pruebas automáticas usan el simulador (`provider = 'mock'`) y nunca llaman a Pey. |
| D13 | **Se agregan `product_price_history` y `payment_transactions`** | El historial responde "¿cuándo cambió el precio?". Un QR de Pey puede recibir varias transacciones (el endpoint las pagina), así que se guardan todas para conciliar. |
| D14 | **Cada partida tiene un tipo**: `producto`, `importe_libre` o `descuento` | El frontend ya genera "Cobro directo", "Importe adicional" y "Descuento". |
| D15 | **Interpretación de voz en dos pasos** | Primero las reglas de `voice-commands.js`, que ya están probadas, son rápidas y predecibles. Si no entienden la frase, se usa Ollama. El resultado siempre es un **borrador**: los precios salen del catálogo y el usuario confirma antes de cobrar. |
| D16 | **QR generado en el backend a partir de `qrString`** (pendiente de confirmar en la fase 5) | El spec advierte que `generateImage` vuelve más lenta la respuesta. Además, `demo-qr.js` admite 53 bytes como máximo y no sirve para un QR CoDi. |
| D17 | **Inicio de sesión por SMS** con Supabase Auth (teléfono +52) y Twilio como proveedor | Es lo que ya implementa el frontend (`supabase-auth.js`). Para pruebas: cuenta trial de Twilio y números de prueba con OTP fijo en Supabase, que no envían SMS. Pasos en `supabase/README.md`. |
| D18 | **Verificación local del JWT** con las llaves públicas del proyecto (JWKS), con HS256 legado como opción | No hace falta consultar a Supabase en cada petición. Se valida firma, emisor, audiencia `authenticated` y expiración, y se rechazan usuarios anónimos. |
| D19 | **El backend lee y escribe con el JWT del usuario** (RLS aplica) y usa la secret key solo para funciones restringidas | Si el backend tuviera un error de autorización, RLS seguiría impidiendo leer o escribir datos de otro negocio. |

## 3. Hallazgos del spec de Pey (`pey-openapi.json`, versión 2026-10-20)

| Tema | Lo que dice el spec | Impacto |
|---|---|---|
| Autenticación | `Authorization: Bearer <API key>` | `PEY_API_KEY` solo en el `.env` del backend |
| Entornos | Solo producción, `https://api.pey.mx` | Pruebas con $0.01 MXN y simulador en las pruebas automáticas |
| `POST /codi/qr` | `amount` ≥ 0 (con 0 el pagador escribe el monto), `expiration` 0 o ≥ 360, `numRef` `^[0-9]{1,7}$`, `bankAccountId` opcional, `metadata` con hasta 50 pares escalares | Siempre mandamos `amount` > 0 y `expiration` = 600. `numRef` es consecutivo por negocio. En `metadata` va `sale_id`. |
| Respuesta del QR | `201 { id (IDC), qrString, qrImage? }` | Se guardan `provider_qr_id` y `qr_string` |
| `POST /bank-account` | `alias`, `name`, `clabe` (18 dígitos con dígito verificador), `entity` (`PERSON` o `BUSINESS`). Queda `PENDING` y pasa a `ACTIVE` en hasta 5 días hábiles. | Guardamos solo los últimos 4 dígitos. `GET /bank-account/{id}` devuelve la CLABE completa: **nunca se reenvía al frontend**. |
| Transacciones | `status` PENDING o PAID; `amount` y `amountBreakdown { base, tip, fee }`; `datePaid` | PAID solo si `base` es mayor o igual al total de la venta |
| Errores | `{ error: { message, type, requestId } }`. Tipos: `INVALID_REQUEST`, `INVALID_AMOUNT`, `INVALID_PARAMETER`, `INVALID_STATE` (CoDi no habilitado), `PEY_CONSISTENCY_ERROR`, más 500 y 503 | Se traducen a nuestros códigos (ver `docs/API.md`) |
| Webhooks | `"webhooks": {}`. La documentación cita `/docs/webhooks/bank-account/updated`. | Pendiente: `docs.pey.mx` no fue accesible desde la sesión de diseño. Hay que obtener la documentación de webhooks (eventos de pago, firma, reintentos). |

## 4. Ciclo de vida de un cobro

```
CREATED ──► QR_GENERATED ──► PENDING ──► PAID (terminal)
   │             │              │
   │             ├──► PAID      └──► EXPIRED (solo tras periodo de gracia)
   │             ├──► EXPIRED ──┐
   │             └──► CANCELLED ┴──► PENDING / PAID  (pago tardío, paid_after_close)
   ├──► FAILED (terminal; el QR nunca se mostró)
   └──► CANCELLED
```

| Estado | Cuándo | Quién lo asigna |
|---|---|---|
| CREATED | `create_sale` | Backend |
| QR_GENERATED | Pey devolvió IDC y `qrString` | Backend |
| PENDING | Pey reporta una transacción PENDING | `apply_provider_transaction` |
| PAID | Pey reporta una transacción PAID con `base` ≥ total | `apply_provider_transaction` |
| EXPIRED | Pasó `expires_at` sin transacción; antes se consulta a Pey una última vez | Backend |
| CANCELLED | El usuario cancela y no hay pago en curso | Backend |
| FAILED | Pey rechazó la creación del QR o no respondió | Backend |

Correspondencia con los estados que ya usa el frontend (`movements.js`): PAID → `confirmed`; CREATED, QR_GENERATED y PENDING → `pending`; EXPIRED → `expired`; CANCELLED y FAILED → `failed`.

## 5. Seguridad

- **Autenticación**: Supabase Auth en el frontend. El backend verifica el JWT en cada petición y obtiene `user_id` de él, nunca del cuerpo de la petición.
- **Autorización**: el `business_id` de la URL se compara con `business_members`. RLS aplica la misma regla a las lecturas como segunda barrera.
- **Secretos** (solo en el `.env` del backend): `SUPABASE_SECRET_KEY`, `PEY_API_KEY`. Al frontend solo llegan la URL de Supabase y su publishable key.
- **Ollama** escucha en `127.0.0.1`, sin acceso desde fuera. Su salida se valida con un esquema y nunca decide precios ni ejecuta cobros.
- **Datos bancarios**: nunca se guarda la CLABE completa ni contraseñas o credenciales bancarias.
- **Probado** (`scripts/test-db.sh`, 76 aserciones; backend: `npm test`, 41 pruebas):
  - aislamiento entre negocios y por rol;
  - privilegios por columna;
  - tablas que solo escribe el backend;
  - idempotencia, totales recalculados y precios congelados en cada venta;
  - máquina de estados y pagos duplicados o insuficientes.

  Una prueba de mutación confirmó que la suite detecta políticas abiertas, permisos sin revocar, transiciones indebidas y pagos parciales.

## 6. Pendientes y riesgos abiertos

1. **Documentación de webhooks de Pey**: eventos, firma y reintentos. Mientras no exista, se confirma por consulta (D8).
2. **Ollama en CPU**: medir la latencia de `qwen2.5:3b` en la Kali sin GPU (fase 6). Si es alta, se usa `qwen2.5:1.5b` o se deja la IA solo para lo que las reglas no entiendan.
3. **Costo de SMS**: cada SMS real con Twilio cuesta unos centavos de dólar. Para la demo, números de prueba con OTP fijo.
4. **Disponibilidad**: la demo depende de que la máquina Kali esté encendida y conectada.
5. **Monto por QR**: el spec no fija un máximo para QR (el de push es $1,000,000). Usamos $999,999.99, igual que el frontend.
