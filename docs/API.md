# CobraVoz · Contratos de la API REST (v1)

Base: `/api` (el frontend la llama en su mismo origen; Netlify la reenvía al backend).
Formato: JSON UTF-8. Importes en **centavos enteros** (`*_centavos`). Fechas en ISO 8601 UTC.

## Convenciones

| Tema | Regla |
|---|---|
| Autenticación | `Authorization: Bearer <access_token de Supabase>` en todas las rutas salvo `/api/health` y `/api/webhooks/*` |
| Negocio | `:bid` en la ruta. El backend verifica que el usuario sea miembro; si no lo es, responde `404` para no revelar si el negocio existe |
| Idempotencia | `Idempotency-Key: <uuid>` **obligatoria** en `POST /sales`. El mismo cuerpo devuelve la misma venta; un cuerpo distinto devuelve `409` |
| Paginación | `?limit=20&cursor=<opaco>` → `{ items, next_cursor }` |
| Trazabilidad | Cada respuesta lleva `X-Request-Id` |

### Errores

```json
{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "No encontramos ese producto.", "request_id": "01J..." } }
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` (+ `details[]`) | El cuerpo no cumple el esquema |
| 401 | `UNAUTHENTICATED` | Falta el token, es inválido o expiró |
| 403 | `FORBIDDEN` | Es miembro, pero su rol no alcanza (p. ej. un cajero editando precios) |
| 404 | `NOT_FOUND` | El recurso no existe o no es de su negocio |
| 409 | `IDEMPOTENCY_CONFLICT`, `INVALID_STATE`, `PRICE_CONFIRMATION_REQUIRED` | Conflictos de estado |
| 422 | `PAYMENT_ACCOUNT_NOT_ACTIVE`, `AMOUNT_OUT_OF_RANGE` | Regla de negocio |
| 429 | `RATE_LIMITED` | Demasiadas peticiones |
| 502 | `PROVIDER_ERROR` | Pey respondió 4xx o 5xx inesperado (se registra su `requestId`, no se expone) |
| 503 | `PROVIDER_UNAVAILABLE`, `AI_UNAVAILABLE` | Pey o Ollama no responden (Ollama caído no bloquea: queda la captura manual) |

## Endpoints

### Sistema y cuenta
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/health` | público | `{ status, version }` |
| GET | `/api/me` | autenticado | Perfil y negocios con su rol |
| PATCH | `/api/me` | autenticado | `{ nombre_completo?, telefono? }` |

### Negocios y equipo
| Método | Ruta | Rol |
|---|---|---|
| POST | `/api/businesses` | autenticado (queda como dueño) |
| GET | `/api/businesses/:bid` | miembro |
| PATCH | `/api/businesses/:bid` | owner, admin |
| GET / POST / DELETE | `/api/businesses/:bid/members[/:uid]` | owner (preparado, no prioritario para la demo) |

### Catálogo
| Método | Ruta | Rol |
|---|---|---|
| GET | `/api/businesses/:bid/products?activo=true&q=taco` | miembro |
| POST | `/api/businesses/:bid/products` → `{ nombre, precio_actual_centavos }` | owner, admin |
| PATCH | `/api/businesses/:bid/products/:id` → `{ nombre?, activo? }` | owner, admin |
| PUT | `/api/businesses/:bid/products/:id/price` → `{ precio_centavos, origen: "manual"\|"voz" }` | owner, admin |
| GET | `/api/businesses/:bid/products/:id/price-history` | miembro |

### Cuentas de cobro (Pey)
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| POST | `/api/businesses/:bid/payment-accounts` | owner | `{ alias, titular_nombre, clabe, entidad }`. La CLABE se valida (dígito verificador), se envía a Pey y **no se guarda**: solo los últimos 4 dígitos |
| GET | `/api/businesses/:bid/payment-accounts` | owner, admin | Consulta el estado en Pey si sigue `PENDING` o `PROCESSING` |

### Voz
`POST /api/businesses/:bid/voice/interpret`. Rol: miembro. **Nunca cobra.**

```json
// Solicitud
{ "texto": "cobra dos tacos y una coca, los tacos a 25", "venta_actual": [] }

