# Ruleta diaria y tablero de Horizonte — Diseño

**Fecha:** 2026-09-24
**Estado:** aprobado (2026-09-24)
**Alcance:** `apps/api` (módulo nuevo `rewards`, cambios en `dashboard`, `storefront-source`), `apps/merchant-dashboard`

## Objetivo

Dar al comerciante dos juegos que premian la constancia y las ventas, con premios que valgan algo:

1. **Ruleta diaria:** se abre sola en el primer ingreso del día (hora de Bolivia).
2. **Tablero en Horizonte pagosYa:** el personaje avanza por casillas del mapa tirando un dado; se gana 1 tiro cada 10 ventas.

Ambos juegos entregan los mismos premios: XP, créditos de IA (YAPI), stickers y misiones/consejos. Los premios más caros son los más raros.

## Qué existe hoy

- **Ruleta** (cambios sin commitear en `apps/merchant-dashboard/src/dashboard.js`, `LUCK_WHEEL_*`): 100% en el navegador y guardada en localStorage. Da stickers, misiones, consejos, fiesta y "+1 giro", y a propósito no da XP. Se reutilizan su SVG, su animación, los sonidos y el confeti.
- **XP:** se calcula, no se guarda. `ventas × 50 + visitas × 2`, en el dashboard (`gamificationState`) y en el servidor (`MerchantSessionService.authoritativeProgressLevel`, que alimenta las celebraciones de nivel). Va por tienda.
- **Estrella diaria:** `POST /dashboard/daily-login-reward` → `claimDailyLoginStar`, con el día calculado en hora de Bolivia (`boliviaDayStart`).
- **Créditos de IA:** solo se miden. `CREDIT_MICRO_USD = 10_000` (1 crédito = US$0.01), y cada `StoreSourceGeneration` / `StoreSourceDesignJob` guarda lo que consumió. No existe ningún saldo.
- **Horizonte pagosYa:** el mapa de ruta con los niveles (`ADVENTURE_LEVELS`) y el compañero de cada nivel.

## Decisiones

- **El servidor manda.** El servidor elige el premio y lo guarda; el navegador solo anima hasta el resultado que recibió. Nada que tenga valor (XP, créditos, stickers) vive en localStorage.
- **Créditos = créditos de IA de YAPI**, en un saldo de premios por comercio.
- **Tablero con dado:** 1 tiro cada `BOARD_SALES_PER_ROLL = 10` ventas exitosas de la tienda. Es una constante y se puede cambiar a 20.
- **Tope mensual:** como máximo `AI_CREDIT_MONTHLY_CAP = 50` créditos de premio por comercio y mes calendario en hora de Bolivia (≈ US$0.50). Pasado el tope, un premio de créditos se entrega como +200 XP.

## Tabla de premios

La tabla es compartida por los dos juegos y vive en un solo archivo de política (`reward-policy.ts`).

| Premio | Clave | Peso en la ruleta |
|---|---|---|
| Sticker común | `STICKER_COMMON` | 27 |
| +25 XP | `XP_25` | 25 |
| Misión / consejo / fiesta | `TIP` | 13 |
| +50 XP | `XP_50` | 14 |
| Sticker raro | `STICKER_RARE` | 7 |
| +1 giro | `RESPIN` | 5 |
| +200 XP | `XP_200` | 5 |
| 5 créditos IA | `AI_CREDITS_5` | 3.5 |
| 25 créditos IA | `AI_CREDITS_25` | 0.5 |

Los pesos suman 100. `RESPIN` solo existe en la ruleta. "Fiesta" es una variante visual de `TIP` (el compañero baila) y no entrega nada.

**Tablero:** un anillo de `BOARD_TILES = 24` casillas, cada una con un premio fijo: 9 sticker común, 5 XP_25, 3 TIP, 3 XP_50, 1 STICKER_RARE, 1 XP_200, 1 AI_CREDITS_5 y 1 AI_CREDITS_25 (el premio mayor). Las 4 casillas caras (STICKER_RARE, XP_200, AI_CREDITS_5, AI_CREDITS_25) están en las posiciones 9, 15, 3 y 21: separadas exactamente 6 casillas, la máxima separación posible en 24. El dado es `1..6` y uniforme. El orden de las casillas es fijo y está definido en la política.

**Stickers:** el catálogo actual (`LUCK_WHEEL_STICKERS`, 7 comunes y 2 raros) pasa a la política del servidor. Se entrega primero un sticker que el comerciante no tenga; si ya tiene todos los del grupo, sale uno repetido.

## Modelo de datos

