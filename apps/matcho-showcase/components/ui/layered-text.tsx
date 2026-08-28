"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

import { cn } from "@/lib/utils";

export interface LayeredTextProps {
  lines?: Array<{ top: string; bottom: string }>;
  fontSize?: string;
  fontSizeMd?: string;
  lineHeight?: number;
  lineHeightMd?: number;
  className?: string;
}

export function LayeredText({
  lines = [
    { top: "\u00a0", bottom: "INFINITE" },
    { top: "INFINITE", bottom: "PROGRESS" },
    { top: "PROGRESS", bottom: "INNOVATION" },
    { top: "INNOVATION", bottom: "FUTURE" },
    { top: "FUTURE", bottom: "DREAMS" },
    { top: "DREAMS", bottom: "ACHIEVEMENT" },
    { top: "ACHIEVEMENT", bottom: "\u00a0" },
  ],
  fontSize = "72px",
  fontSizeMd = "36px",
  lineHeight = 60,
  lineHeightMd = 35,
  className,
}: LayeredTextProps) {
  const containerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (reduced.matches || !finePointer.matches) return;
    const paragraphs = container.querySelectorAll("p");
    const timeline = gsap.timeline({ paused: true }).to(paragraphs, {
      transform: `translateY(-${window.innerWidth >= 768 ? lineHeight : lineHeightMd}px)`,
      duration: 0.6,
      ease: "power3.out",
      stagger: 0.06,
    });
    const enter = () => timeline.play();
    const leave = () => timeline.reverse();
    container.addEventListener("mouseenter", enter);
    container.addEventListener("mouseleave", leave);
    container.addEventListener("focusin", enter);
    container.addEventListener("focusout", leave);
    return () => {
      container.removeEventListener("mouseenter", enter);
      container.removeEventListener("mouseleave", leave);
      container.removeEventListener("focusin", enter);
      container.removeEventListener("focusout", leave);
      timeline.kill();
    };
  }, [lineHeight, lineHeightMd, lines]);

  const center = Math.floor(lines.length / 2);
  return (
    <button type="button" ref={containerRef} className={cn("mx-auto block cursor-default border-0 bg-transparent py-24 font-sans font-black uppercase tracking-[-0.04em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} aria-label="Cambiar el texto en capas">
      <ul className="m-0 flex list-none flex-col items-center p-0">
        {lines.map((line, index) => {
          const even = index % 2 === 0;
          return (
            <li
              key={`${line.top}-${line.bottom}-${index}`}
              className="relative overflow-hidden"
              style={{
                height: `clamp(${lineHeightMd}px, 5vw, ${lineHeight}px)`,
                transform: `translateX(clamp(${(index - center) * 20}px, ${(index - center) * 2.4}vw, ${(index - center) * 35}px)) skew(${even ? "60deg, -30deg" : "0deg, -30deg"}) scaleY(${even ? ".66667" : "1.33333"})`,
              }}
            >
              {[line.top, line.bottom].map((value, valueIndex) => (
                <p key={valueIndex} className="m-0 whitespace-nowrap px-4 align-top" style={{ height: `clamp(${lineHeightMd}px, 5vw, ${lineHeight}px)`, fontSize: `clamp(${fontSizeMd}, 7vw, ${fontSize})`, lineHeight: `clamp(${lineHeightMd - 4}px, 4.7vw, ${lineHeight - 5}px)` }}>{value}</p>
              ))}
            </li>
          );
        })}
      </ul>
    </button>
  );
}
