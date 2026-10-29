import { useEffect } from 'react';
import { variant } from './Shell';

/** Owner 2026-10-27 («still no motion bubbles like we had before»): ready-made motion effects the build switches on from the
 *  merchant's words and products — bubbles for drinks, floating shapes for playful stores, petals for flowers, steam for coffee
 *  and bakeries, sparkles for beauty and gifts. Pure CSS, the same positions every visit; still for reduced motion. */
const COUNTS: Record<string, number> = { bubbles: 18, shapes: 10, petals: 14, steam: 4, sparkles: 16 };

export function EffectLayer() {
  const effect = variant('effect', 'none');
  const count = COUNTS[effect];
  if (!count) return null;
  return <div className="es-fx" data-es-fx={effect} aria-hidden="true">{Array.from({ length: count }, (_, index) => {
    const spread = (step: number) => ((index + 1) * step * 0.618034) % 1;
    const style = { '--fx-x': `${Math.round(4 + spread(7) * 92)}%`, '--fx-y': `${Math.round(8 + spread(17) * 80)}%`, '--fx-s': (0.55 + spread(3)).toFixed(2),
      '--fx-d': `${(6 + spread(5) * 8).toFixed(1)}s`, '--fx-delay': `-${(spread(11) * 12).toFixed(1)}s`, '--fx-r': `${Math.round(spread(13) * 360)}deg` };
    return <i key={index} style={style as never} data-fx-n={index % 4} />;
  })}</div>;
}

/** Confetti from the button when something goes into the cart (owner 2026-10-27). */
export function Confetti() {
  useEffect(() => {
    if (variant('confetti', 'off') !== 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const burst = (event: Event) => {
      const button = (event.target as Element | null)?.closest?.('[data-add],.es-card__add');
      if (!button || (button as HTMLButtonElement).disabled) return;
      const box = button.getBoundingClientRect();
      const layer = document.createElement('div');
      layer.className = 'es-confetti';
      layer.style.left = `${box.left + box.width / 2}px`;
      layer.style.top = `${box.top + box.height / 2}px`;
      for (let index = 0; index < 18; index++) {
        const bit = document.createElement('i');
        bit.style.setProperty('--a', `${index * 20}deg`);
        bit.style.setProperty('--d', `${44 + (index * 37) % 50}px`);
        layer.append(bit);
      }
      (document.querySelector('.es') ?? document.body).append(layer);
      setTimeout(() => layer.remove(), 1000);
    };
    document.addEventListener('click', burst, true);
    return () => document.removeEventListener('click', burst, true);
  }, []);
  return null;
}