```prisma
enum RewardSource { WHEEL BOARD }
enum RewardKind { XP AI_CREDITS STICKER TIP RESPIN }

// Registro de cada premio entregado. Es la única fuente de XP de juegos y de stickers.
model RewardGrant {
  id             String       @id @default(cuid())
  merchantId     String
  storeId        String
  merchantUserId String
  source         RewardSource
  kind           RewardKind
  amount         Int          @default(0)   // XP o créditos; 0 para el resto
  stickerId      String?
  tipId          String?
  convertedFrom  RewardKind?                // AI_CREDITS convertido a XP por el tope
  createdAt      DateTime     @default(now())

  @@index([storeId, kind])
  @@index([merchantId, kind, createdAt])
  @@index([merchantUserId, stickerId])
}

// Un giro por usuario, por día y por intento. `attempt` 0 es el giro gratis; 1+ son giros ganados con RESPIN.
model DailyWheelSpin {
  merchantUserId String
  day            String   // YYYY-MM-DD en hora de Bolivia
  attempt        Int
  grantId        String   @unique
  createdAt      DateTime @default(now())

  @@id([merchantUserId, day, attempt])
}

model BoardState {
  storeId        String   @id
  merchantId     String
  position       Int      @default(0)  // 0..BOARD_TILES-1
  rollsUsed      Int      @default(0)
  lapsCompleted  Int      @default(0)
  updatedAt      DateTime @updatedAt
}

// Saldo de créditos de IA ganados en premios. Los movimientos están en RewardGrant (+) y AiCreditRedemption (−).
model AiCreditRedemption {
  id           String   @id @default(cuid())
  merchantId   String
  credits      Int
  generationId String   @unique
  createdAt    DateTime @default(now())

  @@index([merchantId])
}
```

**Saldo de créditos** = Σ `RewardGrant.amount` donde `kind = AI_CREDITS` − Σ `AiCreditRedemption.credits`, por comercio. Se calcula en el momento; no hay una columna con el saldo que se pueda desincronizar.

## API (módulo `rewards`, todo bajo `MerchantSessionGuard`)

| Endpoint | Qué hace |
|---|---|
| `GET /dashboard/rewards?storeId=` | `{ wheel: { available, day, last }, board: { position, rollsAvailable, salesUntilNextRoll, tiles }, bonusXp, stickers: [...], aiCreditBalance, aiCreditsThisMonth }` |
| `POST /dashboard/rewards/wheel/spin` `{ storeId }` | Elige el premio, guarda `RewardGrant` y `DailyWheelSpin` en una misma transacción y devuelve `{ segmentIndex, grant, wheel }`. Responde 409 si no queda giro disponible. |
| `POST /dashboard/rewards/board/roll` `{ storeId }` | Tira el dado, mueve la posición y entrega el premio de la casilla. Devuelve `{ die, from, to, lapCompleted, grant, board }`. Responde 409 si no quedan tiros. |

`POST /dashboard/daily-login-reward` agrega `wheelAvailable: boolean` a su respuesta para que el dashboard decida si abre el modal.

**Disponibilidad de la ruleta:** `giros permitidos hoy = 1 + premios RESPIN de hoy`. Hay giro disponible si `giros usados hoy < giros permitidos hoy`, y el siguiente giro usa `attempt = giros usados hoy`.

**Tiros del tablero:** `rollsAvailable = max(0, floor(ventasExitosas / 10) − rollsUsed)`. Las ventas exitosas se cuentan con la misma consulta que `authoritativeProgressLevel`: `PaymentIntent` `SUCCEEDED` con `metadata.storeId`. Esa consulta se extrae a un helper compartido.

## Concurrencia e integridad

- **Ruleta:** la clave primaria `(merchantUserId, day, attempt)` hace que el segundo giro concurrente falle con una violación de unicidad → se responde 409.
- **Tablero:** un `updateMany` condicional (`where: { storeId, rollsUsed: expected }`) dentro de la transacción. Si afecta 0 filas → 409. El `BoardState` se crea con upsert.
- **Tope de créditos:** se revisa dentro de la misma transacción que entrega el premio, sumando los créditos del mes actual.
- **Aleatoriedad:** se usa `crypto.randomInt` y se inyecta como dependencia para que las pruebas sean deterministas.
- Los premios no se quitan nunca, ni siquiera ante reembolsos; los tiros disponibles simplemente no bajan de 0.

## Integración del XP

- **Servidor:** `authoritativeProgressLevel` suma Σ `RewardGrant.amount` de tipo `XP` para la tienda. Así las celebraciones de nivel también cuentan el XP de juegos.
- **Dashboard:** `gamificationState` suma `bonusXp` (que viene de `GET /dashboard/rewards`) a `salesXp + visitsXp`, y la tarjeta de XP muestra "de juegos" como una fuente más.

## Consumo de créditos de IA

Cuando un `StoreSourceGeneration` termina bien (estado `COMPLETED` o `CANDIDATE`, con `credits` ya guardado), justo después de esa escritura se crea un `AiCreditRedemption` por `min(saldo, credits)` si el saldo es mayor a 0. Los trabajos de diseño (`StoreSourceDesignJob`) generan a través de `StoreSourceGeneration`, así que quedan cubiertos por la misma regla. El `@unique` de `generationId` evita descontar dos veces, y si el descuento falla solo se registra una advertencia: la generación del comerciante nunca falla por esto. La lista de ejecuciones de YAPI muestra "X créditos cubiertos por premios". **No cambia** la medición de uso ni los presupuestos (`maxCredits`).

