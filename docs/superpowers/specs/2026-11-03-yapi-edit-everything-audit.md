# YAPI edita todo — auditoría (2026-11-03)

Dueño 2026-11-03 (DooBoo ti8bpobb): «quiero que yapi sepa editar todo lo de la página porque los usuarios piden cualquier cosa».
Esta es la lista de cada parte de una **tienda con plantilla** (Esencial con `layout`: las 34 plantillas y Único): qué pide un
comerciante, qué hace YAPI hoy y dónde vive el dato. Sirve para escribir la especificación por prioridad.

Leyenda:
- ✅ **Seguro**: un camino propio, rápido, que guarda datos y no toca el código.
- ⚠️ **Solo edición libre**: cae en la edición de diseño (el agente reescribe archivos). Lenta (minutos), cara, puede romper
  algo, y en una plantilla termina a menudo en «No logré que ese cambio se vea» (el guardián de §5 la deshace).
- ❌ **No puede**: no hay campo ni herramienta, o el cambio se tira.

## Cómo se decide hoy (orden en `send`, `source-chat.service.ts`)
1. Precio de envío en las palabras → `shippingEdit` (zonas de entrega). ✅
2. Único: títulos / ánimo → `titleEdit`, `moodEdit`. ✅
3. «Otra plantilla» / «cámbiala a Tacón» → `switchTemplate`. ✅
4. Formulario de contacto sí/no → `setContactForm`. ✅
5. Tienda con `layout` → `templateLayoutEdit` (`editLayout`: texto, quitar, mover, agregar sección de la biblioteca). ✅
   Lo que no entra (`rest`) sigue como pedido aparte ↓
6. `masterContentEdit` (`fillMaster`): color de acento, menú, variantes. En una plantilla **borra** `copy`, `sections`,
   `heroPhoto`, `storyPhoto` del cambio (la portada no los lee).
7. Todo lo demás → edición de diseño (agente con `edit_file`, `set_store_policy`, `create_page`, `set_product_card_theme`…),
   y en plantilla el guardián `visibleChanges` la deshace si no cambió nada que el comprador vea.

## Parte por parte

### 1. Portada
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Cambia el título de la portada a …» | ✅ `editLayout` text | `layout[].title` |
| «Quita la sección de reseñas», «sube los beneficios» | ✅ remove / move | `layout` |
| «Agrega preguntas frecuentes en la portada» | ✅ add (biblioteca, máx. 2) | `layout` |
| «Cambia la foto de la portada / de esa sección» | ❌ el digest no manda fotos; `heroPhoto` se borra en plantilla → ⚠️ / «No logré» | `layout[].photo`, `items[].photo` |
| «Pon este video de fondo» | ⚠️ `heroVideo` existe en `MasterFill`, sin camino en plantilla | `photos.heroVideo` |
| «Las reseñas en carrusel», «productos en 3 columnas» | ⚠️ edición libre | estilo de la sección |
| «Que el botón lleve a WhatsApp» | ❌ el botón no tiene enlace propio (solo `products`) | `layout[].href` |

### 2. Cinta de anuncio (arriba del encabezado)
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Pon una cinta: envío gratis desde Bs 200», «cambia la cinta», «quítala» | ❌ **error E1**: el Shell dibuja `copy.announcement`, pero en plantilla `masterContentEdit` borra `copy` y `visibleChanges` no cuenta `copy` → «No logré» | `copy.announcement`, `variants.announce` |

### 3. Encabezado
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Agrega Ofertas al menú», «menú desplegable» | ✅ menú | `config.header.menu` |
| «Pon mi logo», «el logo más grande» | ⚠️ el logo viene de Ajustes (`logoUrl`); el tamaño es CSS | Ajustes + CSS |
| «Buscador grande arriba», «íconos en palabras» | ⚠️ variantes `header`/`icons` vía `fillMaster`; sin prueba en plantilla | `variants` |

