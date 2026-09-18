# Opciones de producto por chat

YAPI puede crear productos con opciones y modificar combinaciones de productos existentes. Las opciones se guardan en el catálogo y se compran mediante el flujo de producto y checkout existente.

Ejemplos de pedidos:

- «Crea producto Camisa por Bs 120: color Negro talla M y color Blanco talla L, 5 de cada una. Blanco / L tiene un recargo de +Bs 20». Son dos combinaciones reales, con precios finales de Bs 120 y Bs 140.
- «Cambia el precio de la opción Blanco / L de Camisa a Bs 150».
- «Marca la opción Negro / M de Camisa como agotado» conserva su identidad y establece stock cero.
- «Agrega la combinación Negro / XL a Camisa, mismo precio, stock sin límite».
- «Elimina la combinación Blanco / L de Camisa». La eliminación requiere un pedido explícito; no se puede quitar la última combinación por esta vía.

Cada combinación tiene un ID estable `var_…`, un precio completo en unidades menores de la moneda, stock propio y una foto opcional (`imageUrl`). Se permiten hasta **3 grupos ordenados y 64 combinaciones reales por producto**; no se genera automáticamente el producto cartesiano de colores y tallas. Todos los registros estructurados deben usar los mismos grupos en el mismo orden, sin combinaciones duplicadas. Las fotos deben proceder de las URLs de archivos admitidas por el catálogo o los adjuntos; no se aceptan URLs inventadas.

El precio nuevo necesita una cita exacta del pedido, con moneda, o un recargo como `+Bs 20`. Una combinación nueva sin excepción de precio hereda el precio base confirmado. Su stock debe indicarse explícitamente: unidades, «agotado» o «sin límite». Stock cero significa agotado; `null` significa sin seguimiento. El flujo pide aclaración cuando faltan combinaciones, existencias o una identificación inequívoca del producto.

El recorrido de datos es el siguiente:

1. `source-chat.service.ts` incorpora al contexto los IDs y datos actuales del catálogo. `source-catalog-request.ts` conserva un pedido pendiente para respuestas cortas de aclaración, por ejemplo «Todas, 5 de cada una». Una cancelación o un nuevo pedido de diseño no arrastra ese contexto; después de guardar se limpia el pendiente.
2. `source-products.ts` y `source-product-options.ts` validan el resultado estructurado. Los productos nuevos usan `variants`; las ediciones usan `variantOperations` con `add`, `update` o `delete`, identificando las combinaciones existentes por `variantId`. No se representan como extras aditivos ni como selectores escritos en HTML generado.
3. `source-projects.service.ts` guarda los cambios del catálogo y la revisión del sitio en una transacción, y actualiza los productos de `config.js`. El precio base pasa a ser el mínimo de las combinaciones; el stock agregado es su suma cuando todas tienen seguimiento, o ilimitado cuando alguna es ilimitada. Las fotos de combinaciones se incorporan a la galería.
4. `product-variants.ts` normaliza y conserva la identidad de las combinaciones existentes. La tienda pública entrega estos datos al frontend. `apps/checkout/src/product-options.ts` obtiene grupos y disponibilidad exclusivamente de combinaciones existentes; la página de producto de `main.ts` muestra los selectores, el precio y la foto correspondientes. Permite deseleccionar y limpiar opciones, deshabilita selecciones incompatibles o agotadas y exige una combinación completa antes de agregar al carrito. El checkout valida en el servidor la identidad, el precio y el stock; el carrito envía `variantId`.

Las ediciones son parciales: se envían solo las combinaciones y campos solicitados. En una actualización, precio, stock o foto omitidos conservan sus valores. Antes de aplicar operaciones, el guardado bloquea la fila del producto (`FOR UPDATE`) y vuelve a leerla dentro de la transacción. Así, un cambio de precio no repone accidentalmente unidades vendidas después de preparar el contexto del modelo. Una modificación explícita de stock sí establece las unidades indicadas. No se permite sustituir el precio o stock agregado de un producto con combinaciones sin especificar las opciones afectadas.

Los productos sin opciones mantienen su comportamiento. Las opciones antiguas sin grupos conservan el selector de versiones. Las variantes heredadas que omiten `stock` siguen usando el inventario compartido del producto; para pasar a stock por combinación hay que asignarlo a todas. No se mezclan combinaciones estructuradas con variantes sin grupos ni seguimiento individual con stock heredado compartido.

Las tiendas generadas entregan la selección y compra de opciones a la página de producto confiable de PagosYa. El sandbox de Studio no simula todo el checkout de opciones.

La verificación realizada cubrió validadores, integración con PostgreSQL desechable, pruebas de tienda y revisión de navegador en escritorio y móvil. Las pruebas relevantes están en:

- `apps/api/src/stores/source-product-options.spec.ts`: precios, stock explícito, operaciones parciales, inventario concurrente, duplicados y compatibilidad heredada.
- `apps/api/src/stores/source-catalog-request.spec.ts`: continuidad de aclaraciones y exclusión de pedidos ajenos.
- `apps/api/src/stores/source-products.spec.ts`: validación de creación y cambios de catálogo.
- `apps/api/test/source-projects.e2e-spec.ts`: persistencia de combinaciones, IDs, precios, conservación de stock y rechazos de checkout.
- `apps/checkout/test/store.test.ts`: selección de opciones, carrito, disponibilidad y compatibilidad de variantes.

La revisión visual usó Chrome con una tienda local de prueba (`tmp/product-options/serve.cjs`); las capturas quedaron en `tmp/product-options/desktop.png` y `tmp/product-options/mobile.png`. Son artefactos locales de verificación, no una prueba automatizada de navegador retenida.

No se probó una ejecución pagada con un modelo en vivo; la integración utiliza datos estructurados controlados.
