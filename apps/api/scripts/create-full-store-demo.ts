/** Full test stores (owner 2026-11-02: «create some stores like real fully stores with many sections»). Only what a merchant types in
 *  is scripted — the catalogue from a ~/Downloads CSV folder (names, prices, stock, descriptions, photos), categories, an address
 *  with opening hours and pickup, a delivery zone, policies, a blog, a welcome code in the signup window, the assistant and the
 *  store's Instagram. The design is YAPI's: the store is left at revision 0 for a chat (examples/full-stores-2026-11-02/send.cjs).
 *   npx ts-node --transpile-only scripts/create-full-store-demo.ts <miga|lienzo|hoja|bruma|noa|dooboo|ohbelly> [copy]
 *   noa/dooboo/ohbelly (owner 2026-11-02 «do like a noa vargas, dooboo and oh belly») copy the catalogue of an earlier test store of
 *   that brand — categories, products, variants — with its photos uploaded again as this store's own (NOA's uploads were lost on
 *   2026-10-24: its photos are the copies its old revisions bundled, in examples/full-stores-2026-11-02/noa-photos).
 *   copy: another store with the same catalogue (examples/full-stores-2026-11-02/<key>-<copy>), for a second build to compare.
 *  Local database only; idempotent through examples/full-stores-2026-11-02/<key>/demo.json. The app context's timers are stopped
 *  before their first tick, so it never sends emails or claims jobs beside the running API. The photos are third-party catalogue
 *  images the owner collected: a local demo only, never to be published. */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { PromoCodesService } from '../src/promo-codes/promo-codes.service';
import { RetentionService } from '../src/retention/retention.service';
import { OperationsService } from '../src/operations/operations.service';
import { CommerceContentService } from '../src/product-content/commerce-content.service';
import { StoreAssistantAdminService } from '../src/store-assistant/store-assistant-admin.service';

type Row = { sku: string; nombre: string; precio: string; categoria: string; stock: string; descripcion: string; imagenes: string };
type Brand = {
  name: string; tagline: string; city: string; what: string; story: string; about: string;
  /** A CSV catalogue in ~/Downloads/<folder>, or an earlier store of the brand to copy (copyFrom), with optional photo overrides. */
  folder?: string; csv?: string; copyFrom?: string;
  /** Photos straight in the folder rather than its imagenes/ (2026-11-06 photo-only folders; the CSV then lives in examples/). */
  flatImages?: boolean; photoFolder?: string; photosFor?: Record<string, string[]>; dropProducts?: string[];
  /** More brand photos (a ~/Downloads folder), uploaded once each beside the product photos. */
  brandPhotos?: string;
  /** A one-product store typed in by hand (premium landing check 2026-11-03): its photos from photoFolder, a photo set per colour. */
  items?: Array<{ name: string; description: string; amount: number; stock: number; photos: string[]; option?: string; colours: Array<{ value: string; photos: string[] }> }>;
  /** CSV category → the merchant's own grouping (a CSV with one category is split by what the products show). */
  category?: (row: Row) => string; skip?: string[]; badges?: Record<string, string>;
  /** A real new merchant (readiness run 2026-11-04) fills in only what is set here: no address, zone, code, signup window,
   *  assistant, Instagram, policies or blog unless given. Products in noPhoto lose their photos, noDescription their words. */
  real?: boolean; noPhoto?: string[]; noDescription?: string[];
  location?: { name: string; address: string; description: string; hours: Array<[number, string, string]> };
  zone?: { name: string; fee: number; freeAbove: number; minutes: number; departments: string[] };
  code?: { code: string; percent: number }; instagram?: string; assistant?: { name: string; greeting: string; notes: string };
  policies?: { returns: string; delivery: string; privacy: string; terms: string };
  articles: Array<{ slug: string; title: string; excerpt: string; body: string }>;
};

const WEEK = (open: string, close: string, saturday?: [string, string]): Array<[number, string, string]> =>
  [1, 2, 3, 4, 5].map(day => [day, open, close] as [number, string, string]).concat(saturday ? [[6, saturday[0], saturday[1]]] : []);
const TERMS = 'Precios en bolivianos. Tienda de demostración para probar funciones de pagosYa.';

