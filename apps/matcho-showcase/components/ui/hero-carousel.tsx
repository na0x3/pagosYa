"use client";

import * as React from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface HeroCarouselItem {
  id?: string | number;
  title: string;
  image: string;
  credit?: string;
  meta?: string[];
  accent?: string;
}

export interface HeroCarouselProps {
  items: HeroCarouselItem[];
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  brand?: React.ReactNode;
  onBack?: () => void;
  onMenu?: () => void;
  autoplay?: boolean;
  autoplayDelay?: number;
  className?: string;
}

const clamp = (number: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, number));

export function HeroCarousel({
  items,
  index: controlled,
  defaultIndex = 0,
  onIndexChange,
  brand,
  onBack,
  onMenu,
  autoplay = false,
  autoplayDelay = 4000,
  className,
}: HeroCarouselProps) {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ width: 0, height: 0 });
  const [uncontrolled, setUncontrolled] = React.useState(defaultIndex);
  const [dragging, setDragging] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const reduced = useReducedMotion();
  const last = items.length - 1;
  const index = clamp(controlled ?? uncontrolled, 0, Math.max(0, last));

  const go = React.useCallback((next: number) => {
    const target = clamp(next, 0, Math.max(0, last));
    if (controlled === undefined) setUncontrolled(target);
    if (target !== index) onIndexChange?.(target);
  }, [controlled, index, last, onIndexChange]);

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const read = () => setBox({ width: stage.clientWidth, height: stage.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const cardHeight = clamp(box.height * 0.264, 96, 360);
  const cardWidth = cardHeight * 0.75;
  const gap = Math.max(4, Math.round(cardWidth * 0.038));
  const step = cardWidth + gap;
  const xFor = React.useCallback((itemIndex: number) => box.width / 2 - (itemIndex * step + cardWidth / 2), [box.width, cardWidth, step]);
  const x = useMotionValue(0);
  const spring = React.useMemo(
    () => reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 34, mass: 0.9 },
    [reduced],
  );

  React.useEffect(() => {
    if (dragging) return;
    const controls = animate(x, xFor(index), spring);
    return () => controls.stop();
  }, [dragging, index, spring, x, xFor]);

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pause = () => setPaused(true);
    const resume = () => setPaused(false);
    stage.addEventListener("pointerenter", pause);
    stage.addEventListener("pointerleave", resume);
    stage.addEventListener("focusin", pause);
    stage.addEventListener("focusout", resume);
    return () => {
      stage.removeEventListener("pointerenter", pause);
      stage.removeEventListener("pointerleave", resume);
      stage.removeEventListener("focusin", pause);
      stage.removeEventListener("focusout", resume);
    };
  }, []);

  React.useEffect(() => {
    if (!autoplay || paused || dragging || items.length < 2) return;
    const timer = window.setTimeout(() => go(index === last ? 0 : index + 1), autoplayDelay);
    return () => window.clearTimeout(timer);
  }, [autoplay, autoplayDelay, dragging, go, index, items.length, last, paused]);

  const active = items[index];
  if (!active) return null;
  const labelSize = Math.max(10, Math.round(box.height * 0.0103));

  return (
    <div
      ref={stageRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Destacados"
      className={cn("relative h-full min-h-[34rem] w-full select-none overflow-hidden bg-black text-white", className)}
    >
      <AnimatePresence initial={false}>
        <motion.div key={index} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : { duration: 0.7, ease: "easeOut" }}>
          <motion.img src={active.image} alt="" aria-hidden draggable={false} className="size-full object-cover" initial={{ transform: reduced ? "scale(1.28)" : "scale(1.42)" }} animate={{ transform: "scale(1.28)" }} transition={reduced ? { duration: 0 } : { duration: 6, ease: "linear" }} />
          <div className="absolute inset-0 opacity-55" style={{ backgroundColor: active.accent ?? "#8a8a8a", mixBlendMode: "multiply" }} />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/55" />

      <div className="absolute inset-x-0 top-5 z-10 flex items-center justify-center gap-[6vw]" style={{ fontSize: labelSize }}>
        {onBack ? <button type="button" onClick={onBack}>Back</button> : null}
        {brand ? <div className="font-semibold tracking-[.06em]">{brand}</div> : null}
        {onMenu ? <button type="button" onClick={onMenu}>Menu</button> : null}
      </div>

      <div className="absolute inset-x-0 top-0 flex h-1/2 items-end px-[3vw] pb-[3vh]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.h2 key={index} className="whitespace-pre-line text-[clamp(3rem,8vh,7rem)] font-semibold leading-[.86] tracking-[-.04em]" initial={{ opacity: 0, transform: "translateY(24px)" }} animate={{ opacity: 1, transform: "translateY(0)" }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : { duration: 0.62, ease: [0.22, 1, 0.36, 1] }}>{active.title}</motion.h2>
        </AnimatePresence>
        {active.credit ? <p className="ml-[6vw] font-mono uppercase tracking-[.14em] opacity-80" style={{ fontSize: labelSize }}>{active.credit}</p> : null}
        {active.meta?.length ? <div className="ml-auto flex gap-[5vw] font-mono uppercase tracking-[.14em] opacity-80" style={{ fontSize: labelSize }}>{active.meta.map((fact) => <span key={fact}>{fact}</span>)}</div> : null}
      </div>

      <motion.div
        className="absolute top-1/2 flex items-start"
        style={{ gap, x, cursor: dragging ? "grabbing" : "grab" }}
        drag="x"
        dragMomentum={false}
        dragElastic={0.08}
        dragConstraints={{ left: xFor(last), right: xFor(0) }}
        onDragStart={() => setDragging(true)}
        onDragEnd={(_, info) => {
          setDragging(false);
          const thrown = x.get() + info.velocity.x * 0.12;
          go(Math.round((box.width / 2 - thrown - cardWidth / 2) / step));
        }}
      >
        {items.map((item, itemIndex) => (
          <motion.button
            key={item.id ?? itemIndex}
            type="button"
            aria-label={item.title.replace(/\n/g, " ")}
            aria-current={itemIndex === index}
            onClick={() => go(itemIndex)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") go(index - 1);
              if (event.key === "ArrowRight") go(index + 1);
              if (event.key === "Home") go(0);
              if (event.key === "End") go(last);
            }}
            className="relative shrink-0 overflow-hidden bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ width: cardWidth }}
            animate={{ height: itemIndex === index ? cardHeight : cardHeight / 2 }}
            transition={spring}
          >
            <img src={item.image} alt="" draggable={false} className="size-full object-cover" style={{ objectPosition: "50% 26%" }} />
            <motion.span aria-hidden className="absolute inset-0 bg-black" animate={{ opacity: itemIndex === index ? 0 : 0.12 }} transition={spring} />
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