### 4. Pie de página
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Cambia la frase del pie» | ❌ `copy.tagline` se borra en plantilla (E1); `store.tagline` es Ajustes | `copy.tagline` / Ajustes |
| «Pon mi Instagram y TikTok en el pie» | ❌ el pie no tiene redes | — |
| «Cambia "Recibe novedades" / "Ayuda" / el texto legal» | ❌ fijos en `Shell.tsx` (palabras por tema en `FRAME`) | código |
| «Pie con foto», «nombre grande abajo» | ⚠️ `variants.footer` (columns/column/bigname); sin prueba en plantilla | `variants` |

### 5. Páginas de información (el caso que disparó esto)
Todas las dibuja el kit (`InfoPage`, `pages/standard.js`) con **datos de la tienda**, no con código. Fuera de la edición libre,
YAPI no escribe ninguno de esos datos.

| Página | Pedido típico | Hoy | Dato |
|---|---|---|---|
| Nosotros | «Escribe nuestra historia: empezamos en 2019 en la cocina de mi abuela…» | ❌ YAPI nunca escribe `aboutText` | `store.aboutText`, `store.tagline` |
| Contacto | «Cambia el teléfono», «agrega mi correo», «la dirección de la tienda» | ❌ (solo el formulario sí/no ✅) | `contactPhone`, `contactEmail`, `locations` |
| Envíos y entregas | «El envío cuesta Bs 15» | ✅ zonas | `deliveryZone` |
| | «Escribe que entregamos en 24 h en La Paz» | ⚠️ `set_store_policy`, solo en el agente | `policies.delivery` |
| Preguntas frecuentes | «Agrega la pregunta: ¿hacen tortas personalizadas?» | ❌ **no hay campo**: el FAQ se arma solo con envíos, retiro, dirección, pago y contacto | — |
| Cambios y devoluciones / Privacidad / Términos | «Devoluciones hasta 7 días» | ⚠️ `set_store_policy` (agente) | `policies.returns/privacy/terms` |
| Cookies, 404 | — | fijas de la plataforma (bien así) | — |
| Página nueva | «Haz una página de mayoristas» | ⚠️ `create_page` (agente) | archivo nuevo |
| Cómo se ven | «La página de contacto con una foto» | ⚠️ edición libre | CSS |

Además, una página sin datos **desaparece** del pie. Por eso en DooBoo YAPI hizo secciones de portada en vez de páginas.

### 6. Catálogo (productos.html)
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Cambia "Todos los productos" por "Nuestros helados"» | ❌ fijo en `page-productos.tsx` | código |
| «Filtros a la izquierda», «ordenar por precio» | ⚠️ edición libre | kit/CSS |

### 7. Página de producto
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Cambia el texto de "Cómo se usa" en la ficha», «quita la comparación» | ❌ `editLayout` solo lee la portada; `productLayout` no tiene camino | `productLayout` |
| «Agrega una tabla de tallas al producto» | ⚠️ edición libre | `productLayout` |
| «Galería a la izquierda», «descripción primero» | ⚠️ `variants.pdp`, `pdpOrder` | `variants` |
| «Pon garantía de 1 año debajo del botón» | ⚠️ `set_product_card_theme.assurances` (agente) | tema de la ficha |

### 8. Productos (datos del catálogo)
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Agrega este producto» (link o captura) | ✅ | catálogo |
| «Sube el brownie a Bs 25», «cambia el nombre», «mejora la descripción» | ⚠️ `productOperations` en la edición de diseño (minutos) | catálogo |
| «Cambia la foto del producto por esta» | ⚠️ igual | `imageUrls` |
| «Agrega tallas S M L», «suscripción mensual» | ⚠️ `variantOperations`, `subscriptionOperations` | catálogo |

**Riesgo E2:** `visibleChanges` excluye `config.data` (el catálogo), y las políticas viven en Ajustes. Un cambio que solo toca
productos o políticas no cambia archivos: el guardián deshace la revisión y responde «No logré», aunque el producto o la
política **ya cambiaron** en la base. Por verificar.

