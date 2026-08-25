"use client";

import { useEffect, useRef } from "react";
import { Leaf, Play } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, SplitText);

export interface TagItem {
  id?: string;
  text: string;
  background: string;
  color?: string;
}

export interface HeroScrollVideoRevealProps {
  topText?: React.ReactNode;
  headingText?: React.ReactNode;
  tags?: TagItem[];
  subText?: string;
  videoSrc?: string;
  bottomText?: React.ReactNode;
  className?: string;
}

const DEFAULT_TAGS: TagItem[] = [
  { text: "Matcha real", background: "#ad8a49", color: "#0b2116" },
  { text: "Preparado en frío", background: "#f3eee5", color: "#0b2116" },
  { text: "Sin ceremonia", background: "#31523c", color: "#fffdf6" },
  { text: "Hecho al momento", background: "#a34853", color: "#fffdf6" },
];

export function HeroScrollVideoReveal({
  topText = <>Una pausa que empieza<br />mucho antes del primer sorbo.</>,
  headingText = <>La hoja encuentra el hielo.<br />El ritual encuentra tu ritmo.</>,
  tags = DEFAULT_TAGS,
  subText = "Desplázate para abrir la historia completa.",
  videoSrc = "/matcho/story-03.mp4",
  bottomText = <>El final del recorrido.<br />El inicio de tu MATCHO.</>,
  className = "",
}: HeroScrollVideoRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const benefitRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const videoBoxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tagRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    const headline = headlineRef.current;
    const benefit = benefitRef.current;
    const wrapper = videoWrapperRef.current;
    const box = videoBoxRef.current;
    if (!root || !headline || !benefit || !wrapper || !box) return;

    videoRef.current?.play().catch(() => {});
    const context = gsap.context(() => {
      const split = new SplitText(headline, { type: "words", wordsClass: "inline-block" });
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.set(split.words, { opacity: 0.18, yPercent: 32, rotate: 5, transformOrigin: "left bottom" });
        gsap.set(tagRefs.current, { opacity: 0, clipPath: "inset(0 100% 0 0 round 999px)" });
        const reveal = gsap.timeline({
          scrollTrigger: { trigger: benefit, start: "top 72%", end: "top 10%", scrub: 1 },
        });
        reveal
          .to(split.words, { opacity: 1, yPercent: 0, rotate: 0, stagger: 0.06, ease: "none" })
          .to(tagRefs.current, { opacity: 1, clipPath: "inset(0 0% 0 0 round 999px)", stagger: 0.08, ease: "none" }, "-=0.2");

        const sizes = [
          { query: "(max-width: 639px)", start: "circle(19% at 50% 50%)", distance: "+=1100" },
          { query: "(min-width: 640px) and (max-width: 1023px)", start: "circle(13% at 50% 50%)", distance: "+=1500" },
          { query: "(min-width: 1024px)", start: "circle(9% at 50% 50%)", distance: "+=1900" },
        ];
        sizes.forEach(({ query, start, distance }) => {
          mm.add(query, () => {
            gsap.set(box, { clipPath: start });
            gsap.to(box, {
              clipPath: "circle(150% at 50% 50%)",
              ease: "none",
              scrollTrigger: {
                trigger: wrapper,
                start: "top top",
                end: distance,
                scrub: 1,
                pin: true,
                pinSpacing: true,
                anticipatePin: 1,
              },
            });
          });
        });
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(split.words, { opacity: 1, yPercent: 0, rotate: 0 });
        gsap.set(tagRefs.current, { opacity: 1, clipPath: "none" });
        gsap.set(box, { clipPath: "inset(5% round 16px)" });
      });

      return () => {
        mm.revert();
        split.revert();
      };
    }, root);
    return () => context.revert();
  }, []);

  return (
    <div ref={rootRef} className={`w-full overflow-x-clip bg-[#0d0f0d] text-[#fffdf6] ${className}`}>
      <section className="grid min-h-screen place-items-center px-5 py-16 text-center">
        <h2 className="max-w-[15ch] text-[clamp(2rem,5vw,5.5rem)] font-bold leading-[0.98] tracking-[-0.04em] text-balance">{topText}</h2>
      </section>

      <section ref={benefitRef} className="relative min-h-[130vh] bg-[#0d0f0d] pb-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-5 py-20 text-center sm:px-8 md:py-28">
          <h2 ref={headlineRef} className="m-0 max-w-[16ch] text-[clamp(2.25rem,5.6vw,5.8rem)] font-extrabold leading-[0.96] tracking-[-0.04em] text-balance">
            {headingText}
          </h2>
          <ul className="mt-12 flex max-w-4xl flex-wrap justify-center gap-3" aria-label="Cualidades de la experiencia">
            {tags.map((tag, index) => (
              <li
                key={tag.id ?? tag.text}
                ref={(node) => { tagRefs.current[index] = node; }}
                className="rounded-full px-5 py-3 text-sm font-bold sm:px-7 sm:text-base"
                style={{ backgroundColor: tag.background, color: tag.color ?? "#fff" }}
              >
                {tag.text}
              </li>
            ))}
          </ul>
          {subText ? <p className="mt-8 max-w-xl text-base leading-7 text-[#c3c9c4]">{subText}</p> : null}
        </div>

        <div ref={videoWrapperRef} className="relative h-screen w-full bg-[#0d0f0d]">
          <div ref={videoBoxRef} className="relative h-full w-full overflow-hidden bg-[#173324]" style={{ willChange: "clip-path" }}>
            <video ref={videoRef} autoPlay muted loop playsInline preload="metadata" poster="/matcho/hero.png" className="h-full w-full object-cover">
              <source src={videoSrc} type="video/mp4" />
              <track kind="captions" src="/matcho/captions-es.vtt" srcLang="es" label="Español" default />
            </video>
            <div className="pointer-events-none absolute inset-0 bg-black/15" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/60 bg-[#0b2116]/55 text-white backdrop-blur-sm sm:size-28">
              <Leaf className="size-7 sm:size-9" aria-hidden="true" />
              <Play className="absolute size-4 translate-x-0.5 opacity-0" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-h-screen place-items-center px-5 py-16 text-center">
        <h2 className="max-w-[16ch] text-[clamp(2rem,5vw,5.5rem)] font-bold leading-[0.98] tracking-[-0.04em] text-balance">{bottomText}</h2>
      </section>
    </div>
  );
}

export default HeroScrollVideoReveal;
