"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export type FullScreenSection = {
  id?: string;
  background: string;
  leftLabel?: ReactNode;
  title: ReactNode;
  rightLabel?: ReactNode;
};

export type FullScreenFXAPI = {
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  getIndex: () => number;
  refresh: () => void;
};

export type FullScreenFXProps = {
  sections: FullScreenSection[];
  className?: string;
  style?: CSSProperties;
  header?: ReactNode;
  footer?: ReactNode;
  showProgress?: boolean;
  reduceMotion?: boolean;
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  initialIndex?: number;
  apiRef?: React.Ref<FullScreenFXAPI>;
  ariaLabel?: string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const FullScreenScrollFX = forwardRef<HTMLDivElement, FullScreenFXProps>(
  (
    {
      sections,
      className = "",
      style,
      header,
      footer,
      showProgress = true,
      reduceMotion,
      currentIndex,
      onIndexChange,
      initialIndex = 0,
      apiRef,
      ariaLabel = "Relato visual por secciones",
    },
    forwardedRef,
  ) => {
    const total = Math.max(1, sections.length);
    const rootRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const backgroundRefs = useRef<(HTMLDivElement | null)[]>([]);
    const titleRefs = useRef<(HTMLDivElement | null)[]>([]);
    const leftTrackRef = useRef<HTMLDivElement>(null);
    const rightTrackRef = useRef<HTMLDivElement>(null);
    const [internalIndex, setInternalIndex] = useState(clamp(initialIndex, 0, total - 1));
    const index = currentIndex === undefined ? internalIndex : clamp(currentIndex, 0, total - 1);
    const indexRef = useRef(index);
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionOff = reduceMotion ?? prefersReduced;

    const setIndex = (next: number) => {
      const value = clamp(next, 0, total - 1);
      if (value === indexRef.current) return;
      indexRef.current = value;
      if (currentIndex === undefined) setInternalIndex(value);
      onIndexChange?.(value);
    };

    const goTo = (next: number) => {
      const root = scrollRef.current;
      if (!root) return;
      const value = clamp(next, 0, total - 1);
      const top = window.scrollY + root.getBoundingClientRect().top;
      const distance = Math.max(0, root.offsetHeight - window.innerHeight);
      window.scrollTo({
        top: top + (value / Math.max(1, total - 1)) * distance,
        behavior: motionOff ? "auto" : "smooth",
      });
      setIndex(value);
    };

    useImperativeHandle(apiRef, () => ({
      next: () => goTo(indexRef.current + 1),
      prev: () => goTo(indexRef.current - 1),
      goTo,
      getIndex: () => indexRef.current,
      refresh: () => ScrollTrigger.refresh(),
    }));

    useLayoutEffect(() => {
      const root = rootRef.current;
      const scroll = scrollRef.current;
      if (!root || !scroll || sections.length === 0) return;

      const context = gsap.context(() => {
        gsap.set(backgroundRefs.current, { opacity: 0, scale: 1.035 });
        gsap.set(backgroundRefs.current[indexRef.current], { opacity: 1, scale: 1 });
        gsap.set(titleRefs.current, { opacity: 0, yPercent: 45 });
        gsap.set(titleRefs.current[indexRef.current], { opacity: 1, yPercent: 0 });

        ScrollTrigger.create({
          trigger: scroll,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            const next = clamp(Math.round(self.progress * (total - 1)), 0, total - 1);
            setIndex(next);
          },
        });
      }, root);

      return () => context.revert();
      // Set-up is tied to section count; visual changes are handled below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sections.length, total]);

    useEffect(() => {
      indexRef.current = index;
      const duration = motionOff ? 0 : 0.62;
      backgroundRefs.current.forEach((element, itemIndex) => {
        if (!element) return;
        gsap.to(element, {
          opacity: itemIndex === index ? 1 : 0,
          scale: itemIndex === index ? 1 : 1.035,
          duration,
          ease: "power3.out",
          overwrite: "auto",
        });
      });
      titleRefs.current.forEach((element, itemIndex) => {
        if (!element) return;
        const active = itemIndex === index;
        gsap.to(element, {
          opacity: active ? 1 : 0,
          yPercent: active ? 0 : itemIndex < index ? -45 : 45,
          duration: motionOff ? 0 : active ? 0.58 : 0.28,
          ease: "power3.out",
          overwrite: "auto",
        });
      });
      const row = 50;
      gsap.to([leftTrackRef.current, rightTrackRef.current], {
        y: -index * row,
        duration,
        ease: "power3.out",
        overwrite: "auto",
      });
    }, [index, motionOff]);

    return (
      <div
        ref={(node) => {
          rootRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        className={`w-full bg-[#f3eee5] ${className}`}
        style={style}
        aria-label={ariaLabel}
      >
        <div ref={scrollRef} className="relative" style={{ height: `${Math.max(2, total + 1) * 100}vh` }}>
          <section className="sticky top-0 h-screen overflow-hidden bg-[#0b2116] text-[#fffdf6]">
            <div className="absolute inset-0" aria-hidden="true">
              {sections.map((section, itemIndex) => (
                <div
                  key={section.id ?? itemIndex}
                  ref={(node) => { backgroundRefs.current[itemIndex] = node; }}
                  className="absolute inset-0"
                >
                  <img src={section.background} alt="" className="h-full w-full object-cover brightness-[0.58]" />
                  <div className="absolute inset-0 bg-[#07140d]/25" />
                </div>
              ))}
            </div>

            <div className="relative z-10 grid h-full grid-rows-[auto_1fr_auto] px-5 py-7 sm:px-10 sm:py-10">
              <div className="text-center text-[clamp(2rem,7vw,6rem)] font-black leading-[0.84] tracking-[-0.04em]">{header}</div>

              <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 sm:gap-8">
                <div className="h-[50px] overflow-hidden text-left" aria-label="Capítulos anteriores y siguientes">
                  <div ref={leftTrackRef}>
                    {sections.map((section, itemIndex) => (
                      <button
                        key={`left-${section.id ?? itemIndex}`}
                        type="button"
                        onClick={() => goTo(itemIndex)}
                        className={`block h-[50px] w-full border-0 bg-transparent p-0 text-left text-xs font-bold uppercase transition-opacity duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-lg ${itemIndex === index ? "opacity-100" : "opacity-35"}`}
                        aria-current={itemIndex === index ? "step" : undefined}
                      >
                        {section.leftLabel}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative grid min-h-48 place-items-center overflow-hidden text-center">
                  {sections.map((section, itemIndex) => (
                    <div
                      key={`title-${section.id ?? itemIndex}`}
                      ref={(node) => { titleRefs.current[itemIndex] = node; }}
                      className="absolute inset-x-0 text-[clamp(2rem,7vw,6rem)] font-black leading-[0.9] tracking-[-0.04em] text-balance"
                      aria-hidden={itemIndex !== index}
                    >
                      {section.title}
                    </div>
                  ))}
                </div>

                <div className="h-[50px] overflow-hidden text-right">
                  <div ref={rightTrackRef}>
                    {sections.map((section, itemIndex) => (
                      <button
                        key={`right-${section.id ?? itemIndex}`}
                        type="button"
                        onClick={() => goTo(itemIndex)}
                        className={`block h-[50px] w-full border-0 bg-transparent p-0 text-right text-xs font-bold uppercase transition-opacity duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-lg ${itemIndex === index ? "opacity-100" : "opacity-35"}`}
                        aria-current={itemIndex === index ? "step" : undefined}
                      >
                        {section.rightLabel}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mx-auto w-full max-w-xs text-center">
                {footer}
                {showProgress ? (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-bold tabular-nums">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>{String(total).padStart(2, "0")}</span>
                    </div>
                    <div className="mt-2 h-px bg-white/35">
                      <div className="h-full origin-left bg-white transition-transform duration-300" style={{ transform: `scaleX(${(index + 1) / total})` }} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  },
);

FullScreenScrollFX.displayName = "FullScreenScrollFX";

export default FullScreenScrollFX;
