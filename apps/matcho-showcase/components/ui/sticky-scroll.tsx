"use client";

import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";
import { forwardRef } from "react";

export interface StickyGalleryItem { id?: string; src: string; alt: string }

const StickyScroll = forwardRef<HTMLElement, { items: StickyGalleryItem[]; heading?: string }>(({ items, heading = "A gallery shaped by the scroll" }, ref) => {
  const reduceMotion = useReducedMotion();
  const columns = [items.filter((_, index) => index % 3 === 0), items.filter((_, index) => index % 3 === 1), items.filter((_, index) => index % 3 === 2)];
  return (
    <ReactLenis root options={{ lerp: reduceMotion ? 1 : 0.09, smoothWheel: !reduceMotion }}>
      <main ref={ref} className="bg-slate-950 text-white">
        <section className="sticky top-0 grid h-screen place-content-center overflow-hidden px-8">
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
          <h1 className="relative text-center text-5xl font-semibold leading-[1.05] tracking-tight 2xl:text-7xl">{heading}</h1>
        </section>
        <section className="relative grid grid-cols-3 gap-2 p-2">
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className={columnIndex === 1 ? "sticky top-0 grid h-screen gap-2" : "grid gap-2"}>
              {column.map((item) => <figure key={item.id ?? item.src} className="min-h-60 overflow-hidden rounded-md"><img src={item.src} alt={item.alt} className="h-full min-h-60 w-full object-cover" /></figure>)}
            </div>
          ))}
        </section>
      </main>
    </ReactLenis>
  );
});

StickyScroll.displayName = "StickyScroll";
export default StickyScroll;
