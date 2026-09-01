# Plan para que cada tienda tenga una identidad visual propia

## Decisión de producto

pagosYa debe seguir siendo un editor de comercio con generación visual acotada, no un constructor abierto de aplicaciones. El comercio conserva productos, precios, carrito, checkout, formularios y enlaces; la IA solo propone una composición visual segura y reversible.

No es realista prometer que ninguna combinación se repetirá jamás. La promesa verificable debe ser que dos tiendas generadas no sean confundibles: deben diferir materialmente en estructura, jerarquía, tipografía, tratamiento de imágenes, catálogo y ritmo, no solo en colores y textos.

## Base que ya existe

- `siteDocument` estructurado, sin HTML, CSS o JavaScript generado.
- Tres propuestas privadas antes de aplicar una.
- Cinco direcciones base, doce topologías, cuatro familias de sección y un `designGenome` de siete ejes.
- Evaluador de distancia entre propuestas y registro de firmas estructurales recientes.
- Aplicación reversible, historial y secciones bloqueables.

## Orden recomendado de trabajo

### 1. Crear un banco de diversidad visual

Preparar entre 24 y 30 comercios de prueba que representen rubros y cantidades de contenido distintas: moda, comida, belleza, servicios, arte, entradas, una sola foto, muchas fotos, un producto y catálogos grandes.

Para cada generación guardar automáticamente capturas de escritorio y móvil, la firma estructural y el `designGenome`. Este banco será la medida objetiva para saber si una mejora realmente produce tiendas distintas o solo cambia decoración.

**Criterio de salida:** ningún par del mismo lote comparte apertura, orden, gramática y tratamiento de catálogo; no hay overflow y todas las tiendas mantienen compra y contacto funcionales.

### 2. Aumentar primero la capacidad del renderer

Los prompts no pueden crear variedad que el renderer no sabe expresar. Antes de añadir más instrucciones al modelo, ampliar las primitivas seguras:

- 6 a 8 composiciones de portada realmente diferentes.
- 5 o más tratamientos de catálogo: editorial, índice, lookbook, escaparate, compacto y producto protagonista.
- Variantes propias para navegación, historia, galería, contacto y cierre.
- Sistemas tipográficos y geométricos coordinados, no una fuente o radio aislado.
- Ritmos verticales que respondan al tipo de tienda y no dejen bandas que parezcan contenido roto.

Cada variante debe consumir el mismo contenido comercial y funcionar sin código generado.

**Criterio de salida:** las siluetas siguen siendo distinguibles al convertir las capturas a escala de grises.

### 3. Construir un ADN de marca más fuerte

El formulario de generación debe obtener evidencia útil con pocas preguntas:

- rubro y público;
- tres palabras de personalidad;
- referencias que gustan y cosas que se deben evitar;
- logo y selección intencional de fotografías;
- prioridad comercial: comprar, reservar, visitar o contactar.

La API convierte esto en un perfil estable de color, tipografía, densidad, lenguaje fotográfico, tono y merchandising. La IA no debe inventar historia, materiales o promesas cuando el comercio no los proporcionó.

**Criterio de salida:** repetir la generación para la misma marca conserva su identidad, mientras otra marca del mismo rubro recibe decisiones distintas.

### 4. Separar identidad de composición

Generar primero el ADN de marca y después tres composiciones contrastantes. Las propuestas comparten la verdad de la marca, pero reciben topologías y tratamientos de catálogo diferentes mediante una semilla ligada a la tienda y al número de generación.

La selección debe ponderarse por ejes completos: apertura, orden, navegación, tipografía, geometría, densidad, estrategia de medios, catálogo, color y movimiento. Nunca elegir una combinación completamente al azar ni usar el color como única diferencia.

### 5. Endurecer la puerta de originalidad

Rechazar y volver a componer una propuesta cuando:

- coincide demasiado con otra del lote;
- coincide con propuestas anteriores del mismo comercio;
- coincide con firmas recientes de otros comercios;
- repite títulos o subtítulos entre catálogo y experiencias visuales;
- usa la misma imagen demasiadas veces;
- falla en escritorio, móvil, contraste o contenido mínimo.

La firma global debe seguir siendo libre de productos, textos y URLs para no mezclar información entre comercios.

### 6. Mantener al comercio en control

La experiencia recomendada es:

1. El comercio completa el ADN de marca.
2. pagosYa genera tres direcciones.
3. El comercio compara sin publicar.
4. Aplica una dirección explícitamente.
5. Edita texto, imágenes, colores o estructura desde la vista previa.
6. Bloquea las secciones que no quiere perder.
7. Puede regenerar lo demás o volver a una versión anterior.

No se necesita un chat que interprete instrucciones abiertas para este flujo.

### 7. Medir y desplegar gradualmente

Registrar qué propuesta se elige, cuánto se edita después, cuántas regeneraciones ocurren y qué fallos de originalidad aparecen. Lanzar nuevas variantes detrás de una versión del compositor y compararlas con el banco visual antes de activarlas para todos.

## Próximo bloque de implementación

El siguiente bloque debería ser el banco automático de diversidad y una primera expansión de portadas y catálogos. Es el paso con mayor impacto porque mejora lo que el usuario ve y crea una prueba permanente contra tiendas repetidas. Añadir más autonomía al agente o más texto al prompt antes de ampliar el renderer tendría poco retorno.
