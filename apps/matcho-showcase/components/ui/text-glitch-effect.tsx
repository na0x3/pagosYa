"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

import { cn } from "@/lib/utils";

export interface TextGlitchProps { text: string; hoverText?: string; href?: string; className?: string; delay?: number }

export function TextGlitch({ text, hoverText, href, className, delay = 0 }: TextGlitchProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hoverCopy, setHoverCopy] = useState(hoverText || text);
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    const tween = gsap.fromTo(heading, { opacity: .7, transform: "scale(.95)" }, { opacity: 1, transform: "scale(1)", duration: .6, delay, ease: "back.out(1.7)" });
    return () => { tween.kill(); };
  }, [delay]);
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);
  const enter = () => {
    if (!hoverText || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    let progress = 0;
    intervalRef.current = setInterval(() => {
      setHoverCopy(Array.from(hoverText).map((letter, index) => index < progress || /\s/.test(letter) ? letter : "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join(""));
      progress += .5;
      if (progress >= Array.from(hoverText).length && intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; setHoverCopy(hoverText); }
    }, 30);
  };
  const leave = () => { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; setHoverCopy(hoverText || text); };
  const visual = <span onMouseEnter={enter} onMouseLeave={leave} className="group relative flex w-full flex-col justify-center overflow-hidden"><span>{text}</span><span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden bg-accent text-accent-foreground [clip-path:inset(50%_0)] transition-[clip-path] duration-500 ease-[cubic-bezier(.77,0,.175,1)] group-hover:[clip-path:inset(0)] group-focus-visible:[clip-path:inset(0)]">{hoverCopy}</span></span>;
  return <h1 ref={headingRef} className={cn("m-0 w-full cursor-default overflow-hidden border-b border-current/20 text-[clamp(3rem,10vw,9rem)] font-bold leading-none tracking-[-0.04em] text-foreground/20", className)}>{href ? <a href={href} target="_blank" rel="noreferrer" className="block text-inherit no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring">{visual}</a> : visual}</h1>;
}
