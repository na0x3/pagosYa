"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";

export interface GalleryAccordionItem {
  id: string | number;
  url: string;
  title: string;
  description?: string;
  tags?: string[];
}

export function GalleryModalAccordion({ items, initialIndex = 0 }: Readonly<{ items: GalleryAccordionItem[]; initialIndex?: number }>) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(items.length - 1, 0)));
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const active = items[index];

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!items.length || !active) return null;

  return (
    <div className="relative">
      <div className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto py-10 md:gap-2">
        {items.slice(0, 11).map((item, itemIndex) => (
          <motion.button
            type="button"
            key={item.id}
            layout={!reduceMotion}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onPointerEnter={() => setIndex(itemIndex)}
            onFocus={() => setIndex(itemIndex)}
            onClick={() => { setIndex(itemIndex); setOpen(true); }}
            aria-label={`Open ${item.title}`}
            className={`h-56 shrink-0 overflow-hidden rounded-2xl ${index === itemIndex ? "w-64" : "w-8 md:w-11"}`}
          >
            <motion.img layoutId={reduceMotion ? undefined : `gallery-${item.id}`} src={item.url} alt={item.title} className="h-full w-full object-cover" />
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-md" onClick={() => setOpen(false)}>
            <motion.article layoutId={reduceMotion ? undefined : `gallery-${active.id}`} onClick={(event) => event.stopPropagation()} className="relative aspect-square w-full max-w-lg overflow-hidden rounded-2xl bg-black text-white shadow-2xl">
              <img src={active.url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-6 pt-20">
                <h2 id={titleId} className="text-2xl font-semibold">{active.title}</h2>
                {active.description && <p className="mt-2 text-sm text-white/80">{active.description}</p>}
              </div>
              <button autoFocus type="button" onClick={() => setOpen(false)} aria-label="Close gallery" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-black/55 text-white"><X aria-hidden="true" /></button>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default GalleryModalAccordion;
