# Base de inventario de ejemplo: Café Aroma

Este ejemplo representa una base externa de una cafetería. Es independiente de la base principal de pagosYa y usa SQLite para que puedas probarla sin instalar otro servidor.

## 1. Crear la base

```bash
pnpm demo:inventory-db
```

Esto genera `examples/cafe-aroma/inventory.sqlite` con ocho productos, tres clientes, dos planes mensuales y tres suscripciones. Puedes abrir el archivo con cualquier cliente SQLite.

## 2. Importar el catálogo

En pagosYa, crea primero una conexión de tipo **Base propia** y guarda el secreto. Después abre **Productos → Importar cualquier inventario con IA**:

1. Selecciona `catalogo-pagosya.csv`.
2. En **Conexión de stock**, elige la conexión que acabas de crear.
3. Revisa e importa.

Los productos se crean con sus SKU y quedan mapeados a esa conexión en la misma operación.

## 3. Cambiar una cantidad en la base externa

```bash
pnpm demo:inventory-stock -- CAF-001 17
```

## 4. Enviar el stock a pagosYa

Usa el endpoint y el secreto que aparecen una sola vez al crear la conexión:

```bash
PAGOSYA_STOCK_ENDPOINT="http://localhost:3001/v1/integrations/ID/stock" \
PAGOSYA_SYNC_SECRET="sync_REEMPLAZAR" \
pnpm demo:inventory-sync
```

La sincronización envía cantidades absolutas: si SQLite contiene `17`, pagosYa deja el producto en `17`; no suma 17.

Nunca guardes el secreto `sync_...` dentro de este directorio, el CSV o el repositorio.

## 5. Conectar los planes mensuales

En **Centro operativo → Finanzas**, crea estos dos planes con sus importes en centavos:

- `Club Café mensual`: Bs 150,00.
- `Desayunos del mes`: Bs 240,00.

Después, en **Centro operativo → Conexiones**, usa **Mapear plan recurrente**:

- `CAFE-MENSUAL` → `Club Café mensual`.
- `DESAYUNO-MENSUAL` → `Desayunos del mes`.

El código externo cumple para las suscripciones la misma función que el SKU para los productos.

## 6. Sincronizar suscripciones y generar el cobro

Usa el endpoint de suscripciones mostrado al crear la conexión:

```bash
PAGOSYA_SUBSCRIPTIONS_ENDPOINT="http://localhost:3001/v1/integrations/ID/subscriptions" \
PAGOSYA_SYNC_SECRET="sync_REEMPLAZAR" \
pnpm demo:subscriptions-sync
```

El ejemplo contiene una suscripción vencida. Al sincronizarla, PagosYa crea o actualiza el cliente, registra la suscripción, genera una sola cuota para ese período y devuelve su enlace de pago. Repetir el comando no duplica esa cuota.

Las suscripciones `PAUSED` y `CANCELED` se sincronizan, pero no generan nuevos cobros. `amount_override_centavos` permite que una persona tenga un importe distinto al precio normal del plan.
