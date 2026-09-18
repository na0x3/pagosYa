# Comeback y correos

En **Diseñar sitio → Comeback y correos**, cada negocio puede activar:

- **Comeback:** meta de 2 a 50 compras en días distintos, regalo descrito por el negocio y tarjeta personal enviada por correo. El canje se registra en **Clientes y canjes** al entregar el premio físicamente. No añade un producto gratis automáticamente al checkout.
- **Comunidad:** ventana de suscripción con foto real del catálogo, identidad de la tienda, título, descripción y botón editables. Correo obligatorio; nombre, teléfono e intereses (categorías del negocio) opcionales, visibles luego en Clientes y canjes. Mantiene consentimiento independiente del carrito y de la tarjeta. Se abre una vez por sesión y puede reabrirse con “Comunidad”; no se abre sobre tarjetas privadas, carritos recuperados o vistas previas. No crea descuentos automáticamente.
- **Bienvenida:** correo opcional, una sola vez por suscriptor; `{{store}}` inserta el nombre del negocio.
- **Recuperación de carrito:** el cliente guarda sus productos y acepta un recordatorio. Espera configurable entre 1 y 168 horas; un recordatorio por carrito y máximo uno por destinatario cada siete días.
- **Campañas:** guardar borrador, revisar el mensaje y enviarlo explícitamente a los suscriptores activos. El panel muestra suscriptores recientes y estados de entrega.
- **Reseñas después de la entrega:** opción para pedir una reseña 24 horas después de marcar un pedido como entregado. Se envía como máximo un correo por pedido y el enlace abre el seguimiento privado con un formulario por producto.

Todas las herramientas comienzan desactivadas. No utilizan la API de IA. El correo usa el proveedor existente, Resend (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, dominio de envío verificado), y llega a Gmail u otros proveedores. `CHECKOUT_ORIGIN` debe apuntar a la tienda accesible públicamente para los enlaces. No es una integración con la bandeja personal de Gmail.

## Reglas de Comeback

Se consideran pagos reales (`livemode`), con estado `SUCCEEDED` y captura exitosa. La fecha es la del primer cobro confirmado, en la zona horaria del programa. Se excluyen compras anteriores a la creación del programa, pagos de prueba y compras totalmente reembolsadas (incluido saldo devuelto). Varias compras el mismo día suman un sello. La zona horaria queda fijada al guardar la configuración inicial.

El cliente usa el mismo correo al comprar y para solicitar su tarjeta. La API no revela tarjeta, historial ni token a quien escribe un correo: manda un enlace privado a esa dirección. El código de premio se deriva de la tarjeta y los días disponibles. El canje vuelve a comprobar las compras dentro de una transacción que bloquea la tarjeta: cada día y código se consume una sola vez. Un reembolso posterior a la entrega no revierte un regalo ya entregado. Cambiar la meta actualiza los premios aún no canjeados.

## Correo y consentimiento

Los envíos usan una cola persistente con claves únicas, reclamo atómico de tareas, clave de idempotencia de Resend y hasta cuatro intentos. Los trabajos fallidos se muestran como fallidos y conservan un mensaje de proveedor truncado y con correos redactados para facilitar el diagnóstico. Los reintentos se detienen antes de exceder la ventana de idempotencia del proveedor; tareas que estuvieron en cola mucho tiempo pueden fallar de manera conservadora en vez de arriesgar un envío duplicado. Un trabajador de Nest revisa la cola cada minuto. Sin proveedor configurado, conserva pendientes y bloquea el envío de campañas.

Los correos comerciales incluyen enlace de baja. La baja se confirma con un botón (no con abrir el enlace, para evitar bajas causadas por escáneres de correo) y cancela campañas, bienvenidas y carritos pendientes. Antes de enviar se vuelve a comprobar el consentimiento y el estado de la tienda; para carritos también el pago asociado o una compra posterior con el mismo correo. El recordatorio de carrito no suscribe a campañas. Las suscripciones existentes siguen usando la misma lista por tienda. Los pedidos de reseña solo se crean cuando el comercio activa explícitamente la opción y se cancelan si el pedido deja de estar entregado.

La recuperación guarda identificadores, cantidades y opciones; nunca fija precios. El catálogo y checkout vuelven a validar disponibilidad y total. Los enlaces de recuperación vencen a los 30 días. El checkout vincula el carrito guardado mediante un token opaco; los navegadores no pueden vincular un carrito solo con un correo.

## Integración de tienda

La tarjeta Comeback aparece automáticamente después de una compra real confirmada, solo si el negocio activó el programa. Hereda el nombre, logo, colores confirmados de marca (o ajustes publicados) y familia tipográfica; incluye sellos, nombre del cliente y un QR real. El QR de un premio completo contiene su código de canje.

El comprobante y seguimiento muestran únicamente el sello de esa compra. Un pago no verifica la propiedad del correo escrito: el historial, los premios acumulados y los códigos de canje permanecen detrás del enlace privado enviado al correo del comprador. El botón de envío usa el correo del pedido y no suscribe a promociones. La tarjeta se crea de forma idempotente al abrir el comprobante; si falta correo, el pago es de prueba, el programa está apagado o el pedido fue reembolsado totalmente, no se muestra.

El runtime incluye las demás secciones con colores y tipografía del sitio. Los sitios generados pueden posicionarlas con `data-pagosya-subscribe` y `data-pagosya-comeback`; esta última permanece oculta al navegar y solo muestra la tarjeta al abrir su enlace privado. Funciona con la tienda clásica, páginas generadas alojadas en el iframe aislado y exportaciones nuevas. Las vistas previas no envían correos ni guardan clientes.

API autenticada: `/v1/stores/:storeId/retention` (configuración, campañas, canje). API pública limitada por tienda: `/v1/stores/public/:slug/retention` (configuración pública, suscripción, tarjeta, baja, carrito). Todos los endpoints de administración verifican el comercio propietario.

Validación: pruebas de reglas de días/reembolsos, integración con PostgreSQL para canjes concurrentes, permisos, consentimiento, campañas, recuperación y reintentos; recorridos Playwright de panel y tienda en escritorio/móvil. Los correos en pruebas están simulados.

La migración `20260910220000_subscriber_profile` añade nombre, teléfono e intereses a los suscriptores existentes sin modificar sus direcciones ni consentimientos.
