"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useReducedMotion } from "framer-motion";

const MENU = [
  ["Origen verde", "COCHABAMBA, BO", "01"], ["Preparado al momento", "LA PAZ, BO", "02"], ["Texturas frías", "SANTA CRUZ, BO", "03"],
  ["Fresa natural", "SUCRE, BO", "04"], ["Matcha intenso", "TARIJA, BO", "05"], ["Ritual cotidiano", "ORURO, BO", "06"], ["Tu próximo MATCHO", "BOLIVIA", "07"],
];
const VIDEOS = Array.from({ length: 7 }, (_, index) => `/matcho/story-${String(index + 1).padStart(2, "0")}.mp4`);
const POSTERS = ["matcha-green.jpg", "matcha-strawberry.jpg", "matcha-black.jpg", "gallery-1.jpg", "gallery-2.png", "hero.png", "matcha-green.jpg"].map((image) => `/matcho/${image}`);

export function Component({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [mutedStates, setMutedStates] = useState(() => new Array(VIDEOS.length).fill(true));
  const outerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const itemHeight = 70;
  const reduceMotion = useReducedMotion();

  useEffect(() => { const timer = window.setTimeout(() => setIsReady(true), 2000); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    const onScroll = () => { const node = outerRef.current; if (!node) return; const { top, height } = node.getBoundingClientRect(); const distance = Math.max(1, height - window.innerHeight); const progress = Math.max(0, Math.min(1, -top / distance)); setActiveIndex(Math.round(progress * (MENU.length - 1))); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll(); return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { videoRefs.current.forEach((video, index) => { if (!video) return; if (reduceMotion) { video.pause(); video.currentTime = 0; return; } if (index === activeIndex) { video.muted = mutedStates[index] ?? true; video.play().catch(() => { video.muted = true; setMutedStates((current) => current.map((value, item) => item === index ? true : value)); }); } else { video.pause(); if (video.readyState >= 2) video.currentTime = 0; } }); }, [activeIndex, mutedStates, reduceMotion]);
  const goTo = (index: number) => { const node = outerRef.current; if (!node) return; const top = window.scrollY + node.getBoundingClientRect().top; window.scrollTo({ top: top + (index / (MENU.length - 1)) * (node.clientHeight - window.innerHeight), behavior: reduceMotion ? "auto" : "smooth" }); };

  return <div ref={outerRef} className={cn("relative my-12 w-full bg-[#e5dfd4]", reduceMotion ? "h-[160vh]" : "h-[400vh]", className)}>
    <style>{`.portfolio-mask{mask-image:linear-gradient(to bottom,black 0%,black 75%,transparent 100%)}.portfolio-video-mask{mask-image:linear-gradient(to bottom,transparent 0%,black 15%,black 85%,transparent 100%)}.video-track{--video-height:250px}@media(min-width:768px){.video-track{--video-height:380px}}@media(prefers-reduced-motion:reduce){.portfolio-smooth{transition-duration:0s!important}}`}</style>
    <section className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden p-4 font-sans md:p-10">
      <div className="relative flex h-[85vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-sm border border-[#bcc5bb] bg-[#ebebeb] shadow-2xl md:h-[750px] md:flex-row md:border-2">
        {!isReady && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#111]"><div className="px-6 text-center"><p className="text-[12px] tracking-[.4em] text-gray-400 uppercase">Preparando experiencia</p><p className="mt-4 font-serif text-4xl text-white italic">MATCHO en movimiento</p></div></div>}
        <div className="z-10 hidden w-14 shrink-0 flex-col items-center justify-between border-r border-[#d1d1d1] bg-[#f4f4f4] py-10 md:flex"><div className="text-sm tracking-[.3em] text-gray-500 uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Est. 2026</div><div className="text-sm tracking-[.3em] text-gray-800 uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>MATCHO Studio</div></div>
        <div className="z-10 flex h-1/2 w-full flex-col justify-end border-b border-[#d1d1d1] bg-[#f4f4f4] px-6 pb-[10%] md:h-full md:flex-1 md:border-b-0 md:px-16">
          <div className="portfolio-mask relative h-[250px] w-full overflow-hidden md:h-[350px]"><ul className="portfolio-smooth absolute left-0 w-full transition-transform duration-700 ease-[cubic-bezier(.25,1,.5,1)]" style={{ top: "50%", marginTop: `-${itemHeight / 2}px`, transform: `translateY(-${activeIndex * itemHeight}px)` }}>{MENU.map((item, index) => <li key={item[2]} style={{ height: itemHeight }} className={cn("flex w-full origin-left items-center transition-all duration-500", index === activeIndex ? "scale-100 opacity-100" : index < activeIndex ? "pointer-events-none scale-95 opacity-0" : "scale-[.98] opacity-30 hover:opacity-55")}><button type="button" onClick={() => goTo(index)} disabled={index < activeIndex} className={cn("w-full cursor-pointer border-0 bg-transparent p-0 text-left font-serif text-[22px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black sm:text-[28px] md:text-[38px]", index === activeIndex ? "text-black italic" : "text-gray-500")}>{item[0]}</button></li>)}</ul></div>
        </div>
          <div className="portfolio-video-mask video-track relative z-0 h-1/2 w-full overflow-hidden bg-[#1a1a1a] md:h-full md:w-[45%] md:border-l md:border-[#d1d1d1]"><div className="portfolio-smooth absolute top-1/2 left-0 flex w-full flex-col transition-transform duration-700 ease-[cubic-bezier(.25,1,.5,1)]" style={{ marginTop: "calc(var(--video-height) / -2)", transform: `translateY(calc(-${activeIndex} * var(--video-height)))` }}>{VIDEOS.map((src, index) => <div key={`${src}-${index}`} className={cn("portfolio-smooth relative flex w-full shrink-0 items-center justify-center p-4 transition-all duration-700", index === activeIndex ? "z-10 scale-100 opacity-100" : "pointer-events-none z-0 scale-[.85] opacity-30 blur-[5px]")} style={{ height: "var(--video-height)" }}><div className="relative h-full w-full overflow-hidden rounded-sm bg-black shadow-2xl"><video ref={(node) => { videoRefs.current[index] = node; }} src={src} poster={POSTERS[index]} muted={mutedStates[index]} loop playsInline preload="metadata" onLoadedMetadata={() => setIsReady(true)} className="h-full w-full object-cover"><track kind="captions" src="/matcho/captions-es.vtt" srcLang="es" label="Español" default /></video>{index === activeIndex && <><span className="absolute top-4 left-4 text-xs tracking-[.2em] text-white/80 uppercase drop-shadow-md">{MENU[index][1]}</span>{!reduceMotion && <button type="button" onClick={() => setMutedStates((current) => current.map((value, item) => item === index ? !value : value))} className="absolute right-4 bottom-4 rounded-full border border-white/10 bg-black/50 p-2.5 text-white backdrop-blur-sm hover:bg-black/75" aria-label={mutedStates[index] ? "Activar sonido" : "Silenciar video"}>{mutedStates[index] ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>}</>}</div></div>)}</div></div>
      </div>
    </section>
  </div>;
}