// Respuesta 200
{
  "voice_command_id": "uuid",
  "intent": "create_sale",
  "parser": "reglas",
  "mensaje": "Total $58.00 con precios del catálogo. Los tacos están en $20.00; dijiste $25.00. ¿Actualizo el precio?",
  "items": [
    { "tipo": "producto", "product_id": "uuid", "nombre": "Tacos", "cantidad": 2,
      "precio_unitario_centavos": 2000, "precio_dictado_centavos": 2500, "subtotal_centavos": 4000 },
    { "tipo": "producto", "product_id": null, "nombre": "coca", "cantidad": 1,
      "precio_unitario_centavos": 1800, "es_nuevo": true, "subtotal_centavos": 1800 }
  ],
  "discrepancias": [
    { "product_id": "uuid", "nombre": "Tacos", "precio_catalogo_centavos": 2000, "precio_dictado_centavos": 2500 }
  ],
  "total_centavos": 5800,
  "requiere_confirmacion": true
}
```

Reglas:
- **Precio**: si el producto existe, se usa el del catálogo y la diferencia con lo dictado se reporta en `discrepancias`. El usuario elige "usar el precio dictado solo en esta venta" o "actualizar el precio habitual" (`PUT .../price`, `origen: "voz"`).
- **Productos nuevos**: llegan con `es_nuevo: true` y el precio dictado. Se agregan al catálogo solo si el usuario lo confirma.
- **Preguntas** (`intent: "query_stats"`): devuelven `{ consulta, resultado }` calculado con SQL, por ejemplo `{ "metrica": "ventas_total", "periodo": "hoy" }` → `{ "total_centavos": 125000, "ventas": 14 }`. La IA solo clasifica la pregunta; las cifras salen de la base de datos.
- **Si Ollama no responde**: `parser: "ninguno"` y un mensaje que invita a escribir o usar la calculadora.

### Cobros
`POST /api/businesses/:bid/sales`. Rol: miembro. Cabecera `Idempotency-Key` obligatoria.

```json
// Solicitud: el usuario ya confirmó
{
  "origen": "voz",
  "concepto": "2 tacos y 1 coca",
  "voice_command_id": "uuid",
  "items": [
    { "tipo": "producto", "product_id": "uuid", "cantidad": 2, "precio_unitario_centavos": 2000 },
    { "tipo": "producto", "product_id": null, "nombre": "coca", "cantidad": 1, "precio_unitario_centavos": 1800 }
  ]
}

// Respuesta 201 (200 si es un reintento con la misma llave)
{
  "id": "uuid", "estado_pago": "QR_GENERATED", "total_centavos": 5800, "moneda": "MXN",
  "concepto": "2 tacos y 1 coca", "num_ref": "42",
  "qr": { "string": "...", "svg": "<svg ...>" },
  "expires_at": "2026-11-15T18:10:00Z", "created_at": "2026-11-15T18:00:00Z"
}
```

- El backend comprueba que cada `precio_unitario_centavos` sea el del catálogo o un precio dictado que el usuario confirmó en el paso de voz. Si no coincide, responde `409 PRICE_CONFIRMATION_REQUIRED`.
- Si Pey falla, la venta queda en `FAILED` y la respuesta es `502` o `503` con `sale_id`. No se devuelve ningún QR.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/businesses/:bid/sales?estado=&desde=&hasta=&q=&cursor=` | Historial (con partidas resumidas) |
| GET | `/api/businesses/:bid/sales/:id` | Detalle. Si está en `QR_GENERATED` o `PENDING`, consulta a Pey (con límite de frecuencia) antes de responder |
| POST | `/api/businesses/:bid/sales/:id/cancel` | Solo desde `CREATED` o `QR_GENERATED`. Si no, `409 INVALID_STATE` |

Al frontend le basta consultar `GET /sales/:id` cada 3 a 5 segundos mientras el QR está visible. Más adelante esto puede pasar a Supabase Realtime.

### Estadísticas
`GET /api/businesses/:bid/stats?metrica=ventas_total|producto_top|unidades_producto&periodo=hoy|ayer|semana|mes&product_id=`

Solo cuenta ventas `PAID`. Los periodos se calculan en la zona `America/Mexico_City`.

### Webhooks
`POST /api/webhooks/pey`: no usa JWT. Guarda el evento en `payment_events` con deduplicación y después **consulta a Pey** para obtener el estado real (D8). Su verificación de firma está pendiente de la documentación de Pey.