const BRANDS: Record<string, Brand> = {
  // Readiness run 2026-11-04 (owner «store design ready?»): new merchants as they really arrive — short typed words, phone
  // photos, empty descriptions, no extras filled in. The words in examples/full-stores-2026-11-02/<key>/first.txt.
  libros: {
    name: 'Libros de Ana', tagline: 'Libros y cuadernos', city: 'Santa Cruz', real: true, folder: 'productos-libros-pagosya-paquete', csv: 'productos-libros-pagosya.csv',
    what: 'vendo libros nuevos, novelas en ingles y español y unos cuadernos lindos. hago envios en santa cruz', story: '', about: '',
    articles: [],
  },
  laminas: {
    name: 'Láminas Lu', tagline: '', city: 'Cochabamba', real: true, folder: 'catalogo_productos_arte_completo', csv: 'catalogo_productos_arte.csv',
    what: 'laminas de arte para decorar', story: '', about: '',
    noDescription: ['Café Good News', 'Casa en Jardín Soleado', 'Café sobre Azulejos', 'Té y Libros', 'Café en el Jardín'],
    articles: [],
  },
  canasta: {
    name: 'Canasta Viva', tagline: 'Frutas y verduras a tu puerta', city: 'La Paz', real: true, folder: 'catalogo_pagosya', csv: 'productos_pagosya.csv', category: row => row.categoria,
    what: 'Armamos canastas y cajas de frutas y verduras frescas del mercado y las llevamos a tu casa en La Paz. Pedidos hasta las 6 pm para el día siguiente.', story: '', about: '',
    noPhoto: ['Bolsa fresh essentials', 'Carrito de frutas frescas'],
    location: { name: 'Canasta Viva', address: 'Mercado Rodríguez, puesto 112, La Paz', description: 'Recoge tu canasta en el mercado.', hours: WEEK('07:00', '18:00', ['07:00', '13:00']) },
    zone: { name: 'La Paz ciudad', fee: 1000, freeAbove: 20000, minutes: 1440, departments: ['LA_PAZ'] },
    articles: [],
  },
  peppa: {
    name: 'Peppa Please', tagline: 'Salsa picante', city: 'La Paz', real: true,
    what: 'hacemos una salsa picante de locoto en botella, 3 sabores', story: '', about: '',
    photoFolder: resolve(homedir(), 'Downloads', 'hut'),
    items: [{ name: 'Salsa picante Peppa 250 ml', amount: 4500, stock: 80, option: 'Sabor',
      description: 'Salsa picante de locoto hecha en La Paz. Botella de 250 ml.',
      photos: ['183a817839131ffdf80e6f887ae1a0de.jpg', '38605cb7738cdc7a35885d2ccf1e0da4.jpg', '647a2ffb60b4d4a3c9c8f84cc5434481.jpg', 'c70e292a5af4972283800da8a41f14f8.jpg', 'd9b96be096501284d6c4379ac15b1f73.jpg'],
      colours: [{ value: 'Original', photos: [] }, { value: 'Ajo', photos: [] }, { value: 'Ahumada', photos: [] }] }],
    articles: [],
  },
  miga: {
    name: 'Miga Dorada', tagline: 'Panadería y cookies de autor en Sopocachi.', folder: 'catalogo_bakery_pagosya', csv: 'productos_bakery.csv', city: 'La Paz',
    what: 'Panadería de autor: rolls rellenos, cookies gourmet, cajas para regalar y desayunos con café para llevar o recibir en casa.',
    story: 'Miga Dorada empezó como un horno de fin de semana en Sopocachi. Horneamos cada mañana en tandas pequeñas, con mantequilla de verdad y chocolate belga, y armamos cajas para regalar y desayunos para compartir.',
    about: 'Horneamos cada mañana en Sopocachi, en tandas pequeñas: rolls, cookies rellenas, cajas surtidas y desayunos con café.',
    badges: { 'Torre de cookies rellenas gourmet': 'Más pedido', 'Colección cookies Pantone': 'Edición limitada' },
    location: { name: 'Miga Dorada Sopocachi', address: 'Av. 20 de Octubre 2245, Sopocachi, La Paz', description: 'Horno y mostrador: pasa a recoger tu pedido o tomar un café.', hours: WEEK('07:30', '19:30', ['08:00', '14:00']) },
    zone: { name: 'La Paz ciudad', fee: 1200, freeAbove: 15000, minutes: 90, departments: ['LA_PAZ'] },
    code: { code: 'MIGA10', percent: 10 }, instagram: 'https://www.instagram.com/migadorada.lpz',
    assistant: { name: 'Miga', greeting: 'Hola, soy Miga. ¿Te ayudo a elegir una caja o un desayuno para regalar?', notes: 'Miga Dorada es una panadería de autor en Sopocachi, La Paz. Horneamos cada mañana. Entregas en La Paz ciudad en unos 90 minutos (Bs 12, gratis desde Bs 150) o recojo en Av. 20 de Octubre 2245. Las cookies duran 5 días en un frasco cerrado. Para pedidos de más de 30 cajas, escribir por WhatsApp con 48 horas de anticipación.' },
    policies: { returns: 'Si tu pedido llega dañado, escríbenos el mismo día con una foto y lo reponemos.', delivery: 'Entregamos en La Paz ciudad en unos 90 minutos, de lunes a sábado. Recojo gratis en nuestro horno de Sopocachi.', privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para contarte las novedades del horno.', terms: TERMS },
    articles: [
      { slug: 'como-guardar-tus-cookies', title: 'Cómo guardar tus cookies para que sigan crocantes', excerpt: 'Un frasco cerrado, lejos del sol y nada de refrigerador: así duran cinco días.', body: 'Nuestras cookies salen del horno crocantes por fuera y suaves al centro. Para que sigan así, guárdalas en un frasco o caja hermética a temperatura ambiente.\n\nEl refrigerador las seca. Si quieres guardarlas más tiempo, congélalas en una bolsa cerrada y caliéntalas cinco minutos en el horno antes de comerlas.' },
      { slug: 'la-caja-para-regalar', title: 'La caja perfecta para regalar', excerpt: 'Cómo armamos nuestras cajas surtidas y cómo elegir la tuya.', body: 'Una buena caja mezcla texturas: algo crocante, algo relleno y algo para mojar en el café.\n\nSi regalas a alguien que no conoces bien, la degustación surtida es la apuesta segura. Para un cumpleaños, la torre de cookies rellenas siempre gana.' },
    ],
  },
  lienzo: {
    name: 'Taller Lienzo', tagline: 'Láminas y cuadros pintados, listos para colgar.', folder: 'catalogo_productos_arte_completo', csv: 'catalogo_productos_arte.csv', city: 'Cochabamba',
    what: 'Cuadros y láminas de pintura: cafés, mesas, ventanas al mar, mercados y flores, en tonos cálidos, para la casa o para regalar.',
    story: 'Taller Lienzo nació en Cochabamba entre pinceles y café. Pintamos escenas cotidianas —una mesa con té y libros, una ventana con limones, un mercado al mediodía— y las imprimimos en papel de algodón para que cada casa tenga su rincón con luz.',
    about: 'Escenas cotidianas pintadas a mano e impresas en papel de algodón. Enviamos a todo Bolivia, embaladas para que lleguen perfectas.',
    category: row => /caf[eé]|t[eé] y/i.test(row.nombre) ? 'Cafés y mesas' : /ramo|retrato/i.test(row.nombre) ? 'Flores y retratos' : 'Lugares',
    badges: { 'Ventana Mediterránea con Limones': 'Favorito', 'Tienda de Discos Vintage': 'Últimas piezas' },
    location: { name: 'Taller Lienzo', address: 'Calle España 418, Cochabamba', description: 'Nuestro taller abre las tardes para ver los cuadros en persona.', hours: WEEK('15:00', '20:00', ['10:00', '13:00']) },
    zone: { name: 'Todo Bolivia', fee: 3500, freeAbove: 50000, minutes: 4320, departments: [] },
    code: { code: 'LIENZO15', percent: 15 }, instagram: 'https://www.instagram.com/tallerlienzo.bo',
    assistant: { name: 'Lienzo', greeting: 'Hola, soy Lienzo. ¿Buscas un cuadro para un espacio en especial?', notes: 'Taller Lienzo vende cuadros y láminas pintadas impresas en papel de algodón de 300 g. Enviamos a todo Bolivia en 3 días hábiles (Bs 35, gratis desde Bs 500), embalados en caja rígida. El taller en Calle España 418, Cochabamba, abre de lunes a viernes de 15:00 a 20:00 y sábados de 10:00 a 13:00.' },
    policies: { returns: 'Tienes 15 días para devolver un cuadro en su embalaje original.', delivery: 'Enviamos a todo Bolivia en 3 días hábiles, embalado en caja rígida.', privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para avisarte de las obras nuevas.', terms: TERMS },
    articles: [
      { slug: 'como-colgar-un-cuadro', title: 'Cómo colgar un cuadro a la altura justa', excerpt: 'El centro del cuadro a 1,50 m del piso: la regla que usan las galerías.', body: 'Las galerías cuelgan las obras con el centro a unos 1,50 m del piso, la altura de los ojos.\n\nSobre un sofá o una mesa, deja de 20 a 25 cm entre el mueble y el borde del marco. Si cuelgas varios, alinea sus centros y no sus bordes.' },
      { slug: 'papel-de-algodon', title: 'Por qué imprimimos en papel de algodón', excerpt: 'Colores que no se apagan y una textura que se siente como pintura.', body: 'El papel de algodón de 300 g guarda el pigmento sin brillo y no amarillea con los años.\n\nPor eso cada lámina se siente como el original: la textura del pincel se nota cuando la luz entra de lado.' },
    ],
  },
  hoja: {
    name: 'Hoja Suelta', tagline: 'Librería de novelas contemporáneas y papelería en Santa Cruz.', folder: 'productos-libros-pagosya-paquete', csv: 'productos-libros-pagosya.csv', city: 'Santa Cruz',
    what: 'Librería pequeña: novelas contemporáneas en inglés, libros de bienestar, packs para regalar y cuadernos con frases.',
    story: 'Hoja Suelta es una librería de barrio en Santa Cruz. Elegimos pocos libros y los leemos antes de recomendarlos; cada mes nos juntamos en el club de lectura a hablar de uno con café.',
    about: 'Pocos libros, todos leídos por nosotras. Club de lectura cada mes, envíos en Santa Cruz y recojo en la librería.',
    badges: { 'Intermezzo - Sally Rooney': 'Libro del mes', 'Pack de libros contemporáneos': 'Para regalar' },
    location: { name: 'Hoja Suelta Equipetrol', address: 'Calle 9 Este 23, Equipetrol, Santa Cruz', description: 'La librería y su mesa del club de lectura.', hours: WEEK('10:00', '20:00', ['10:00', '18:00']) },
    zone: { name: 'Santa Cruz ciudad', fee: 1500, freeAbove: 25000, minutes: 1440, departments: ['SANTA_CRUZ'] },
    code: { code: 'LEER10', percent: 10 }, instagram: 'https://www.instagram.com/hojasuelta.libros',
    assistant: { name: 'Hoja', greeting: 'Hola, soy Hoja. ¿Te recomiendo un libro según lo que te gusta leer?', notes: 'Hoja Suelta es una librería en Equipetrol, Santa Cruz. Los libros están en inglés. Club de lectura el último jueves de cada mes a las 19:00 en la librería, gratis con reserva. Entregas en Santa Cruz en 24 horas (Bs 15, gratis desde Bs 250) y recojo en Calle 9 Este 23.' },
    policies: { returns: 'Puedes cambiar un libro sin uso dentro de 10 días.', delivery: 'Entregamos en Santa Cruz ciudad en 24 horas. Recojo gratis en la librería.', privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para contarte el libro del mes.', terms: TERMS },
    articles: [
      { slug: 'club-de-lectura', title: 'Así funciona nuestro club de lectura', excerpt: 'Un libro al mes, el último jueves, con café en la librería.', body: 'Cada mes elegimos un libro y lo anunciamos en la tienda. El último jueves a las 19:00 nos juntamos en la librería a conversarlo.\n\nEs gratis: solo reserva tu lugar por WhatsApp. Si compras el libro del mes en la tienda, te lo apartamos.' },
      { slug: 'leer-en-ingles', title: 'Empezar a leer novelas en inglés', excerpt: 'Libros cortos y cálidos para animarte.', body: 'Empieza con historias cuyo tono ya conoces: comedias románticas o memorias breves.\n\nTuesdays with Morrie es corto y claro; Better Than the Movies es ligera y divertida. Lee sin diccionario la primera vez: el contexto hace casi todo.' },
    ],
  },
  bruma: {
    name: 'Bruma', tagline: 'Cuidado capilar y rituales para viajar ligero.', folder: 'catalogo_lifestyle_pagosya', csv: 'productos_lifestyle.csv', city: 'La Paz',
    what: 'Tienda de cuidado capilar y personal: kits de viaje, cestas de regalo, dúos de tratamiento, infusiones funcionales y accesorios.',
    story: 'Bruma reúne lo que usamos en nuestros propios rituales: productos capilares de salón, sets de viaje y pequeñas pausas con té. Elegimos marcas que probamos y armamos kits pensados para regalar.',
    about: 'Productos de salón y kits de viaje elegidos por nosotras, con envío en La Paz y recojo en Calacoto.',
    skip: ['PKG-001'],
    badges: { 'Kit de viaje capilar premium': 'Más vendido' },
    location: { name: 'Bruma Calacoto', address: 'Calle 21 de Calacoto 8150, La Paz', description: 'Showroom: prueba los aromas antes de llevarlos.', hours: WEEK('10:00', '19:00', ['10:00', '14:00']) },
    zone: { name: 'La Paz y El Alto', fee: 1500, freeAbove: 30000, minutes: 1440, departments: ['LA_PAZ'] },
    code: { code: 'BRUMA10', percent: 10 }, instagram: 'https://www.instagram.com/bruma.rituales',
    assistant: { name: 'Bruma', greeting: 'Hola, soy Bruma. ¿Buscas algo para tu cabello o un regalo?', notes: 'Bruma vende productos capilares de salón, sets de viaje, infusiones funcionales y accesorios. Entrega en La Paz y El Alto en 24 horas (Bs 15, gratis desde Bs 300) y recojo en Calle 21 de Calacoto 8150. Los kits de viaje cumplen el límite de líquidos de cabina.' },
    policies: { returns: 'Cambios dentro de 7 días con el producto cerrado y su sello.', delivery: 'Entregamos en La Paz y El Alto en 24 horas. Recojo gratis en el showroom de Calacoto.', privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para enviarte novedades.', terms: TERMS },
    articles: [
      { slug: 'kit-de-viaje', title: 'Tu kit de viaje en cabina', excerpt: 'Envases de 100 ml y una bolsa transparente: lo que pasa el control.', body: 'En cabina puedes llevar líquidos en envases de hasta 100 ml, en una bolsa transparente de un litro.\n\nNuestros sets de viaje vienen en esos tamaños, así que tu rutina viaja contigo sin sorpresas en el control.' },
      { slug: 'rutina-capilar-semanal', title: 'Una rutina capilar semanal simple', excerpt: 'Champú suave, una mascarilla y protección del calor.', body: 'Lava con un champú suave dos o tres veces por semana y usa acondicionador solo de medios a puntas.\n\nUna vez por semana, una mascarilla de tratamiento. Antes de la plancha o el secador, siempre un protector térmico.' },
    ],
  },
  noa: {
    name: 'NOA VARGAS Atelier', tagline: 'Alta costura de novia y noche, hecha a mano en La Paz.', city: 'La Paz',
    what: 'Atelier de alta costura: vestidos de novia, vestidos de noche, piezas sueltas y accesorios de seda hechos a mano, con flores esculpidas como las calas.',
    story: 'NOA VARGAS es un atelier en Sopocachi. Cada vestido se corta y se cose a mano en tres pruebas; las calas, nuestra flor, se repiten en volantes, collares y bordados. Trabajamos con cita previa y con pocas novias por temporada.',
    about: 'Atelier de alta costura en La Paz. Vestidos de novia y de noche hechos a mano, con cita previa y tres pruebas.',
    copyFrom: 'cmvu1omfc0001lvqo92rneukd', dropProducts: ['Falda Flores Bordadas'],
    photoFolder: resolve(__dirname, '../../../examples/full-stores-2026-11-02/noa-photos'),
    photosFor: { 'Corsé Anturio': ['0f601df5-image-9a4dd6f8adf5.jpg'], 'Set de Seda para Dormir': ['20170cfa-image-c96f55c7a782.jpg'], 'Vestido Ciudad': ['2486be9a-image-5bc2dfb71b59.jpg'],
      'Vestido Cala': ['2de83472-image-0d93fca317d0.jpg'], 'Vestido Escultura': ['40e39ba3-image-bef10428c561.jpg'], 'Collar de Calas': ['48ac3e71-image-d3d340fe916f.jpg'],
      'Antifaz de Encaje': ['8b491418-image-eb0942fc9f46.jpg'], 'Falda Globo de Seda': ['930736c3-image-cdbab0ba8397.jpg'], 'Vestido Espalda Luna': ['c03a8f34-image-0cbf6cd5b13f.jpg'],
      'Vestido Halter Civil': ['c51d8205-image-5c5b99dd8ce3.jpg', 'e1d87002-image-5fa0e8b5ac42.jpg'] },
    badges: { 'Vestido Cala': 'Firma del atelier', 'Corsé Anturio': 'Pieza única' },
    location: { name: 'Atelier NOA VARGAS', address: 'Calle Fernando Guachalla 412, Sopocachi, La Paz', description: 'Pruebas con cita previa en el atelier.', hours: WEEK('10:00', '18:30', ['10:00', '13:00']) },
    zone: { name: 'Todo Bolivia', fee: 6000, freeAbove: 300000, minutes: 4320, departments: [] },
    code: { code: 'ATELIER5', percent: 5 }, instagram: 'https://www.instagram.com/noavargas.atelier',
    assistant: { name: 'Noa', greeting: 'Hola, soy Noa. ¿Buscas tu vestido de novia o una pieza de noche?', notes: 'NOA VARGAS es un atelier de alta costura en Sopocachi, La Paz. Los vestidos de novia se hacen a medida con tres pruebas y toman de 10 a 14 semanas; conviene reservar la primera cita con 4 meses de anticipación. Pruebas con cita previa, de lunes a viernes de 10:00 a 18:30 y sábados de 10:00 a 13:00. Enviamos accesorios a todo Bolivia (Bs 60, gratis desde Bs 3.000); los vestidos se entregan en el atelier.' },
    policies: { returns: 'Los vestidos a medida no tienen cambio; los accesorios sin uso se cambian dentro de 10 días.', delivery: 'Los vestidos se entregan en el atelier después de la última prueba. Los accesorios se envían a todo Bolivia en 3 días hábiles.', privacy: 'Usamos tus datos solo para tu pedido y tus citas.', terms: TERMS },
    articles: [
      { slug: 'tres-pruebas', title: 'Las tres pruebas de un vestido a medida', excerpt: 'Toile, primera prueba en tela y ajuste final: qué pasa en cada una.', body: 'En la primera cita tomamos medidas y probamos una toile, el vestido en lienzo de algodón.\n\nEn la segunda prueba ya es la tela real: ajustamos el talle, la caída y el largo. En la última, con tus zapatos, se cierran los detalles y el bajo.' },
      { slug: 'cuando-reservar', title: 'Cuándo reservar tu primera cita', excerpt: 'Un vestido de novia toma de 10 a 14 semanas.', body: 'Un vestido a medida toma de 10 a 14 semanas desde la primera prueba.\n\nTe recomendamos pedir tu primera cita unos cuatro meses antes de la boda, para tener margen en las pruebas sin apuros.' },
    ],
  },
  dooboo: {
    name: 'DooBoo Gelato', tagline: 'Gelato de tofu recién batido. Slow down. Take a scoop.', city: 'La Paz',
    what: 'Gelato de tofu recién batido en La Paz: vasos, copas, cajas para regalar y para compartir.',
    story: 'DooBoo es una heladería de gelato de tofu, cremoso y chicloso (쫀득해요). Nuestro capibara es la mascota. Empezamos con pop-ups y hoy batimos cada mañana en San Miguel. Lema: «Slow down. Take a scoop.»',
    about: 'Gelato de tofu batido cada mañana: cremoso, chicloso y sin lácteos. Vasos, copas y cajas con nuestro capibara.',
    copyFrom: 'cmvt00dy50001qe76b1cg4q1a', brandPhotos: 'dooboo',
    badges: { 'Caja DooBoo con capibara': 'Favorito', 'Gelato de tofu con cereal crocante': 'Nuevo' },
    location: { name: 'DooBoo San Miguel', address: 'Calle 21 de San Miguel 1180, La Paz', description: 'Nuestro mostrador: pide tu vaso o recoge tu caja.', hours: [[1, '12:00', '21:00'], [2, '12:00', '21:00'], [3, '12:00', '21:00'], [4, '12:00', '21:00'], [5, '12:00', '22:00'], [6, '11:00', '22:00'], [0, '11:00', '20:00']] },
    zone: { name: 'La Paz zona Sur', fee: 1000, freeAbove: 10000, minutes: 45, departments: ['LA_PAZ'] },
    code: { code: 'SCOOP10', percent: 10 }, instagram: 'https://www.instagram.com/dooboo.gelato',
    assistant: { name: 'DooBoo', greeting: 'Hola, soy DooBoo 🦫 ¿Te ayudo a elegir tu gelato?', notes: 'DooBoo hace gelato de tofu batido cada mañana, sin lácteos. Entregamos en la zona Sur de La Paz en unos 45 minutos (Bs 10, gratis desde Bs 100) en caja térmica; recojo en Calle 21 de San Miguel 1180. El gelato aguanta 30 minutos fuera del congelador y hasta 3 días congelado. Para eventos de más de 20 vasos, escribir con 48 horas de anticipación.' },
    policies: { returns: 'Si tu gelato llega derretido, escríbenos con una foto y lo reponemos.', delivery: 'Entregamos en la zona Sur de La Paz en unos 45 minutos, en caja térmica. Recojo en San Miguel.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [
      { slug: 'por-que-tofu', title: 'Por qué gelato de tofu', excerpt: 'Cremoso sin lácteos y con esa textura chiclosa que nos encanta.', body: 'El tofu le da al gelato cuerpo y cremosidad sin leche ni crema.\n\nLo batimos cada mañana en tandas pequeñas, por eso queda suave y un poco chicloso: lo que en Corea llaman 쫀득해요.' },
      { slug: 'como-guardar-gelato', title: 'Cómo guardar tu gelato en casa', excerpt: 'Al congelador apenas llega, y cinco minutos afuera antes de servir.', body: 'Guarda tu gelato en el congelador apenas llegue: aguanta hasta tres días.\n\nAntes de servir, déjalo cinco minutos afuera para que vuelva a estar cremoso.' },
    ],
  },
  ohbelly: {
    name: 'Oh Belly', tagline: 'Soda prebiótica con burbujas, sin azúcar, para pancitas felices.', city: 'La Paz',
    what: 'Soda prebiótica con burbujas: fruta de verdad, 5 g de fibra prebiótica y cero azúcar añadida, en cinco sabores, packs y cajas para regalar.',
    story: 'Oh Belly nació en una cocina de Sopocachi buscando una soda rica que no pese en la pancita. Cada lata lleva fruta de verdad y fibra prebiótica, y la repartimos desde nuestro camión naranja.',
    about: 'Soda prebiótica sin azúcar añadida: cinco sabores de fruta, packs para la nevera y cajas para regalar.',
    copyFrom: 'cmvlllqmr0001b0vqv6s4d5kl', brandPhotos: 'oh belly',
    location: { name: 'Oh Belly Sopocachi', address: 'Av. 20 de Octubre 1960, Sopocachi, La Paz', description: 'Nuestro camión-tienda: prueba los sabores fríos.', hours: WEEK('10:00', '20:00', ['10:00', '16:00']) },
    zone: { name: 'La Paz y El Alto', fee: 1200, freeAbove: 15000, minutes: 1440, departments: ['LA_PAZ'] },
    code: { code: 'PANCITA10', percent: 10 }, instagram: 'https://www.instagram.com/ohbelly.soda',
    assistant: { name: 'Belly', greeting: 'Hola, soy Belly. ¿Qué sabor te provoca hoy?', notes: 'Oh Belly es una soda prebiótica: fruta de verdad, 5 g de fibra prebiótica por lata y cero azúcar añadida. Sabores: Limón y jengibre, Pera e hinojo, Sandía y menta, Naranja y cúrcuma, Arándano y manzanilla. Se sirve fría; dura 9 meses cerrada. Entregamos en La Paz y El Alto en 24 horas (Bs 12, gratis desde Bs 150) y recojo en el camión de Sopocachi.' },
    policies: { returns: 'Si una lata llega dañada, la reponemos: escríbenos con una foto.', delivery: 'Entregamos en La Paz y El Alto en 24 horas. Recojo en nuestro camión de Sopocachi.', privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para contarte los sabores nuevos.', terms: TERMS },
    articles: [
      { slug: 'que-es-prebiotico', title: 'Qué es una soda prebiótica', excerpt: 'Fibra que alimenta a las bacterias buenas de tu pancita.', body: 'Los prebióticos son fibras que no digerimos nosotros sino las bacterias buenas del intestino.\n\nCada lata de Oh Belly lleva 5 g de fibra prebiótica, fruta de verdad y nada de azúcar añadida.' },
      { slug: 'cinco-sabores', title: 'Nuestros cinco sabores', excerpt: 'De limón y jengibre a arándano y manzanilla.', body: 'Limón y jengibre es el más fresco; Pera e hinojo, el más suave. Sandía y menta va perfecto en verano.\n\nNaranja y cúrcuma tiene un toque cálido y Arándano y manzanilla es el de la tarde.' },
    ],
  },
  besto: {
    name: 'Besto', tagline: 'Pesto fresco de albahaca, sin frutos secos.', city: 'Cochabamba',
    what: 'Vendo pesto fresco de albahaca en frasco: sin frutos secos, sin aceites de semillas, sin azúcar y sin gluten. Frasco individual, caja de 3 y caja de regalo. Entrega en Cochabamba.',
    story: 'Empezamos haciendo pesto para un amigo alérgico a los frutos secos; ahora lo hacemos cada semana con albahaca del valle.', about: 'Pesto fresco hecho en Cochabamba.',
    photoFolder: resolve(homedir(), 'Downloads', 'besto'),
    items: [
      { name: 'Pesto Besto 250 g', amount: 4500, stock: 60, description: 'Pesto fresco de albahaca, ajo y aceite de oliva. Sin frutos secos, sin aceites de semillas, sin azúcar, sin gluten. Frasco de 250 g; guárdalo en frío.',
        photos: ['caaa2183c0f0ab7befe4dac267b4a23c.jpg', '217e5ee60b12db89aad83f31e3fb7a2a.jpg', '532f68d7c9032f323475c3cef707877f.jpg', '843e679bc08decea7d1abe69bc182ae4.jpg'], colours: [] },
      { name: 'Caja de 3 frascos', amount: 12000, stock: 25, description: 'Tres frascos de Pesto Besto de 250 g en su caja. Para la semana o para compartir.',
        photos: ['9caf6c2e1fb28e2423165dbb4e5ba9f2.jpg', '1c76a941a132392b49ba187f6626f2e0.jpg'], colours: [] },
      { name: 'Caja de regalo Besto', amount: 9000, stock: 15, description: 'Dos frascos de Pesto Besto en caja de regalo, lista para entregar.',
        photos: ['1dce1042f1052c8d4c081dda3b867bd2.jpg', '534db44a63aad1cf2f62fe74ce9a4c7c.jpg'], colours: [] },
    ],
    location: { name: 'Besto', address: 'Av. Pando 1240, Cochabamba', description: 'Cocina y punto de recojo.', hours: WEEK('09:00', '18:00', ['09:00', '13:00']) },
    zone: { name: 'Cochabamba ciudad', fee: 1000, freeAbove: 15000, minutes: 240, departments: ['Cochabamba'] },
    code: { code: 'BESTO10', percent: 10 }, instagram: 'https://instagram.com/besto.test',
    assistant: { name: 'Besto', greeting: '¡Hola! ¿Te cuento cómo usar el pesto?', notes: 'Pesto fresco sin frutos secos: frasco de 250 g, caja de 3 y caja de regalo. Se guarda en frío.' },
    policies: { returns: 'Si tu frasco llega abierto o dañado, te lo reponemos.', delivery: 'Entregamos en Cochabamba el mismo día si pides antes de las 14:00.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [],
  },
  gelato: {
    name: 'DooBoo Test Títulos', tagline: 'Helado de tofu, suave y sin lácteos.', city: 'La Paz',
    what: 'Vendo un helado de tofu cremoso con caramelo de miel, en vasito con su paletita. Un helado para niños y grandes, sin lácteos. Entrega en La Paz.',
    story: 'Empezamos haciendo helado de tofu en casa para una amiga que no podía comer lácteos.', about: 'Helado de tofu artesanal en La Paz.',
    photoFolder: resolve(homedir(), 'Downloads', 'dooboo'),
    items: [{ name: 'Helado de tofu con caramelo', amount: 3500, stock: 40,
      description: 'Helado de tofu cremoso, sin lácteos, con trocitos de caramelo de miel. Vasito de 150 g con su paletita.',
      photos: ['PHOTO-2026-10-23-17-39-00.jpg', '13c0adef197cd5a30ebb20aa4c036767.jpg', '6bfb59b06ec40238e756884eb4ee0af5.jpg', 'c7dfb7871747a37c128a69d9ac931a46.jpg', 'fa86190ce69cd3c328bc32bb15f9f129.jpg'],
      colours: [] }],
    location: { name: 'DooBoo', address: 'Calle 21 de Calacoto 8000', description: 'Pop-up de helados los fines de semana.', hours: WEEK('12:00', '20:00', ['11:00', '20:00']) },
    zone: { name: 'La Paz zona sur', fee: 1500, freeAbove: 15000, minutes: 90, departments: ['La Paz'] },
    code: { code: 'DOOBOO10', percent: 10 }, instagram: 'https://instagram.com/dooboo.test',
    assistant: { name: 'Doo', greeting: '¡Hola! ¿Quieres probar el helado de tofu?', notes: 'Un solo producto: helado de tofu con caramelo de miel, sin lácteos.' },
    policies: { returns: 'Si tu helado llega derretido, te lo reponemos.', delivery: 'Entregamos en zona sur en 90 minutos.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [],
  },
  sofa: {
    name: 'Nube Sofá Test', tagline: 'El sofá cama que llega en una caja.', city: 'Santa Cruz',
    what: 'Vendo un sofá cama plegable de pana: llega comprimido en una caja, se expande en minutos y pasa de sofá a cama. Entrega en Santa Cruz.',
    story: 'Empezamos buscando un sofá para departamentos chicos que se pudiera mover sin flete.', about: 'Sofás cama de pana que llegan comprimidos a tu puerta en Santa Cruz.',
    photoFolder: resolve(homedir(), 'Downloads'),
    items: [{ name: 'Sofá cama plegable', amount: 249000, stock: 12,
      description: 'Sofá cama plegable de pana. Llega comprimido en una caja y se expande en minutos, sin herramientas. Abierto es una cama; cerrado, un sofá de 200 × 100 × 70 cm. Funda de pana suave y resistente.',
      photos: ['0701890069319004a52277e8fd6360e1.jpg', '467d2bf631a172c21668d82dc65347cc.jpg', '2f7e565b779066c7fd34dd0b9823723c.jpg', '1f1b7cf14664b72a3fc2d0819f60db3c.jpg', '71eb16096469f778d4ee129adde2914f.jpg', '8fdba10235e6e2383efc4b65765e9e82.jpg'],
      colours: [{ value: 'Verde oliva', photos: ['0701890069319004a52277e8fd6360e1.jpg', '71eb16096469f778d4ee129adde2914f.jpg'] }, { value: 'Verde bosque', photos: ['467d2bf631a172c21668d82dc65347cc.jpg'] },
        { value: 'Crema', photos: ['2f7e565b779066c7fd34dd0b9823723c.jpg', '1f1b7cf14664b72a3fc2d0819f60db3c.jpg'] }, { value: 'Negro', photos: ['8fdba10235e6e2383efc4b65765e9e82.jpg'] }] }],
    location: { name: 'Nube Sofá', address: 'Av. San Martín 1200, Equipetrol', description: 'Showroom con los colores para ver y tocar la pana.', hours: WEEK('10:00', '19:00', ['10:00', '14:00']) },
    zone: { name: 'Santa Cruz ciudad', fee: 3000, freeAbove: 200000, minutes: 1440, departments: ['Santa Cruz'] },
    code: { code: 'NUBE10', percent: 10 }, instagram: 'https://instagram.com/nubesofa.test',
    assistant: { name: 'Nube', greeting: '¡Hola! ¿Te ayudo a elegir el color de tu sofá?', notes: 'Un solo producto: el sofá cama plegable de pana, en cuatro colores. Llega comprimido; se expande en minutos.' },
    policies: { returns: 'Cambios dentro de 7 días si el sofá llega dañado.', delivery: 'Entregamos en Santa Cruz en 24 a 48 horas.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [],
  },
  boxy: {
    name: 'BOXY', tagline: 'Hoodies de corte boxy, tela pesada, hechos en La Paz.', city: 'La Paz',
    what: 'Hoodies de corte boxy: básicos de algodón perchado en azul marino, café y gris lavado, y hoodies con gráficos en la espalda.',
    story: 'BOXY hace hoodies amplios, de hombro caído y tela pesada (380 g), para usar todos los días. Cortamos y cosemos pocas piezas por lote en un taller de Miraflores; cuando un color se acaba, vuelve en el próximo lote.',
    about: 'Hoodies boxy de algodón perchado de 380 g, hombro caído y capucha doble. Pocas piezas por lote, hechas en La Paz.',
    copyFrom: 'cmvukfio10001euk8rnkgr7nv', brandPhotos: 'boxy',
    badges: { 'Hoodie Boxy Esencial': 'Más vendido', 'Hoodie Slow Sunday': 'Nuevo' },
    location: { name: 'BOXY Miraflores', address: 'Av. Busch 1420, Miraflores, La Paz', description: 'Nuestro taller: pruébate tu talla y recoge tu pedido.', hours: WEEK('11:00', '19:30', ['11:00', '15:00']) },
    zone: { name: 'La Paz y El Alto', fee: 1500, freeAbove: 40000, minutes: 1440, departments: ['LA_PAZ'] },
    code: { code: 'BOXY10', percent: 10 }, instagram: 'https://www.instagram.com/boxy.lpz',
    assistant: { name: 'BOXY', greeting: 'Hola 👋 ¿Te ayudo con tu talla?', notes: 'BOXY hace hoodies de corte boxy: algodón perchado de 380 g, hombro caído, capucha doble. El corte es amplio: si te gusta más ajustado, pide una talla menos. Tallas S a XL. Lavar al revés en agua fría, no usar secadora. Entregamos en La Paz y El Alto en 24 horas (Bs 15, gratis desde Bs 400) y se puede recoger y probar en el taller de Av. Busch 1420, Miraflores. Cambios de talla dentro de 7 días con la etiqueta puesta.' },
    policies: { returns: 'Cambias tu talla dentro de 7 días, con la etiqueta puesta y sin lavar.', delivery: 'Entregamos en La Paz y El Alto en 24 horas. Recojo y prueba en nuestro taller de Miraflores.', privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para avisarte de cada lote nuevo.', terms: TERMS },
    articles: [
      { slug: 'como-elegir-tu-talla', title: 'Cómo elegir tu talla boxy', excerpt: 'El corte es amplio a propósito: así lo eliges.', body: 'Nuestros hoodies tienen hombro caído y cuerpo ancho: es el corte boxy.\n\nSi usas M en otras marcas y te gusta suelto, pide M. Si lo quieres más al cuerpo, pide una talla menos.' },
      { slug: 'cuidar-tu-hoodie', title: 'Cómo cuidar tu hoodie', excerpt: 'Al revés, agua fría y nada de secadora.', body: 'Lava tu hoodie al revés y en agua fría para que el perchado y los gráficos duren.\n\nSécalo colgado a la sombra: la secadora encoge el algodón.' },
    ],
  },
  // 2026-11-06 owner «create more stores»: photo-only ~/Downloads folders; the catalogue typed from the photos (examples/<key>/catalogo.csv).
  meathouse: {
    name: 'Meat House', tagline: 'Cortes madurados y parrilla, sin miedo al fuego.', city: 'La Paz', folder: 'meathouse', flatImages: true, csv: resolve(__dirname, '../../../examples/full-stores-2026-11-02/meathouse/catalogo.csv'), brandPhotos: 'meathouse',
    what: 'Carnicería y parrilla: cortes madurados (bife de chorizo, ojo de bife, picaña), costillas BBQ y tablas para compartir.',
    story: 'Meat House empezó como una parrilla de fin de semana entre amigos en Sopocachi. Maduramos la carne 21 días en nuestra cámara y la cortamos grueso, como nos gusta comerla.',
    about: 'Carnicería y parrilla en Sopocachi. Cortes madurados 21 días, cortados grueso, y costillas cocidas lento.',
    badges: { 'Bife de chorizo madurado 400 g': 'Más vendido' },
    location: { name: 'Meat House Sopocachi', address: 'Calle Belisario Salinas 520, Sopocachi, La Paz', description: 'Carnicería y parrilla: compra tus cortes o come aquí.', hours: WEEK('12:00', '22:00', ['12:00', '23:00']) },
    zone: { name: 'La Paz', fee: 2000, freeAbove: 30000, minutes: 120, departments: ['LA_PAZ'] },
    code: { code: 'ASADO10', percent: 10 }, instagram: 'https://instagram.com/meathouse.test',
    assistant: { name: 'Meat House', greeting: '¡Hola! ¿Te ayudo a elegir el corte para tu parrilla?', notes: 'Cortes madurados 21 días. Bife de chorizo y ojo de bife: fuego fuerte, 4 minutos por lado, reposo 5. Picaña: entera, grasa abajo primero. Costillas ya cocidas: solo calentar y glasear.' },
    policies: { returns: 'Si tu corte llega mal, te lo cambiamos el mismo día.', delivery: 'Entregamos en La Paz en 2 horas, en caja térmica.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [{ slug: 'bife-perfecto', title: 'Cómo hacer un bife perfecto', excerpt: 'Fuego fuerte, sal gruesa y paciencia.', body: 'Saca el bife del refri 30 minutos antes.\n\nSal gruesa justo antes de la parrilla, fuego fuerte, 4 minutos por lado para jugoso.\n\nDéjalo reposar 5 minutos antes de cortar.' }],
  },
  perra: {
    name: 'Perra Please', tagline: 'Salsas picantes que no piden permiso.', city: 'Santa Cruz', folder: 'hut', flatImages: true, csv: resolve(__dirname, '../../../examples/full-stores-2026-11-02/perra/catalogo.csv'), brandPhotos: 'hut',
    what: 'Salsas picantes: Red Pepper Heat, Garlic Heat, Smoke Heat y el pack de las tres.',
    story: 'Perra Please nació en una cocina de Santa Cruz, fermentando ajíes en frascos. Hacemos salsas para gente que le pone picante a todo antes de probar.',
    about: 'Salsas picantes de ají fermentado, hechas en Santa Cruz en lotes chicos.',
    badges: { 'Pack las tres salsas': 'Más vendido' },
    location: { name: 'Perra Please', address: 'Calle Libertad 340, Santa Cruz', description: 'Retira tus salsas en nuestra cocina.', hours: WEEK('10:00', '18:00') },
    zone: { name: 'Santa Cruz ciudad', fee: 1500, freeAbove: 15000, minutes: 1440, departments: ['SANTA_CRUZ'] },
    code: { code: 'PICA10', percent: 10 }, instagram: 'https://instagram.com/perraplease.test',
    assistant: { name: 'Perra', greeting: '¿Qué tan picante te gusta? 🌶️', notes: 'Red Pepper Heat: la más picante. Garlic Heat: picor medio con ajo asado. Smoke Heat: ahumada, para carnes. El pack trae las tres.' },
    policies: { returns: 'Si una botella llega rota, te mandamos otra.', delivery: 'Entregamos en Santa Cruz en 24 horas.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [{ slug: 'con-que-va', title: 'Con qué va cada salsa', excerpt: 'Spoiler: con todo.', body: 'Red Pepper Heat va con huevos, pizza y tacos.\n\nGarlic Heat, con papas fritas y pollo.\n\nSmoke Heat, con hamburguesas y carnes a la parrilla.' }],
  },
  pawby: {
    name: 'Pawby Kitchen', tagline: 'Comida fresca para perros, hecha con amor.', city: 'Cochabamba', folder: 'pups', flatImages: true, csv: resolve(__dirname, '../../../examples/full-stores-2026-11-02/pawby/catalogo.csv'), brandPhotos: 'pups',
    what: 'Comida fresca para perros, plan semanal, croquetas naturales, snacks y camas.',
    story: 'Pawby Kitchen empezó cocinando para nuestra perra Lola, que no comía croquetas. Hoy cocinamos cada semana en Cochabamba con ingredientes que tú también comerías.',
    about: 'Comida fresca para perros cocinada cada semana en Cochabamba, sin conservantes.',
    badges: { 'Plan semanal 7 porciones': 'Más vendido' },
    location: { name: 'Pawby Kitchen', address: 'Av. América 850, Cochabamba', description: 'Nuestra cocina: retira tu plan los lunes.', hours: WEEK('09:00', '18:00', ['09:00', '13:00']) },
    zone: { name: 'Cochabamba', fee: 1000, freeAbove: 20000, minutes: 1440, departments: ['COCHABAMBA'] },
    code: { code: 'PAWBY10', percent: 10 }, instagram: 'https://instagram.com/pawby.test',
    assistant: { name: 'Pawby', greeting: '¡Guau! ¿Cuánto pesa tu perro?', notes: 'Porción diaria aproximada: 50 g de comida fresca por cada kg de peso. El plan semanal trae 7 porciones calculadas por peso y se entrega los lunes.' },
    policies: { returns: 'Si a tu perro no le gusta la primera porción, te devolvemos tu dinero.', delivery: 'Entregamos en Cochabamba al día siguiente; el plan semanal, los lunes.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [{ slug: 'por-que-comida-fresca', title: 'Por qué comida fresca', excerpt: 'Lo que cambia cuando tu perro come de verdad.', body: 'La comida fresca se cocina a baja temperatura y conserva sus nutrientes.\n\nMuchos perros mejoran su digestión y su pelo en pocas semanas.\n\nEmpieza mezclando con su comida de siempre durante 5 días.' }],
  },
  lullu: {
    name: 'Lullu', tagline: 'Belleza que cabe en tu maleta.', city: 'La Paz', folder: 'lullu', flatImages: true, csv: resolve(__dirname, '../../../examples/full-stores-2026-11-02/lullu/catalogo.csv'), brandPhotos: 'lullu',
    what: 'Kits de belleza para viajar, cuidado de cabello y piel, y canastas para regalar.',
    story: 'Lullu nació de tanto armar neceseres antes de cada viaje. Juntamos lo que de verdad usamos en tamaño viaje, listo para la maleta.',
    about: 'Kits de belleza en tamaño viaje y sets de cabello y piel, armados en La Paz.',
    badges: { 'Kit fin de semana': 'Nuevo' },
    location: { name: 'Lullu', address: 'Av. Ballivián 1050, Calacoto, La Paz', description: 'Showroom: arma tu kit y llévalo envuelto.', hours: WEEK('10:00', '19:00', ['10:00', '14:00']) },
    zone: { name: 'La Paz y El Alto', fee: 1500, freeAbove: 30000, minutes: 1440, departments: ['LA_PAZ'] },
    code: { code: 'LULLU10', percent: 10 }, instagram: 'https://instagram.com/lullu.test',
    assistant: { name: 'Lullu', greeting: 'Hola ✨ ¿Te ayudo a armar tu kit de viaje?', notes: 'Todos los minis son de menos de 100 ml: pasan en el equipaje de mano. Los kits se pueden envolver para regalo.' },
    policies: { returns: 'Cambios dentro de 7 días con el producto sin abrir.', delivery: 'Entregamos en La Paz y El Alto en 24 horas.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [{ slug: 'que-llevar-en-el-avion', title: 'Qué llevar en el avión', excerpt: 'Menos de 100 ml y todo en una bolsa.', body: 'Los líquidos van en envases de menos de 100 ml, en una bolsa transparente.\n\nLleva crema, protector y un spray para refrescar.\n\nNuestros kits ya vienen listos para pasar el control.' }],
  },
  // Owner 2026-11-06 («crea varias tiendas nuevas con las fotos que menos usas»): Gramiyaa and Cuadrízate copy their earlier
  // stores' catalogues; Book Coffee joins the book folder and the bakery's coffee and sweets (examples/…/bookcoffee).
  gramiyaa: {
    name: 'Gramiyaa', tagline: 'Let the oil do its thing.', city: 'Santa Cruz',
    what: 'Aceites prensados en madera, en frío: sésamo, coco, maní y mostaza, de 1 L, un bidón de 5 L y un pack degustación.',
    story: 'Gramiyaa prensa semillas y frutos secos en una prensa de madera, lento y sin calor, como se hacía antes. Así el aceite conserva su aroma, su sabor y sus nutrientes.',
    about: 'Aceites prensados en madera, en frío, sin químicos ni refinado. Envasados en botellas opacas para que no se oxiden.',
    copyFrom: 'cmvu2o0ke0001cltgwu1axrhm', brandPhotos: 'gramiyaa',
    badges: { 'Pack degustación 4 aceites': 'Para regalar', 'Aceite de sésamo prensado en madera': 'Más vendido' },
    location: { name: 'Gramiyaa Urbarí', address: 'Calle Las Palmas 455, Urbarí, Santa Cruz', description: 'Nuestra prensa: mira cómo se hace y recoge tu aceite.', hours: WEEK('09:00', '18:30', ['09:00', '13:00']) },
    zone: { name: 'Todo Bolivia', fee: 2500, freeAbove: 40000, minutes: 2880, departments: [] },
    code: { code: 'GRAMIYAA10', percent: 10 }, instagram: 'https://instagram.com/gramiyaa.test',
    assistant: { name: 'Gramiyaa', greeting: '¡Hola! ¿Te ayudo a elegir un aceite para cocinar o para el pelo?', notes: 'Aceites prensados en madera, en frío: sésamo (cocina asiática y aliños), coco (hornear, pelo y piel), maní (freír y saltear) y mostaza (encurtidos y curry). Botellas de 1 L; maní también en bidón de 5 L. Se guardan lejos del sol.' },
    policies: { returns: 'Si tu botella llega abierta o dañada, te la reponemos.', delivery: 'Enviamos a todo Bolivia en 2 días hábiles; en Santa Cruz al día siguiente.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [{ slug: 'prensado-en-madera', title: 'Qué es un aceite prensado en madera', excerpt: 'Lento, en frío y sin químicos.', body: 'La prensa de madera gira despacio y no calienta la semilla.\n\nPor eso el aceite guarda su aroma y su color.\n\nNo lo refinamos ni le agregamos nada.' }],
  },
  cuadrizate: {
    name: 'Cuadrízate', tagline: 'Arte para colgar, impreso y enmarcado a mano.', city: 'La Paz',
    what: 'Cuadros impresos en papel de algodón y enmarcados a mano: clásicos impresionistas e ilustraciones contemporáneas para la casa.',
    story: 'Cuadrízate empezó enmarcando láminas para amigos en un taller de Sopocachi. Hoy imprimimos cada cuadro en papel de algodón de 300 g y lo enmarcamos a mano en madera.',
    about: 'Cuadros listos para colgar: impresión en papel de algodón, marco de madera y vidrio, embalados en caja rígida.',
    copyFrom: 'cmvrqs34r0001dzb3mdl85za7',
    badges: { 'Ventana a Amalfi': 'Favorito', 'La disquería': 'Nuevo' },
    location: { name: 'Taller Cuadrízate', address: 'Calle Belisario Salinas 520, Sopocachi, La Paz', description: 'Ven a ver los cuadros en persona y elegir el marco.', hours: WEEK('10:00', '19:00', ['10:00', '13:00']) },
    zone: { name: 'Todo Bolivia', fee: 3500, freeAbove: 45000, minutes: 4320, departments: [] },
    code: { code: 'CUADRO10', percent: 10 }, instagram: 'https://instagram.com/cuadrizate.test',
    assistant: { name: 'Cuadrízate', greeting: '¡Hola! ¿Buscas un cuadro para algún espacio en especial?', notes: 'Cuadros de 30 × 40 cm impresos en papel de algodón de 300 g, marco de madera y vidrio. Envío a todo Bolivia en 3 días hábiles en caja rígida (Bs 35, gratis desde Bs 450).' },
    policies: { returns: 'Tienes 10 días para devolver un cuadro en su embalaje original.', delivery: 'Enviamos a todo Bolivia en 3 días hábiles, en caja rígida.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [{ slug: 'como-colgar', title: 'Cómo colgar un cuadro a la altura justa', excerpt: 'El centro a 1,5 m del piso.', body: 'Mide 1,5 m desde el piso: ahí va el centro del cuadro.\n\nSobre un sofá, deja 20 cm entre el mueble y el marco.\n\nUsa dos clavos para que no se tuerza.' }],
  },
  bookcoffee: {
    name: 'Book Coffee', tagline: 'Un libro, un café y la tarde libre.', city: 'Cochabamba', folder: resolve(__dirname, '../../../examples/full-stores-2026-11-02/bookcoffee/fotos'), flatImages: true,
    csv: resolve(__dirname, '../../../examples/full-stores-2026-11-02/bookcoffee/catalogo.csv'),
    what: 'Librería-café: novelas y libros en inglés, cuadernos, y café helado con algo dulce para leer ahí o llevar.',
    story: 'Book Coffee es una librería con barra de café en Cochabamba. Elegimos pocos libros, los que leímos y recomendaríamos, y los servimos con un latte helado y algo recién horneado.',
    about: 'Librería y café: libros en inglés elegidos uno por uno, cuadernos y café con algo dulce.',
    badges: { 'Intermezzo - Sally Rooney': 'Libro del mes', 'Desayuno de lectura con latte helado': 'Favorito' },
    location: { name: 'Book Coffee Recoleta', address: 'Av. Pando 1180, Recoleta, Cochabamba', description: 'La librería y su barra de café: lee el primer capítulo antes de llevarlo.', hours: WEEK('08:00', '21:00', ['09:00', '21:00']) },
    zone: { name: 'Cochabamba ciudad', fee: 1200, freeAbove: 20000, minutes: 120, departments: ['COCHABAMBA'] },
    code: { code: 'LEER10', percent: 10 }, instagram: 'https://instagram.com/bookcoffee.test',
    assistant: { name: 'Book Coffee', greeting: '¡Hola! ¿Te recomiendo un libro según lo que te gusta leer?', notes: 'Los libros están en inglés. Club de lectura el primer sábado del mes a las 17:00, gratis con reserva. El café y lo dulce se entregan en Cochabamba en 2 horas; los libros se recogen o se envían el mismo día.' },
    policies: { returns: 'Puedes cambiar un libro sin uso dentro de 10 días. El café y lo dulce no tienen cambio.', delivery: 'Entregamos en Cochabamba en unas 2 horas. Recojo gratis en la librería.', privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para contarte el libro del mes.', terms: TERMS },
    articles: [{ slug: 'club-de-lectura', title: 'Así funciona el club de lectura', excerpt: 'Un libro al mes, un sábado, un café.', body: 'Cada mes elegimos un libro de la tienda.\n\nEl primer sábado nos juntamos a las 17:00 a conversarlo.\n\nEs gratis: solo reserva tu lugar por el chat.' }],
  },
  vortice: {
    name: 'Vórtice', tagline: 'Licuadoras que no se quedan quietas.', city: 'Santa Cruz', folder: 'blender', flatImages: true, csv: resolve(__dirname, '../../../examples/full-stores-2026-11-02/vortice/catalogo.csv'), brandPhotos: 'blender',
    what: 'Licuadoras personales, de vaso y una retro rosa, más vasos extra.',
    story: 'En Vórtice probamos cada licuadora con hielo, frutas congeladas y verduras antes de venderla. Si no deja el batido liso, no entra a la tienda.',
    about: 'Licuadoras probadas en Santa Cruz, con garantía de 1 año.',
    badges: { 'Licuadora personal 600 W': 'Más vendido' },
    location: { name: 'Vórtice Equipetrol', address: 'Av. San Martín 900, Equipetrol, Santa Cruz', description: 'Prueba las licuadoras antes de llevarlas.', hours: WEEK('10:00', '20:00', ['10:00', '14:00']) },
    zone: { name: 'Santa Cruz ciudad', fee: 2000, freeAbove: 50000, minutes: 1440, departments: ['SANTA_CRUZ'] },
    code: { code: 'VORTICE10', percent: 10 }, instagram: 'https://instagram.com/vortice.test',
    assistant: { name: 'Vórtice', greeting: '¡Hola! ¿Batidos para uno o para la familia?', notes: 'Personales: 600 W, vaso de 700 ml que sirve de botella. De vaso: 1200 W, 1,5 L, hielo y sopas. Todas con garantía de 1 año.' },
    policies: { returns: 'Garantía de 1 año; cambios dentro de 7 días si llega con fallas.', delivery: 'Entregamos en Santa Cruz en 24 horas.', privacy: 'Usamos tus datos solo para tu pedido.', terms: TERMS },
    articles: [{ slug: 'batido-verde', title: 'Batido verde de 3 ingredientes', excerpt: 'Espinaca, plátano y leche.', body: 'Pon un puñado de espinaca, un plátano congelado y un vaso de leche.\n\nLicúa 30 segundos.\n\nListo: verde, frío y sin grumos.' }],
  },
};

const parse = (csv: string): Row[] => {
  const [head, ...lines] = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const keys = head.split(';') as Array<keyof Row>;
  return lines.map(line => Object.fromEntries(line.split(';').map((value, at) => [keys[at], value.trim()])) as Row);
};

async function main() {
  const key = process.argv[2] ?? '';
  const brand = BRANDS[key];
  if (!brand) throw new Error(`usage: create-full-store-demo.ts <${Object.keys(BRANDS).join('|')}>`);
  const copy = process.argv[3];
  const folder = resolve(__dirname, `../../../examples/full-stores-2026-11-02/${copy ? `${key}-${copy}` : key}`);
  await mkdir(folder, { recursive: true });
  const source = resolve(homedir(), 'Downloads', brand.folder ?? '');
  const rows = brand.csv ? parse(await readFile(resolve(source, brand.csv), 'utf8')).filter(row => !brand.skip?.includes(row.sku)) : [];
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-full-store-demo requires a local database');
    // The running API serves uploads on 3001; without this the store's photo URLs point at :3000, the website.
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      // The owner's demo merchant (the one that owns NOA VARGAS and BOXY), so it shows in «Tus tiendas».
      // DEMO_MERCHANT_EMAIL (2026-11-04, owner «crea otro usuario, ese ya tiene muchas tiendas»): another dev merchant owns it.
      const other = process.env.DEMO_MERCHANT_EMAIL ? await prisma.merchant.findUniqueOrThrow({ where: { email: process.env.DEMO_MERCHANT_EMAIL }, select: { id: true } }) : null;
      const noa = other ? { merchantId: other.id } : await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: brand.name, tagline: brand.tagline, animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const upload = async (file: string) => {
      if (record.photos[file]) return record.photos[file] as string;
      const asset = await uploads.saveBuffer(await readFile(brand.flatImages ? resolve(source, file) : resolve(source, 'imagenes', file)), /\.png$/i.test(file) ? 'image/png' : 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[file] = asset.url; await save(); return asset.url as string;
    };
    const categoryOf = (row: Row) => brand.category?.(row) ?? row.categoria;
    if (brand.copyFrom) {
      // An earlier store of the brand: its categories and products as the merchant made them, each photo uploaded again as this
      // store's own file (a store never shares another store's upload), the photo folder's files where the uploads are gone.
      const copied = await prisma.store.findUniqueOrThrow({ where: { id: brand.copyFrom }, select: { categories: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } },
        paymentLinks: { orderBy: { createdAt: 'asc' }, select: { name: true, description: true, amount: true, currency: true, stock: true, variants: true, imageUrls: true, tags: true, badge: true, shippingWeightGrams: true, categoryId: true } } } });
      const again = async (url: string) => {
        const file = url.split('/').pop()!.split('?')[0];
        if (record.photos[file]) return record.photos[file] as string;
        const bytes = await uploads.getBuffer(file).catch(() => null);
        if (!bytes) return null;
        const asset = await uploads.saveBuffer(bytes, /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg');
        await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
        record.photos[file] = asset.url; await save(); return asset.url as string;
      };
      const fromFolder = async (file: string) => {
        if (record.photos[file]) return record.photos[file] as string;
        const asset = await uploads.saveBuffer(await readFile(resolve(brand.photoFolder!, file)), 'image/jpeg');
        await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
        record.photos[file] = asset.url; await save(); return asset.url as string;
      };
      const categoryName = new Map(copied.categories.map(category => [category.id, category.name]));
      const products = copied.paymentLinks.filter(product => !brand.dropProducts?.includes(product.name));
      for (const [order, name] of [...new Set(products.map(product => categoryName.get(product.categoryId ?? '')).filter((name): name is string => Boolean(name)))].entries()) {
        if (record.categories[name]) continue;
        record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
      }
      for (const product of products) {
        if (record.products[product.name]) continue;
        const own = brand.photosFor?.[product.name];
        const imageUrls = (own ? await Promise.all(own.map(fromFolder)) : (await Promise.all(product.imageUrls.map(again)))).filter((url): url is string => Boolean(url));
        const variants = Array.isArray(product.variants) ? await Promise.all((product.variants as Array<Record<string, unknown>>).map(async variant => {
          const image = typeof variant.imageUrl === 'string' ? await again(variant.imageUrl) : null;
          const { imageUrl: _old, ...rest } = variant;
          return image ? { ...rest, imageUrl: image } : rest;
        })) : product.variants;
        const badge = brand.badges?.[product.name] ?? product.badge;
        const item = await prisma.paymentLink.create({ data: { storeId, categoryId: product.categoryId ? record.categories[categoryName.get(product.categoryId)!] : null, name: product.name, description: product.description,
          amount: product.amount, currency: product.currency, stock: product.stock, variants: variants as never, imageUrls, tags: product.tags, shippingWeightGrams: product.shippingWeightGrams, ...(badge ? { badge } : {}) } });
        record.products[product.name] = item.id; await save();
      }
    }
    if (brand.brandPhotos) {
      // The brand's other photos, once each (a photo already uploaded for a product is the same bytes: skipped).
      const folder = resolve(homedir(), 'Downloads', brand.brandPhotos);
      const sizes = new Set(await Promise.all((Object.values(record.photos) as string[]).filter(Boolean).map(url => uploads.getBuffer(url.split('/').pop()!).then(bytes => bytes?.length ?? -1, () => -1))));
      for (const file of (await readdir(folder)).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).sort()) {
        if (record.photos[`brand:${file}`]) continue;
        const bytes = await readFile(resolve(folder, file));
        if (sizes.has(bytes.length)) { record.photos[`brand:${file}`] = ''; continue; }
        const asset = await uploads.saveBuffer(bytes, /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg');
        await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
        record.photos[`brand:${file}`] = asset.url; await save();
      }
    }
    for (const item of brand.items ?? []) {
      if (record.products[item.name]) continue;
      const fromFolder = async (file: string) => {
        if (record.photos[file]) return record.photos[file] as string;
        const asset = await uploads.saveBuffer(await readFile(resolve(brand.photoFolder!, file)), /\.png$/i.test(file) ? 'image/png' : 'image/jpeg');
        await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
        record.photos[file] = asset.url; await save(); return asset.url as string;
      };
      const imageUrls = await Promise.all(item.photos.map(fromFolder));
      const variants = await Promise.all(item.colours.map(async colour => ({ id: `var_${randomUUID().replace(/-/g, '').slice(0, 12)}`, name: colour.value, stock: Math.floor(item.stock / item.colours.length),
        amount: item.amount, options: [{ name: item.option ?? 'Color', value: colour.value }], imageUrls: await Promise.all(colour.photos.map(fromFolder)) })));
      const product = await prisma.paymentLink.create({ data: { storeId, name: item.name, description: item.description, amount: item.amount, currency: 'BOB', stock: item.stock,
        variants: variants as never, imageUrls, shippingWeightGrams: 25000 } });
      record.products[item.name] = product.id; await save();
    }
    for (const [order, name] of (brand.real && !brand.category ? [] : [...new Set(rows.map(categoryOf))]).entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }
    for (const row of rows) {
      if (record.products[row.nombre]) continue;
      const imageUrls = brand.noPhoto?.includes(row.nombre) ? [] : await Promise.all(row.imagenes.split(/[|,]/).map(file => file.trim()).filter(Boolean).map(upload));
      const badge = brand.badges?.[row.nombre];
      const description = brand.noDescription?.includes(row.nombre) ? '' : row.descripcion;
      const item = await prisma.paymentLink.create({ data: { storeId, categoryId: brand.real && !brand.category ? null : record.categories[categoryOf(row)], name: row.nombre, description,
        amount: Math.round(Number(row.precio.replace(',', '.')) * 100), currency: 'BOB', stock: Number(row.stock) || 0, imageUrls, shippingWeightGrams: 500, ...(badge ? { badge } : {}) } });
      record.products[row.nombre] = item.id; await save();
    }
    const photos = (Object.values(record.photos) as string[]).filter(Boolean);
    await step('settings', async () => {
      if (!brand.real) await stores.update(merchantId, storeId, { contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true, aboutText: brand.about, policies: brand.policies } as never);
      const where = brand.location;
      const location = where && { id: randomUUID(), name: where.name, address: where.address, description: where.description, city: brand.city, pickupEnabled: true, deliveryEnabled: true,
        openingHours: [0, 1, 2, 3, 4, 5, 6].map(day => { const hours = where.hours.find(entry => entry[0] === day); return { day, open: hours?.[1] ?? '09:00', close: hours?.[2] ?? '18:00', closed: !hours }; }) };
      await prisma.store.update({ where: { id: storeId }, data: { ...(location ? { locations: [location] as never, shippingEnabled: true, shippingPickupEnabled: true } : {}),
        onboarding: { version: 1, step: 7, what: brand.what, story: brand.story, contact: { city: brand.city }, photos: photos.slice(0, 2), finishedAt: new Date().toISOString() } } });
    });
    await step('links', async () => { if (brand.instagram) await prisma.storeLink.create({ data: { storeId, label: 'Instagram', url: brand.instagram, sortOrder: 0 } }); });
    await step('shipping', async () => {
      const zone = brand.zone; if (!zone) return;
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: zone.name, fee: zone.fee, freeAbove: zone.freeAbove, estimatedMinutes: zone.minutes,
        ...(zone.departments.length ? { departments: zone.departments } : {}) } as never);
    });
    const content = app.get(CommerceContentService);
    await step('articles', async () => {
      for (const [index, article] of brand.articles.entries()) await content.saveArticle(merchantId, storeId, { ...article, locale: 'es', author: `Equipo ${brand.name}`, publishedAt: new Date(Date.now() - (index + 1) * 4 * 86_400_000).toISOString() } as never);
    });
    const promos = app.get(PromoCodesService);
    const code = brand.code;
    if (code) await step('promo-code', async () => {
      const welcome: any = await promos.create(merchantId, storeId, { code: code.code, discountType: 'PERCENT', discountValue: code.percent } as never);
      await promos.setFlags(merchantId, storeId, welcome.id, { showInAssistant: true, showInEmails: true });
      record.welcomeCodeId = welcome.id;
    });
    // The footer form and a popup after 12 s with the welcome code. Emails only go to an address someone types into this store.
    if (code) await step('newsletter', async () => {
      const retention = app.get(RetentionService);
      const current = await retention.settings(storeId);
      await retention.save(merchantId, storeId, {
        revision: current.revision, comebackEnabled: false, visitsRequired: 5, rewardLabel: 'Un regalo en tu próxima compra', timezone: 'America/La_Paz',
        signupEnabled: true, signupTitle: 'Novedades primero', signupBody: `Lo nuevo de ${brand.name} y un ${code.percent} % en tu primera compra.`, signupButton: 'Suscribirme',
        popupTrigger: 'delay', popupDelaySeconds: 12, popupPromoCodeId: record.welcomeCodeId, recoveryEnabled: true, recoveryHours: 2, reviewRequestsEnabled: true,
        welcomeEnabled: true, welcomeSubject: `Bienvenido a ${brand.name}`, welcomeBody: `Gracias por suscribirte. Usa el código ${code.code} en tu primera compra.`,
      } as never);
    });
    const assistant = brand.assistant;
    if (assistant) await step('assistant', async () => {
      await app.get(StoreAssistantAdminService).save(merchantId, storeId, { enabled: true, name: assistant.name, greeting: assistant.greeting, formality: 'tu', notes: assistant.notes } as never);
    });
    console.log(JSON.stringify({ storeId, slug: record.slug, products: Object.keys(record.products).length, photos: photos.length }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
