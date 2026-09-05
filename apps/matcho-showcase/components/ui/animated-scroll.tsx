"use client";

import type { ReactNode, WheelEvent } from "react";
import { useRef, useState } from "react";

export interface SplitScrollPage {
  id?: string;
  leftImage?: string;
  rightImage?: string;
  heading: string;
  description?: ReactNode;
  contentSide?: "left" | "right";
}

export default function AnimatedScroll({ pages }: Readonly<{ pages: SplitScrollPage[] }>) {
  const [current, setCurrent] = useState(0);
  const locked = useRef(false);
  const move = (step: number) => setCurrent((value) => Math.max(0, Math.min(pages.length - 1, value + step)));
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (locked.current || Math.abs(event.deltaY) < 20) return;
    locked.current = true;
    move(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => { locked.current = false; }, 700);
  };

  if (!pages.length) return null;

  return (
    <section tabIndex={0} onWheel={handleWheel} onKeyDown={(event) => { if (event.key === "ArrowUp") move(-1); if (event.key === "ArrowDown") move(1); }} aria-label="Split-screen story" className="relative h-[min(100svh,56rem)] overflow-hidden bg-black outline-none">
      {pages.map((page, index) => {
        const position = index - current;
        return (
          <article key={page.id ?? index} aria-hidden={index !== current} className="absolute inset-0 grid grid-cols-1 md:grid-cols-2">
            {(["left", "right"] as const).map((side) => {
              const image = side === "left" ? page.leftImage : page.rightImage;
              const containsCopy = page.contentSide === side || (!page.contentSide && side === (image ? "right" : "left"));
              const direction = side === "left" ? 1 : -1;
              return (
                <div key={side} className="relative grid place-items-center overflow-hidden p-8 text-white transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none" style={{ transform: `translateY(${position * direction * 100}%)` }}>
                  {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                  {image && <span className="absolute inset-0 bg-black/25" />}
                  {containsCopy && <div className="relative z-10 max-w-md text-center"><h2 className="text-3xl font-semibold md:text-5xl">{page.heading}</h2>{page.description && <div className="mt-4 text-lg text-white/80">{page.description}</div>}</div>}
                </div>
              );
            })}
          </article>
        );
      })}
      <div className="absolute bottom-5 right-5 z-20 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold text-white">{current + 1} / {pages.length}</div>
    </section>
  );
}
