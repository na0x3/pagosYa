# Plan de reparación de ediciones YAPI — 2026-09-13

## Objetivo autorizado

Conservar el diseño aprobado y ejecutar el pedido actual sin reinterpretar imágenes,
sustituir fotografías por dibujos, retirar enlaces o modificar otras secciones.
Recuperar BURGERIA a partir de la revisión 1, conservando la preparación orgánica
de la revisión 2. Guardar una revisión nueva; no sobrescribir el historial ni publicar.

Referencia de producto: https://www.amboras.com/ — edición conversacional de una
tienda con vista previa. Su web pública no permite verificar cómo implementa sus
restricciones internas; no se promete paridad completa ni se copia su diseño.

## Evidencia

- El pedido de preparación orgánica produjo también sustituciones en portada,
  galería, navegación y cierre. El resumen de la IA cambió el uso de las fotos.
- Los roles de imágenes ya utilizadas no se conservaron en el siguiente mensaje.
- Los parches exactos limitan el tamaño de una edición, pero no su alcance.
- El esquema de secciones quedó en la revisión anterior y generó una advertencia
  falsa sobre la sección nueva solicitada.
- La reparación del carrito añadida anteriormente inserta un botón sin comprobar
  su posición visual; sustituirla por diagnósticos completos para la reparación.

## Implementación y criterios de aceptación

1. Conservar roles anteriores, exponer el contenido React real como contexto y
   reconocer «créame un sitio con estas imágenes» como autorización de contenido.
2. Proteger referencias a fotos existentes salvo cambios de imágenes expresos.
   No ofrecer recursos decorativos a ediciones locales sin petición de ilustración.
3. Para añadir/editar una sección React, resolver el alcance contra el código
   anterior: proteger las demás secciones, componentes y reglas CSS. Una sección
   nueva debe usar estilos propios. No aceptar cambios de navegación existentes.
   Si el destino no se resuelve con seguridad, conservar el sitio y explicar el motivo.
4. Aplicar la misma comprobación después de cualquier reparación. Un borrador que
   falla alcance no se convierte en la nueva base aprobada.
5. Actualizar el orden de secciones del esquema únicamente después de validar el
   cambio. Recopilar errores independientes antes de gastar la única reparación.
6. Recuperar BURGERIA en una nueva revisión mediante los servicios existentes,
   conservando productos, configuración, fotos y revisiones. Revisar escritorio y móvil.

## Verificación

- Regresión: añadir preparación con contexto que pide retirar fotos debe conservar
  portada/galería/enlaces o rechazar el resultado antes de guardarlo.
- Regresión: una reparación no puede ampliar el alcance de la solicitud.
- Pruebas de inserción válida, edición de sección, CSS global, imágenes, roles,
  esquema actualizado y recopilación de errores.
- Compilación API y comprobación del carrito/navegación en vista previa.
- Sin llamadas de IA pagadas para recuperar el diseño local.

## Límites a explicitar

La validación estructural no demuestra calidad estética en todos los navegadores.
Las ediciones globales explícitas y sitios HTML antiguos requieren cobertura distinta
a las secciones React. La identidad exacta de un ejemplo concreto de Amboras puede
compararse posteriormente con un enlace aportado por el usuario.

## Estado

Implementado y guardado localmente:

- Recuperación completada en la revisión **3** de BURGERIA. Portada, cuatro fotos
  editoriales, Header, Footer y enlaces de la revisión 1 recuperados; preparación
  orgánica conservada y dibujos de sustitución retirados.
- Corrección del interlineado de títulos existentes y de la nueva sección.
- Revisiones 1 y 2 verificadas sin cambios. No se publicó ni se generaron productos.
  Recuperación mediante SourceProjectsService, con **0 llamadas de IA**.
- Roles de fotos persistentes; contexto React visible para la conversación;
  detección de creación con imágenes en español.
- Validación del alcance de una sección literal React, incluida la reparación.
  Protección de fotos existentes y rechazo de SVG/Canvas nuevos y recursos de
  ilustración no pedidos. Las instrucciones también excluyen dibujos CSS nuevos.
- Diagnósticos independientes de tipografía y hooks agrupados para la reparación.
- Esquema de secciones y sistema visual actualizados después de aceptar la edición.
- 133 pruebas pasaron en la batería de generación/contexto/chat/imágenes/React;
  tras el último ajuste de instrucciones y negaciones, 124 pruebas pasaron en la
  batería correspondiente (incluye source-design). Compilación API correcta.
- **Pendiente visual:** Chrome permitió descubrir las pestañas, pero tanto la
  lectura de página como la captura agotaron el tiempo y reiniciaron la conexión.
  No se afirma verificación final del carrito ni de geometría en escritorio/móvil.
- El proceso API quedó iniciado con PORT=3001 y CHECKOUT_ORIGIN=http://localhost:5175
  después de que los procesos de desarrollo existentes dejaran de escuchar al compilar.
  Se conservaron los procesos supervisores del usuario; el proceso iniciado usa el build
  verificado, no es un nuevo watcher.

## Cobertura y próximos pasos concretos

La protección estricta de regiones aplica a solicitudes de una sección React con
identificador literal. Si la sección no puede identificarse de forma unívoca, se
rechaza la edición. No constituye un resolvedor universal del lenguaje natural:
pedidos generales, varias secciones y componentes dinámicos necesitan cobertura
adicional. La prohibición de dibujos CSS depende de las instrucciones; el análisis
estructural no puede distinguir toda ilustración de CSS ordinario.

Al recuperar la conexión de Chrome: abrir la revisión 3, comprobar fotos, texto,
enlace Escribir y carrito en 1280/390/320 px; verificar que el comprobador ya no
señale la sección orgánica como desviación. Comparar un ejemplo concreto de Amboras
solo si se aporta o se elige una referencia visual específica.
