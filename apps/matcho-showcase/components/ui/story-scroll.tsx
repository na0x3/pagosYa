"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

function cx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

export interface FlowSectionProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-label"?: string;
}

export function FlowSection({ className, style, children, "aria-label": ariaLabel }: FlowSectionProps) {
  return (
    <section data-flow-section aria-label={ariaLabel} className={cx("matcho-flow-section relative min-h-screen w-full overflow-hidden", className)}>
      <div
        data-flow-inner
        className="matcho-flow-inner relative flex min-h-screen w-full flex-col justify-between gap-6 px-[clamp(1.25rem,4vw,4rem)] py-[clamp(2rem,6vw,5rem)] will-change-transform"
        style={{ transformOrigin: "bottom left", ...style }}
      >
        {children}
      </div>
    </section>
  );
}

export interface FlowArtProps {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export default function FlowArt({ children, className, "aria-label": ariaLabel = "Historia en movimiento" }: FlowArtProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useGSAP(() => {
    if (!containerRef.current || reducedMotion) return;
    const sections = gsap.utils.toArray<HTMLElement>("[data-flow-section]", containerRef.current);
    sections.forEach((section, index) => {
      gsap.set(section, { zIndex: index + 1 });
      const inner = section.querySelector<HTMLElement>("[data-flow-inner]");
      if (!inner) return;
      if (index > 0) {
        gsap.fromTo(inner, { rotation: 30 }, {
          rotation: 0,
          ease: "none",
          scrollTrigger: { trigger: section, start: "top bottom", end: "top 25%", scrub: true },
        });
      }
      if (index < sections.length - 1) {
        ScrollTrigger.create({ trigger: section, start: "bottom bottom", end: "bottom top", pin: true, pinSpacing: false });
      }
    });
    ScrollTrigger.refresh();
  }, { scope: containerRef, dependencies: [reducedMotion, children], revertOnUpdate: true });

  return <main ref={containerRef} aria-label={ariaLabel} className={cx("w-full overflow-x-hidden", className)}>{children}</main>;
}
