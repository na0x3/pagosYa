"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { createElement, type ReactNode, type Ref, useRef } from "react";

import { observeWindowResize, waitForScrollerReady } from "@/components/ui/text-reveal-block-utils/scroll-trigger-utils";
import { usePrefersReducedMotion } from "@/components/ui/text-reveal-block-utils/use-prefers-reduced-motion";

if (typeof window !== "undefined") gsap.registerPlugin(SplitText, ScrollTrigger);
export type TextRevealBlockDirection = "down" | "left" | "right" | "up";
export interface TextRevealBlockProps {
  animateOnScroll?: boolean; as?: keyof React.JSX.IntrinsicElements; blockColor?: string; children?: ReactNode; className?: string;
  delay?: number; direction?: TextRevealBlockDirection; duration?: number; scroller?: Element | Window; scrollReadyEvent?: string; stagger?: number; text?: string;
}
const directions = {
  down: { axis: "scaleY", enter: "bottom center", exit: "top center" },
  left: { axis: "scaleX", enter: "left center", exit: "right center" },
  right: { axis: "scaleX", enter: "right center", exit: "left center" },
  up: { axis: "scaleY", enter: "top center", exit: "bottom center" },
} as const;
export function TextRevealBlock({ children, text, as: Component = "p", className, animateOnScroll = true, delay = 0, blockColor = "var(--foreground)", direction = "left", stagger = .15, duration = .75, scroller, scrollReadyEvent }: TextRevealBlockProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const resolved = children ?? (text ? createElement(Component, { className }, text) : null);
  useGSAP(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const resolvedScroller = scroller ?? window;
      await waitForScrollerReady(resolvedScroller, scrollReadyEvent);
      if (disposed || !containerRef.current) return;
      const target = containerRef.current;
      const splits: SplitText[] = [];
      const lines: Element[] = [];
      const blocks: HTMLSpanElement[] = [];
      const elements = target.dataset.textRevealWrapper ? Array.from(target.children) : [target];
      elements.forEach((element) => {
        const split = SplitText.create(element, { type: "lines", linesClass: "text-reveal-source-line++", lineThreshold: .1 });
        splits.push(split);
        split.lines.forEach((line) => {
          const parent = line.parentNode;
          if (!parent) return;
          const wrapper = document.createElement("span");
          wrapper.className = "relative block w-max max-w-full overflow-hidden";
          parent.insertBefore(wrapper, line);
          wrapper.appendChild(line);
          const block = document.createElement("span");
          block.className = "pointer-events-none absolute inset-0 z-10";
          block.style.backgroundColor = blockColor;
          wrapper.appendChild(block);
          lines.push(line);
          blocks.push(block);
        });
      });
      if (reduced) { gsap.set(lines, { opacity: 1 }); gsap.set(blocks, { display: "none" }); }
      else {
        const config = directions[direction];
        gsap.set(lines, { opacity: 0 });
        gsap.set(blocks, { [config.axis]: 0, transformOrigin: config.enter });
        blocks.forEach((block, index) => {
          const timeline = gsap.timeline({ paused: animateOnScroll, delay: delay + index * stagger })
            .to(block, { [config.axis]: 1, duration, ease: "power4.inOut" })
            .set(lines[index], { opacity: 1 })
            .set(block, { transformOrigin: config.exit })
            .to(block, { [config.axis]: 0, duration, ease: "power4.inOut" });
          if (animateOnScroll) ScrollTrigger.create({ trigger: target, scroller: resolvedScroller, start: "top 90%", once: true, animation: timeline, invalidateOnRefresh: true });
          else timeline.play();
        });
      }
      const unbindResize = observeWindowResize(() => ScrollTrigger.refresh());
      cleanup = () => { unbindResize(); ScrollTrigger.getAll().filter((trigger) => trigger.trigger === target).forEach((trigger) => trigger.kill()); splits.forEach((split) => split.revert()); };
    })();
    return () => { disposed = true; cleanup(); };
  }, { scope: containerRef, dependencies: [animateOnScroll, blockColor, delay, direction, duration, reduced, scroller, scrollReadyEvent, stagger] });
  if (!resolved) return null;
  return <div data-text-reveal-wrapper="true" ref={containerRef as Ref<HTMLDivElement>}>{resolved}</div>;
}

export default TextRevealBlock;