## Dashboard

**Ruleta**
- Se mantiene la sección de la ruleta en gamificación y se agrega un modal (`luckWheelModal`) que reutiliza el mismo componente.
- Después de `claimDailyLoginReward`, si `wheelAvailable` es verdadero, se abre el modal una sola vez por carga de página.
- `spinLuckWheel` llama a la API **antes** de animar. Con el `segmentIndex` recibido, calcula la rotación con la misma lógica de hoy. Si hay un error, no gira y se muestra un mensaje en `luckWheelStatus`.
- Se borran el álbum y el estado de localStorage (`pagosya_luck_*`); ahora el álbum sale de `stickers`.
- Los segmentos visuales se actualizan a la tabla nueva (XP, créditos, sticker, raro, consejo, +1 giro).

**Tablero en Horizonte**
- Un anillo de 24 casillas dibujado encima del mapa de Horizonte. Cada casilla muestra el ícono de su premio y el compañero actual es la ficha.
- Un panel con el dado (cara animada), "Tirar dado (N)" y "Te faltan X ventas para el próximo tiro".
- Al tirar: se llama a la API y luego la ficha salta casilla por casilla (unos 180 ms por salto; con `prefers-reduced-motion` se mueve directo). Después aparece la tarjeta del premio y el confeti.
- El botón queda deshabilitado mientras se espera la respuesta o dura la animación.

**Animación al ganar XP**

Cuando un premio da XP (en la ruleta o en el tablero), tiene que notarse que la barra sube. Una sola función, `celebrateXpGain(previousXp, gainedXp)`, se ejecuta después de la tarjeta del premio y anima todas las barras de XP que estén visibles: la barra de resumen de arriba (`gamificationSummaryTrack`), la de la sección de gamificación y la de Horizonte (`adventureXpTrack`).

1. **La barra se llena poco a poco** desde el valor anterior hasta el nuevo, en unos 900 ms con desaceleración. No salta de golpe.
2. **Brillo:** mientras se llena, un reflejo de luz recorre el relleno de izquierda a derecha y la barra tiene un resplandor dorado (`box-shadow`). Al terminar, da un pequeño "latido" (`scale` 1 → 1.04 → 1).
3. **Número que cuenta:** el texto de XP (`gamificationSummaryXp`, `adventureXpValue`) sube contando del valor anterior al nuevo al mismo ritmo que la barra.
4. **Etiqueta "+N XP":** aparece encima de la barra de arriba y sube desvaneciéndose. Reutiliza el estilo de `adventure-xp-pop` / `showAdventureXpToast`.
5. **Si sube de nivel:** la barra se llena hasta el 100%, destella en blanco, vuelve a 0 y se llena con lo que sobra. Después se dispara la celebración de nivel que ya existe (`gamificationCelebration`, con el compañero nuevo).
6. **Sonido:** un tono corto ascendente, reutilizando el contexto de audio de la ruleta (`adventureAudioContext`), y solo si el sonido está activado.
7. **Movimiento reducido:** con `prefers-reduced-motion`, la barra cambia directo al valor final, sin reflejo ni latido. La etiqueta "+N XP" se muestra fija durante 2 segundos.
8. **Accesibilidad:** se actualiza `aria-valuenow`, y un `aria-live="polite"` anuncia "Ganaste N XP".

Si la barra de arriba no está en pantalla (por ejemplo, porque el usuario bajó con el scroll), la animación espera hasta que se vea, usando un `IntersectionObserver`, para que no se la pierda.

## Pruebas

- **Unitarias (`reward-policy.spec.ts`):** que los pesos sumen 100; que 100.000 tiradas con una semilla fija queden dentro de ±0.5 puntos de cada peso; que el tablero tenga 24 casillas con la cantidad correcta de cada premio y las casillas caras separadas; que el tope convierta créditos en XP; que un sticker nuevo tenga prioridad sobre uno repetido.
- **E2E de API (`rewards.e2e-spec.ts`):** un giro gratis por día; 409 en el segundo; RESPIN habilita otro giro; al cambiar el día en hora de Bolivia se vuelve a habilitar; 9 ventas → 0 tiros y 10 ventas → 1 tiro; tiradas concurrentes → exactamente un éxito; el XP de juegos cambia `pendingProgressCelebrations`; el descuento de créditos al completar una generación se hace una sola vez.
- **Dashboard:** que el modal se abra solo cuando `wheelAvailable` es verdadero y que un error de la API no haga girar la ruleta; que un premio de XP anime la barra de arriba (reflejo y conteo) y actualice `aria-valuenow`; que un premio que cruza de nivel llene al 100%, reinicie y dispare la celebración; que con `prefers-reduced-motion` no haya animación.

## Fuera de alcance

- Skins del personaje y cualquier tienda de premios.
- Cobro real de YAPI (hoy solo se mide).
- Rankings entre comerciantes.
- Movimiento libre del personaje por el mapa: solo avanza con el dado.

