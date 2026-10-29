import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Reveal } from '@pagosya/ui';
import { store } from './store-data';
import { variant } from './Shell';
import { IconMessageCircle } from './icons';

/** Owner 2026-10-27 («things that have to do with each store… a medidas thing where you put your medidas and send an inquiry or
 *  WhatsApp message»): one working module per store, the one the API chose for its business (variants.module). Each one ends in a
 *  WhatsApp message the visitor sends to the store, written for them, so it is shown only when the store has a number. The same
 *  file sits in every industry skeleton; the skeleton's CSS gives it its look. */

type Item = { id?: string; name?: string; imageUrls?: string[]; amount?: number; currency?: string; specifications?: Array<{ label?: string; value?: string }> };
const catalogItems = (): Item[] => ((window as unknown as { PAGOSYA_CONFIG?: { data?: { items?: Item[] } } }).PAGOSYA_CONFIG?.data?.items) ?? [];
function useItems(): Item[] {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => { setItems(catalogItems().filter(item => item?.name)); }, []);
  return items;
}
const money = (item?: Item) => item?.amount ? `Bs ${(item.amount / 100).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '';
const openWhatsApp = (phone: string, lines: string[]) => window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`, '_blank', 'noopener');
const fieldValue = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function Frame({ id, kicker, title, lead, photo, children }: { id: string; kicker: string; title: string; lead: string; photo?: ReactNode; children: ReactNode }) {
  return <section id={id} className={photo ? 'md-module' : 'md-module md-module--solo'} aria-labelledby={`md-${id}-title`}>
    {photo ? <Reveal className="md-module__media">{photo}</Reveal> : null}
    <Reveal className="md-module__main">
      <p className="md-kicker">{kicker}</p>
      <h2 id={`md-${id}-title`} className="md-title">{title}</h2>
      <p className="md-lead">{lead}</p>
      {children}
    </Reveal>
  </section>;
}

export function StoreModule({ photo }: { photo?: string }) {
  const phone: string = store.phone;
  const kind = variant('module', 'none');
  if (!phone || kind === 'none') return null;
  const image = photo ? <img src={photo} alt="" aria-hidden="true" loading="lazy" /> : undefined;
  return kind === 'measure' ? <Measurements phone={phone} photo={image} />
    : kind === 'reserve' ? <Reserve phone={phone} photo={image} />
    : kind === 'compare' ? <Compare phone={phone} />
    : kind === 'frame' ? <FramePicker phone={phone} />
    : kind === 'bouquet' ? <Bouquet phone={phone} photo={image} /> : null;
}

/** Atelier, tailoring: measurements, the event date and the piece, sent as one message. */
function Measurements({ phone, photo }: { phone: string; photo?: ReactNode }) {
  const items = useItems();
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), v = (name: string) => fieldValue(form, name);
    const cm = (name: string, label: string) => v(name) ? `${label}: ${v(name)} cm` : '';
    openWhatsApp(phone, [`Hola ${store.name}, quisiera una pieza a medida.`, v('nombre') ? `Soy ${v('nombre')}.` : '', v('pieza') ? `Me interesa: ${v('pieza')}.` : '',
      [cm('busto', 'Busto'), cm('cintura', 'Cintura'), cm('cadera', 'Cadera'), cm('altura', 'Altura')].filter(Boolean).join(' · '), v('fecha') ? `Fecha del evento: ${v('fecha')}.` : '', v('nota')]);
  };
  return <Frame id="medidas" kicker="A medida" title="Tus medidas" lead="Escribe tus medidas y la fecha de tu evento; te respondemos por WhatsApp con la prueba y el presupuesto." photo={photo}>
    <form className="md-form" onSubmit={send}>
      <label className="md-field md-field--wide"><span>Nombre</span><input name="nombre" autoComplete="name" /></label>
      {items.length ? <label className="md-field md-field--wide"><span>Pieza que te interesa</span><select name="pieza" defaultValue=""><option value="">Aún no sé</option>{items.map(item => <option key={item.name}>{item.name}</option>)}</select></label> : null}
      {[['busto', 'Busto'], ['cintura', 'Cintura'], ['cadera', 'Cadera'], ['altura', 'Altura']].map(([name, label]) => <label key={name} className="md-field"><span>{label} (cm)</span><input name={name} type="number" inputMode="decimal" min="30" max="220" step="0.5" /></label>)}
      <label className="md-field md-field--wide"><span>Fecha del evento</span><input name="fecha" type="date" /></label>
      <label className="md-field md-field--wide"><span>Algo más que debamos saber</span><textarea name="nota" rows={3} /></label>
      <button type="submit" className="es-btn es-btn--accent md-send"><IconMessageCircle /> Enviar por WhatsApp</button>
    </form>
  </Frame>;
}