### 9. Carrito y pago
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Envío gratis desde Bs 300» | ✅ | zonas |
| «Que paguen por WhatsApp / con QR» | ❌ `checkoutMode` está en Ajustes | Ajustes |
| «Cambia "Tu carrito"», textos del pago | ❌ fijos (está bien: es el pago de la plataforma) | — |

### 10. Popup de suscripción
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Pon un popup con 10 % de descuento» | ⚠️ solo la revisión del primer pedido lo enciende (`applyChecklistSettings`) | `storeRetention.settings` |
| «Cambia el texto del popup» | ❌ YAPI nunca escribe `signupTitle/Body/Button` | `storeRetention.settings` |

### 11. Look general
| Pedido típico | Hoy | Dato |
|---|---|---|
| «Cambia el color a verde» | ✅ solo el acento (fondo, tinta y bandas siguen la plantilla) | `look.colors.accent` |
| «Fondo crema», «todo en tonos pastel» | ❌ por diseño solo cambia el acento | tema |
| «Otra letra» | ⚠️ `look.fonts` existe, pero el tema fija su letra → probablemente «No logré» | tema |
| «Más tranquila / más colorida», títulos | ✅ solo en Único; ❌ en las demás plantillas | `variants.mood/titles` |
| «Otra plantilla» | ✅ | plantilla |
| Páginas de cuenta (ingresar, registro) | ⚠️ `set_account_theme` (agente) | tema de cuenta |

## Errores encontrados
- **E1 — la cinta y la frase del pie se tiran.** En plantilla, `masterContentEdit` borra `copy`, pero el Shell sí dibuja
  `copy.announcement` y `copy.tagline`, y `visibleChanges` no los cuenta.
- **E2 — productos y políticas dichos como «No logré».** El guardián no ve el catálogo ni Ajustes.

## Prioridad (lo que más se pide primero)
1. **Páginas de información con datos**: Nosotros, Contacto, Envíos, Políticas y **preguntas propias en el FAQ** (campo
   nuevo). Son datos de Ajustes: YAPI los escribe como el envío, sin tocar código, y la página aparece en el pie en cuanto tiene datos.
2. **Fotos**: cambiar la foto de cualquier sección de la portada con la foto que manda el comerciante o una de las suyas.
3. **Productos rápidos**: precio, nombre, descripción y fotos como cambio de datos (segundos, sin edición de diseño), y arreglar E2.
4. **Cinta y pie**: arreglar E1; frase del pie y redes sociales.
5. **Secciones de la página de producto**: el mismo `editLayout` sobre `productLayout`.
6. **Lo demás**: popup (encenderlo y sus textos), título del catálogo, enlace de los botones, letra, `checkoutMode`.
7. **Siempre**: lo que ninguna herramienta cubre recibe una respuesta honesta con lo que sí se puede; nunca «Listo» sin cambio.

Especificación: `2026-11-03-yapi-edit-everything-design.md`.

## Hecho (noche del 2026-11-03)
Construido según `2026-11-03-yapi-edit-everything-design.md`, con pruebas (sin commit), y probado en vivo en la tienda de prueba
Miga Dorada (plan ChatGPT):
- «Escribe nuestra página Nosotros…», pregunta propia en el FAQ, Instagram y cinta → todo en una respuesta, guardado (rev 11).
- Precio de un producto + título de una sección de la ficha + «botones verde oliva» → precio y ficha al instante; el color siguió
  como pedido aparte (rev 12–13).
- Foto de la portada con la foto de un producto + título del catálogo → hecho (rev 14). El popup ya estaba encendido con 10 %:
  ahora YAPI lo dice.
- Pregunta («¿Cómo veo los pedidos?») → respuesta normal, sin cambios.
- Política de cambios + TikTok → hecho (rev 15).
- Arreglo en vivo: en tienda con plantilla, el lector de toda la tienda corre **antes** del paso de conversación. El paso de
  conversación confundía «ventana de suscripción» con suscripciones de productos y preguntaba por la frecuencia.

Pendiente: revisar a ojo en el Studio la página de preguntas y el pie con redes; el resto de la lista «Fuera de alcance» del spec.
