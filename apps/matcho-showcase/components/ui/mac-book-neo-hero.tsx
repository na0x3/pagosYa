"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Leaf } from "lucide-react";
import { useReducedMotion } from "motion/react";

export type FrameSequenceStep = {
  from: number;
  to: number;
  color: string;
  num: string;
  total: string;
  icon?: ReactNode;
  title: string;
  description: string;
  label: string;
};

export type FrameSequenceHeroProps = {
  frameCount: number;
  framePath: (index: number) => string;
  eagerCount?: number;
  scrollHeight?: string;
  brand?: ReactNode;
  navLinks?: { label: string; href: string }[];
  ctaLabel?: string;
  ctaHref?: string;
  title: ReactNode;
  subtitle?: string;
  steps: FrameSequenceStep[];
  className?: string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function FrameSequenceHero({
  frameCount,
  framePath,
  eagerCount = 18,
  scrollHeight = "500vh",
  brand,
  navLinks = [],
  ctaLabel,
  ctaHref = "#productos",
  title,
  subtitle,
  steps,
  className = "",
}: FrameSequenceHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<HTMLImageElement[]>([]);
  const targetFrameRef = useRef(0);
  const displayFrameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const loadedRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const [loadPercent, setLoadPercent] = useState(0);
  const [loaderDone, setLoaderDone] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [activeStep, setActiveStep] = useState(-1);
  const [stepProgress, setStepProgress] = useState(0);
  const [progress, setProgress] = useState(0);

  const animateFrame = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      const difference = targetFrameRef.current - displayFrameRef.current;
      displayFrameRef.current = Math.abs(difference) < 0.08
        ? targetFrameRef.current
        : displayFrameRef.current + difference * 0.28;
      setCurrentFrame(clamp(Math.round(displayFrameRef.current), 0, frameCount - 1));
      if (displayFrameRef.current !== targetFrameRef.current) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [frameCount]);

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = 0;
    cacheRef.current = new Array(frameCount);
    const firstBatch = Math.min(eagerCount, frameCount);

    const load = (index: number) => {
      const image = new Image();
      image.decoding = "async";
      const settled = () => {
        if (cancelled) return;
        loadedRef.current += 1;
        setLoadPercent(Math.round((loadedRef.current / frameCount) * 100));
        if (loadedRef.current === firstBatch) {
          setLoaderDone(true);
          for (let next = firstBatch; next < frameCount; next += 1) load(next);
        }
      };
      image.onload = settled;
      image.onerror = settled;
      image.src = framePath(index + 1);
      cacheRef.current[index] = image;
    };

    for (let index = 0; index < firstBatch; index += 1) load(index);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [eagerCount, frameCount, framePath]);

  useEffect(() => {
    const onScroll = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const distance = Math.max(1, root.offsetHeight - window.innerHeight);
      const nextProgress = clamp(-rect.top / distance, 0, 1);
      setProgress(nextProgress);
      targetFrameRef.current = (reduceMotion ? Math.round(nextProgress * (steps.length - 1)) / Math.max(1, steps.length - 1) : nextProgress) * (frameCount - 1);
      animateFrame();

      const found = steps.findIndex((step) => nextProgress >= step.from && nextProgress < step.to);
      setActiveStep(found);
      if (found >= 0) {
        const step = steps[found];
        setStepProgress(clamp((nextProgress - step.from) / (step.to - step.from), 0, 1));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [animateFrame, frameCount, reduceMotion, steps]);

  return (
    <div
      ref={rootRef}
      className={`relative bg-[#f1eadf] text-[#0b2116] ${className}`}
      style={{ height: reduceMotion ? "260vh" : scrollHeight }}
    >
      <div className={`fixed inset-0 z-[90] grid place-items-center bg-[#0b2116] text-[#fffdf6] transition-[opacity,visibility] duration-300 ${loaderDone ? "pointer-events-none invisible opacity-0" : "visible opacity-100"}`} aria-hidden={loaderDone}>
        <div className="w-[min(320px,80vw)] text-center">
          <p className="text-sm font-bold tracking-[0.18em] uppercase">Preparando secuencia · {loadPercent}%</p>
          <div className="mt-4 h-1 overflow-hidden bg-white/20"><span className="block h-full origin-left bg-[#ad8a49]" style={{ transform: `scaleX(${loadPercent / 100})` }} /></div>
        </div>
      </div>

      <section className="sticky top-0 h-screen overflow-hidden">
        <nav className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-5 border-b border-[#0b2116]/15 bg-[#f1eadf]/90 px-5 py-4 backdrop-blur-md sm:px-9" aria-label="Navegación de la secuencia">
          <div className="flex items-center gap-2 text-lg font-black">{brand}</div>
          <div className="hidden items-center gap-6 text-sm font-semibold md:flex">
            {navLinks.map((link) => <a key={link.label} href={link.href} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{link.label}</a>)}
          </div>
          {ctaLabel ? <a href={ctaHref} className="rounded-full bg-[#0b2116] px-5 py-2.5 text-sm font-bold text-[#fffdf6] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#ad8a49]">{ctaLabel}</a> : null}
        </nav>

        <img src={framePath(currentFrame + 1)} alt="Secuencia visual de preparación MATCHO" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#f1eadf]/80 via-transparent to-[#0b2116]/35" />

        <div className={`absolute inset-x-5 top-[15%] z-10 text-center transition-opacity duration-300 sm:inset-x-10 ${progress > 0.08 ? "opacity-0" : "opacity-100"}`}>
          <h2 className="text-[clamp(3rem,10vw,8rem)] font-black leading-[0.84] tracking-[-0.04em] text-balance">{title}</h2>
          {subtitle ? <p className="mt-5 text-sm font-bold tracking-[0.16em] uppercase">{subtitle}</p> : null}
        </div>

        <div className="absolute inset-x-4 bottom-8 z-20 mx-auto max-w-lg sm:inset-x-auto sm:right-8 sm:bottom-10 sm:w-[390px]">
          {steps.map((step, index) => (
            <article
              key={`${step.num}-${step.title}`}
              className={`absolute inset-x-0 bottom-0 overflow-hidden rounded-2xl border border-white/20 bg-[#0b2116]/92 p-6 text-[#fffdf6] shadow-[0_24px_80px_-28px_rgba(0,0,0,.8)] backdrop-blur-md transition-[opacity,transform,visibility] duration-500 ${activeStep === index ? "visible translate-y-0 opacity-100" : index < activeStep ? "invisible -translate-y-8 opacity-0" : "invisible translate-y-8 opacity-0"}`}
              style={{ "--step-color": step.color } as React.CSSProperties}
              aria-hidden={activeStep !== index}
            >
              <div className="flex items-center justify-between text-xs font-bold tracking-[0.14em] uppercase">
                <span><strong>{step.num}</strong> / {step.total}</span>
                <span className="grid size-9 place-items-center rounded-full" style={{ backgroundColor: step.color, color: "#0b2116" }}>{step.icon ?? <Leaf className="size-4" />}</span>
              </div>
              <h3 className="mt-8 text-3xl font-bold tracking-[-0.035em]">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#d8ded9]">{step.description}</p>
              <div className="mt-7 flex items-end justify-between gap-6">
                <div className="flex flex-1 gap-1">{steps.map((_, itemIndex) => <i key={itemIndex} className="h-1 flex-1 overflow-hidden bg-white/20"><span className="block h-full origin-left" style={{ backgroundColor: step.color, transform: `scaleX(${itemIndex < activeStep ? 1 : itemIndex === activeStep ? stepProgress : 0})` }} /></i>)}</div>
                <span className="text-xs font-bold uppercase" style={{ color: step.color }}>{step.label}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-30 h-1 bg-black/15"><span className="block h-full origin-left bg-[#ad8a49]" style={{ transform: `scaleX(${progress})` }} /></div>
      </section>
    </div>
  );
}

export default FrameSequenceHero;