/** Food: a table for a day and time. */
function Reserve({ phone, photo }: { phone: string; photo?: ReactNode }) {
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), v = (name: string) => fieldValue(form, name);
    openWhatsApp(phone, [`Hola ${store.name}, quisiera reservar una mesa.`, v('nombre') ? `A nombre de ${v('nombre')}.` : '', `Para ${v('personas') || '2'} personas`, v('fecha') ? `el ${v('fecha')}` : '', v('hora') ? `a las ${v('hora')}.` : '', v('nota')]);
  };
  return <Frame id="reserva" kicker="Te esperamos" title="Reserva tu mesa" lead="Elige el día, la hora y cuántos vienen; te confirmamos por WhatsApp." photo={photo}>
    <form className="md-form" onSubmit={send}>
      <label className="md-field md-field--wide"><span>Nombre</span><input name="nombre" autoComplete="name" /></label>
      <label className="md-field"><span>Día</span><input name="fecha" type="date" required /></label>
      <label className="md-field"><span>Hora</span><input name="hora" type="time" required /></label>
      <label className="md-field md-field--wide"><span>Personas</span><div className="md-chips" role="radiogroup">{['1', '2', '3', '4', '5', '6+'].map((n, i) => <label key={n} className="md-chip"><input type="radio" name="personas" value={n} defaultChecked={i === 1} /><span>{n}</span></label>)}</div></label>
      <label className="md-field md-field--wide"><span>Algo más (cumpleaños, alergias…)</span><textarea name="nota" rows={2} /></label>
      <button type="submit" className="es-btn es-btn--accent md-send"><IconMessageCircle /> Reservar por WhatsApp</button>
    </form>
  </Frame>;
}

/** Electronics: two products side by side, their specifications row by row. */
function Compare({ phone }: { phone: string }) {
  const items = useItems().filter(item => item.specifications?.length);
  const [a, setA] = useState(0), [b, setB] = useState(1);
  const labels = useMemo(() => [...new Set([items[a], items[b]].flatMap(item => (item?.specifications ?? []).map(spec => String(spec.label ?? ''))).filter(Boolean))], [items, a, b]);
  if (items.length < 2) return null;
  const spec = (item: Item | undefined, label: string) => item?.specifications?.find(entry => entry.label === label)?.value ?? '—';
  const pick = (value: number, set: (n: number) => void) => <select value={value} onChange={event => set(Number(event.target.value))}>{items.map((item, index) => <option key={item.id ?? index} value={index}>{item.name}</option>)}</select>;
  return <Frame id="compara" kicker="Elige bien" title="Compara modelos" lead="Pon dos modelos lado a lado y mira en qué se diferencian.">
    <div className="md-compare">
      <div className="md-compare__head"><span />{[[a, setA], [b, setB]].map(([value, set], index) => { const item = items[value as number]; return <div key={index} className="md-compare__pick">
        {item?.imageUrls?.[0] ? <img src={item.imageUrls[0]} alt="" aria-hidden="true" /> : null}{pick(value as number, set as (n: number) => void)}<p className="md-compare__price">{money(item)}</p></div>; })}</div>
      <table className="md-compare__table"><tbody>{labels.map(label => <tr key={label}><th scope="row">{label}</th><td>{spec(items[a], label)}</td><td>{spec(items[b], label)}</td></tr>)}</tbody></table>
      <button type="button" className="es-btn es-btn--accent md-send" onClick={() => openWhatsApp(phone, [`Hola ${store.name}, estoy comparando ${items[a]?.name} y ${items[b]?.name}. ¿Cuál me recomiendan?`])}><IconMessageCircle /> Pedir consejo por WhatsApp</button>
    </div>
  </Frame>;
}

