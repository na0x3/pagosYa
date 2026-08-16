"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export interface CoverflowSlide {
  src: string;
  alt: string;
  title?: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
}

export interface CoverflowCarouselProps {
  slides: CoverflowSlide[];
  rotate?: number;
  depth?: number;
  perspective?: number;
  falloff?: number;
  fade?: number;
  cardWidth?: string;
  gap?: number;
  loop?: boolean;
  showCaption?: boolean;
  showPagination?: boolean;
  showNavigation?: boolean;
  label?: string;
  className?: string;
  cardClassName?: string;
}

export function CoverflowCarousel({ slides, rotate = 44, depth = 0.6, perspective = 3, falloff = 0.56, fade = 0.1, cardWidth = "clamp(148px, 22vw, 260px)", gap = 0.05, loop = true, showCaption = false, showPagination = false, showNavigation = false, label = "Galería de productos", className, cardClassName }: CoverflowCarouselProps) {
  const count = slides.length;
  const frameRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const posRef = React.useRef(0);
  const targetRef = React.useRef(0);
  const widthRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const dragRef = React.useRef<{ id: number; x: number; pos: number; v: number; t: number } | null>(null);
  const [selected, setSelected] = React.useState(0);
  const reduceMotion = React.useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const indexAt = React.useCallback((pos: number) => count ? ((Math.round(pos) % count) + count) % count : 0, [count]);

  const paint = React.useCallback(() => {
    const width = widthRef.current;
    if (!width || !count) return;
    const pitch = width * (1 + gap);
    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      let offset = index - posRef.current;
      if (loop) {
        offset = ((offset % count) + count) % count;
        if (offset > count / 2) offset -= count;
      }
      const distance = Math.abs(offset);
      const ramp = Math.pow(distance, falloff);
      const tilt = Math.min(rotate * ramp, 82) * Math.sign(offset);
      card.style.transform = `translateX(calc(-50% + ${offset * pitch}px)) translateZ(${-depth * width * ramp}px) rotateY(${-tilt}deg)`;
      const edge = loop ? Math.min(1, Math.max(0, count / 2 - distance)) : 1;
      card.style.opacity = String(Math.max(0, 1 - fade * distance) * edge);
      card.style.zIndex = String(100 - Math.round(distance));
    });
  }, [count, depth, fade, falloff, gap, loop, rotate]);

  const clamp = React.useCallback((pos: number) => loop ? pos : Math.max(0, Math.min(count - 1, pos)), [count, loop]);
  const settle = React.useCallback((target: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    targetRef.current = target;
    setSelected(indexAt(target));
    if (reduceMotion) { posRef.current = target; paint(); return; }
    const step = () => {
      const remaining = target - posRef.current;
      if (Math.abs(remaining) < 0.0004) { posRef.current = target; paint(); rafRef.current = null; return; }
      posRef.current += remaining * 0.16;
      paint();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [indexAt, paint, reduceMotion]);
  const goTo = React.useCallback((index: number) => settle(clamp(loop ? index + Math.round((targetRef.current - index) / count) * count : index)), [clamp, count, loop, settle]);
  const nudge = React.useCallback((by: number) => settle(clamp(Math.round(targetRef.current) + by)), [clamp, settle]);

  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || !count) return;
    const measure = () => { const card = cardRefs.current[0]; if (card) { widthRef.current = card.offsetWidth; paint(); } };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [count, paint]);
  React.useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);
  if (!count) return null;
  const active = slides[selected];

  return <div className={cn("w-full", className)} style={{ ["--cf-card" as string]: cardWidth }} role="region" aria-roledescription="carousel" aria-label={label}>
    <div className="relative">
      <div ref={frameRef} role="slider" tabIndex={0} aria-label={label} aria-valuemin={1} aria-valuemax={count} aria-valuenow={selected + 1} aria-valuetext={`${selected + 1} de ${count}`}
        onPointerDown={(event) => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); event.currentTarget.setPointerCapture(event.pointerId); targetRef.current = posRef.current; dragRef.current = { id: event.pointerId, x: event.clientX, pos: posRef.current, v: 0, t: performance.now() }; }}
        onPointerMove={(event) => { const drag = dragRef.current; if (!drag || drag.id !== event.pointerId) return; const pitch = widthRef.current * (1 + gap); if (!pitch) return; const now = performance.now(); const previous = posRef.current; posRef.current = clamp(drag.pos - (event.clientX - drag.x) / pitch); drag.v = ((posRef.current - previous) / Math.max(now - drag.t, 1)) * 1000; drag.t = now; const index = indexAt(posRef.current); if (index !== selected) setSelected(index); paint(); }}
        onPointerUp={(event) => { const drag = dragRef.current; if (!drag || drag.id !== event.pointerId) return; dragRef.current = null; settle(clamp(Math.round(posRef.current + Math.max(-2, Math.min(2, drag.v * 0.18))))); }}
        onPointerCancel={(event) => { if (dragRef.current?.id === event.pointerId) { dragRef.current = null; settle(clamp(Math.round(posRef.current))); } }}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); nudge(event.key === "ArrowLeft" ? -1 : 1); } }}
        className="cursor-grab overflow-hidden py-10 outline-none ring-ring focus-visible:ring-2 active:cursor-grabbing" style={{ perspective: `calc(var(--cf-card) * ${perspective})`, touchAction: "pan-y" }}>
        <div className="relative select-none" style={{ height: "var(--cf-card)", transformStyle: "preserve-3d" }}>
          {slides.map((slide, index) => <div key={`${slide.src}-${index}`} ref={(node) => { cardRefs.current[index] = node; }} role="group" aria-roledescription="slide" aria-label={`${index + 1} de ${count}`} className={cn("absolute top-0 left-1/2 aspect-square overflow-hidden rounded-2xl bg-neutral-200 shadow-xl will-change-transform", cardClassName)} style={{ width: "var(--cf-card)" }}>
            <img src={slide.src} alt={slide.alt} draggable={false} className="h-full w-full select-none object-cover" />
          </div>)}
        </div>
      </div>
      {showNavigation && <><button type="button" aria-label="Foto anterior" onClick={() => nudge(-1)} className="absolute top-1/2 left-3 z-[200] -translate-y-1/2 rounded-full bg-white/80 p-2 text-black backdrop-blur transition hover:bg-white"><ChevronLeft className="size-5" /></button><button type="button" aria-label="Foto siguiente" onClick={() => nudge(1)} className="absolute top-1/2 right-3 z-[200] -translate-y-1/2 rounded-full bg-white/80 p-2 text-black backdrop-blur transition hover:bg-white"><ChevronRight className="size-5" /></button></>}
    </div>
    {showCaption && active?.title && <div key={selected} className="mt-2 flex flex-col items-center px-6 text-center"><p className="text-[15px] font-semibold tracking-tight">{active.title}</p>{active.subtitle && <p className="mt-1 text-[13px] opacity-70">{active.subtitle}</p>}{active.meta?.length ? <dl className="mt-5 w-full max-w-[230px] text-[12px]">{active.meta.map((row) => <div key={row.label} className="flex justify-between py-[5px]"><dt className="opacity-60">{row.label}</dt><dd className="font-medium">{row.value}</dd></div>)}</dl> : null}</div>}
    {showPagination && <div className="mt-6 flex items-center justify-center gap-2">{slides.map((_, index) => <button key={index} type="button" aria-label={`Ir a foto ${index + 1}`} aria-current={index === selected} onClick={() => goTo(index)} className={cn("size-2 rounded-full bg-current transition-opacity", index === selected ? "opacity-100" : "opacity-30")} />)}</div>}
  </div>;
}
