# SEO y privacidad de las tiendas

La plataforma prepara estos recursos sin consumir créditos de IA. Se aplican a las tiendas públicas existentes y nuevas que se sirven con el servidor de checkout de pagosYa:

- HTML inicial legible con nombre, contenido publicado, catálogo, precios y enlaces de productos, antes de ejecutar JavaScript.
- Título, descripción, canonical, Open Graph, Twitter Card y datos estructurados de negocio, sitio, navegación y productos. Los precios, descuentos y existencias proceden del catálogo actual; no se inventan reseñas ni valoraciones.
- `/s/:slug/sitemap.xml` y `/s/:slug/llms.txt`. Los dominios verificados los reciben en `/sitemap.xml` y `/llms.txt`.
- `/robots.txt` y un índice de mapas de tiendas en `/sitemap.xml` del dominio compartido.
- Metadatos actualizados al navegar entre productos y páginas generadas. Las páginas de pago, seguimiento, recuperación de carrito, tarjeta Comeback y baja de correo se marcan para no indexarse. Los enlaces personales nunca se incorporan a los mapas.
- Sólo se utiliza la revisión publicada. Se respetan las páginas con `noindex`; las tiendas pausadas y los productos inexistentes devuelven 404. Los fallos temporales del API devuelven 503.

Los ZIP que se descarguen de nuevo incluyen los archivos de descubrimiento y metadatos. Sus canonical apuntan al sitio oficial configurado en `config.js`, mediante `publicSiteUrl` o `checkoutOrigin` y `slug`. Una exportación estática no incluye el renderizador del servidor central: si se aloja independientemente, hay que configurar su URL pública, rutas y renderizado de productos en ese alojamiento. Los archivos ZIP descargados antes de este cambio no se modifican solos.

## Despliegue

Configurar `CHECKOUT_ORIGIN` con la URL pública HTTPS del checkout, `PUBLIC_API_URL` con la URL pública HTTPS del API y `VITE_API_BASE_URL` al compilar el cliente. `INTERNAL_API_BASE_URL` puede apuntar al API por la red interna para el renderizador. Vite usa el mismo middleware en desarrollo. Producción debe ejecutar `apps/checkout/server.mjs` o montar `createStorefrontSeo` en el servidor equivalente; servir únicamente `dist/` como archivos estáticos no genera el HTML inicial ni los mapas dinámicos.

El proxy debe preservar el hostname original para los dominios propios. Sólo los dominios verificados y activos determinan una URL canónica. El sitio tiene que ser accesible públicamente: Google no puede indexar `localhost`. Una vez desplegado, verificar el dominio en Google Search Console, enviar su `/sitemap.xml` e inspeccionar una página de producto. El contenido útil, fotografías propias, descripciones completas, rendimiento y reputación siguen siendo trabajo del negocio.

`llms.txt` es un documento de descubrimiento para herramientas que lo admitan; Google indica que no lo usa para mejorar visibilidad ni clasificación. Estas mejoras no garantizan indexación ni el primer puesto: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

## Almacenamiento y consentimiento

El carrito y las preferencias pueden usar almacenamiento del navegador, aunque no se creen cookies HTTP. Comprar no exige aceptar estadísticas. El control **Privacidad y cookies** permite elegir **Solo necesarias** o **Permitir estadísticas**, cerrar el aviso y cambiar la elección después. La elección dura 180 días y se respeta Global Privacy Control.

El identificador de visitantes de pruebas A/B, su atribución de compras y la persistencia de enlaces de afiliados sólo se usan después de aceptar estadísticas. Al retirar el permiso se eliminan esos identificadores del navegador y se deja de adjuntarlos al checkout; se conserva el carrito. Aceptar se aplica a la próxima carga de la tienda. Los contadores agregados del servidor y registros operativos no necesitan crear identificadores en el navegador. La suscripción de correo y el recordatorio de carrito mantienen su consentimiento separado.

La integración común se expone como `window.PAGOSYA_PRIVACY.analyticsAllowed(slug)` y el evento `pagosya:privacy-change`. Los sitios generados alojados por pagosYa conservan su sandbox. El generador no debe añadir píxeles o scripts de seguimiento externos. Un script añadido manualmente a una exportación independiente debe integrarse con este consentimiento; este control no puede impedir por sí solo que código externo arbitrario cree sus propias cookies.

Las obligaciones legales concretas dependen de las tecnologías utilizadas y de dónde opere el comercio y estén sus clientes. El aviso técnico no sustituye la política de privacidad del negocio ni configura proveedores externos.