/** Art prints: the print in a frame colour and size, previewed, then asked for. */
const FRAMES = [['Madera natural', '#b98a5a'], ['Negro', '#1b1b1b'], ['Blanco', '#f4f2ee'], ['Dorado', '#b8963e']] as const;
const FRAME_SIZES = ['30 × 40 cm', '40 × 50 cm', '50 × 70 cm'] as const;
function FramePicker({ phone }: { phone: string }) {
  const items = useItems().filter(item => item.imageUrls?.length);
  const [index, setIndex] = useState(0), [frame, setFrame] = useState(0), [size, setSize] = useState(1);
  if (!items.length) return null;
  const item = items[Math.min(index, items.length - 1)];
  return <Frame id="marco" kicker="Pruébalo antes" title="Elige tu marco" lead="Mira la obra con el marco y el tamaño que quieras; te confirmamos el precio por WhatsApp.">
    <div className="md-frame">
      <div className="md-frame__wall"><div className="md-frame__piece" data-size={size} style={{ borderColor: FRAMES[frame][1] }}><img src={item.imageUrls![item.imageUrls!.length > 1 ? 1 : 0]} alt={item.name} /></div></div>
      <div className="md-frame__controls">
        <label className="md-field md-field--wide"><span>Obra</span><select value={index} onChange={event => setIndex(Number(event.target.value))}>{items.map((entry, n) => <option key={entry.id ?? n} value={n}>{entry.name}</option>)}</select></label>
        <div className="md-field md-field--wide"><span>Marco</span><div className="md-swatches">{FRAMES.map(([label, colour], n) => <button key={label} type="button" className="md-swatch" aria-pressed={frame === n} aria-label={label} title={label} style={{ background: colour }} onClick={() => setFrame(n)} />)}</div><small>{FRAMES[frame][0]}</small></div>
        <div className="md-field md-field--wide"><span>Tamaño</span><div className="md-chips">{FRAME_SIZES.map((label, n) => <button key={label} type="button" className="md-chip md-chip--button" aria-pressed={size === n} onClick={() => setSize(n)}>{label}</button>)}</div></div>
        <button type="button" className="es-btn es-btn--accent md-send" onClick={() => openWhatsApp(phone, [`Hola ${store.name}, quiero «${item.name}» con marco ${FRAMES[frame][0].toLowerCase()} en ${FRAME_SIZES[size]}. ¿Cuánto sale?`])}><IconMessageCircle /> Pedir por WhatsApp</button>
      </div>
    </div>
  </Frame>;
}

/** Florist: a bouquet to start from, the paper colour and the card's words. */
const PAPERS = [['Rosa', '#f4b6c2'], ['Verde menta', '#bfe3cf'], ['Lila', '#cdb8e6'], ['Crema', '#f2e6cf'], ['Amarillo', '#f6dc7a']] as const;
function Bouquet({ phone, photo }: { phone: string; photo?: ReactNode }) {
  const items = useItems();
  const [paper, setPaper] = useState(0);
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), v = (name: string) => fieldValue(form, name);
    openWhatsApp(phone, [`Hola ${store.name}, quiero armar un ramo.`, v('base') ? `Como: ${v('base')}.` : '', `Papel ${PAPERS[paper][0].toLowerCase()}.`, v('tarjeta') ? `Tarjeta: «${v('tarjeta')}»` : '', v('fecha') ? `Para el ${v('fecha')}.` : '', v('para') ? `Entregar a: ${v('para')}.` : '']);
  };
  return <Frame id="ramo" kicker="A tu gusto" title="Arma tu ramo" lead="Elige un ramo para empezar, el color del papel y lo que dirá la tarjeta." photo={photo}>
    <form className="md-form" onSubmit={send}>
      {items.length ? <label className="md-field md-field--wide"><span>Empieza desde</span><select name="base" defaultValue="">{[<option key="" value="">Sorpréndanme</option>, ...items.map(item => <option key={item.name}>{item.name}</option>)]}</select></label> : null}
      <div className="md-field md-field--wide"><span>Papel</span><div className="md-swatches">{PAPERS.map(([label, colour], n) => <button key={label} type="button" className="md-swatch" aria-pressed={paper === n} aria-label={label} title={label} style={{ background: colour }} onClick={() => setPaper(n)} />)}</div><small>{PAPERS[paper][0]}</small></div>
      <label className="md-field md-field--wide"><span>Lo que dirá la tarjeta</span><textarea name="tarjeta" rows={2} maxLength={200} /></label>
      <label className="md-field"><span>Para el día</span><input name="fecha" type="date" /></label>
      <label className="md-field"><span>Para quién</span><input name="para" /></label>
      <button type="submit" className="es-btn es-btn--accent md-send"><IconMessageCircle /> Pedir por WhatsApp</button>
    </form>
  </Frame>;
}
