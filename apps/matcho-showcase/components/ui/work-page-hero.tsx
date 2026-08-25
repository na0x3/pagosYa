"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export interface TimezoneClock {
  tz: string;
  label: string;
}

export interface WorkPageHeroProps {
  videoSrc?: string;
  poster?: string;
  videoType?: "auto" | "video" | "iframe";
  topWord?: string;
  rightWord?: string;
  bottomWord?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
  showClocks?: boolean;
  clocks?: TimezoneClock[];
  scrollDistance?: string;
  className?: string;
}

const DEFAULT_CLOCKS: TimezoneClock[] = [
  { tz: "America/La_Paz", label: "LA PAZ" },
  { tz: "America/La_Paz", label: "COCHABAMBA" },
  { tz: "America/La_Paz", label: "SANTA CRUZ" },
];

function useLiveTime() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (tz: string) => {
    try {
      return new Intl.DateTimeFormat("es-BO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: tz,
        hour12: false,
      }).format(time);
    } catch {
      return "--:--:--";
    }
  };
}

export function WorkPageHero({
  videoSrc = "/matcho/story-01.mp4",
  poster = "/matcho/hero.png",
  videoType = "auto",
  topWord = "cultivando",
  rightWord = "tu",
  bottomWord = "pausa",
  accentColor = "#ad8a49",
  textColor = "#0b2116",
  backgroundColor = "#f3eee5",
  showClocks = true,
  clocks = DEFAULT_CLOCKS,
  scrollDistance = "+=150%",
  className = "",
}: WorkPageHeroProps) {
  const containerRef = useRef<HTMLElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const textGroupRef = useRef<HTMLDivElement>(null);
  const formatTime = useLiveTime();
  const isDirectVideo =
    videoType === "video" ||
    (videoType === "auto" && /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(videoSrc));

  useGSAP(
    () => {
      const container = containerRef.current;
      const video = videoWrapperRef.current;
      const copy = textGroupRef.current;
      if (!container || !video || !copy) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.set(video, { clipPath: "inset(18% 18% 18% 22% round 14px)" });
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: container,
            start: "top top",
            end: scrollDistance,
            scrub: 1,
            pin: true,
            anticipatePin: 1,
          },
        });
        timeline
          .to(video, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none" }, 0)
          .to(copy, { opacity: 0, scale: 1.06, filter: "blur(10px)", ease: "none" }, 0);
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(video, { clipPath: "inset(8% 5% round 14px)" });
        gsap.set(copy, { opacity: 1, scale: 1, filter: "none" });
      });
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [scrollDistance] },
  );

  return (
    <section
      ref={containerRef}
      className={`relative h-screen min-h-[540px] w-full overflow-hidden select-none ${className}`}
      style={{ backgroundColor }}
      aria-label="Historia MATCHO en video"
    >
      <div
        ref={textGroupRef}
        className="pointer-events-none absolute inset-0 z-30"
        style={{ willChange: "transform, opacity, filter" }}
      >
        <p
          className="absolute inset-x-0 top-[3%] m-0 text-center font-black leading-none tracking-[-0.04em]"
          style={{ color: accentColor, fontFamily: "Proto Matcho, monospace", fontSize: "clamp(3rem, 10vw, 9rem)" }}
        >
          {topWord}
        </p>
        <p
          className="absolute right-[4%] top-[40%] m-0 font-black leading-none tracking-[-0.04em]"
          style={{ color: textColor, fontFamily: "Proto Matcho, monospace", fontSize: "clamp(3rem, 10vw, 9rem)" }}
        >
          {rightWord}
        </p>
        <p
          className="absolute inset-x-0 bottom-[3%] m-0 text-center font-normal leading-none italic"
          style={{ color: accentColor, fontFamily: "Georgia, serif", fontSize: "clamp(4rem, 13vw, 11rem)" }}
        >
          {bottomWord}
        </p>

        {showClocks && clocks.length > 0 ? (
          <div className="absolute top-1/2 left-[clamp(1rem,4vw,4rem)] flex -translate-y-1/2 flex-col gap-2 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase sm:text-xs">
            {clocks.map(({ tz, label }) => (
              <div key={`${tz}-${label}`} className="flex items-center gap-3" style={{ color: accentColor }}>
                <time className="tabular-nums">{formatTime(tz)}</time>
                <span style={{ color: textColor }}>{label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={videoWrapperRef} className="absolute inset-0 z-20 overflow-hidden bg-[#0b2116]" style={{ willChange: "clip-path" }}>
        {isDirectVideo ? (
          <video src={videoSrc} poster={poster} autoPlay muted loop playsInline preload="metadata" className="h-full w-full object-cover">
            <track kind="captions" src="/matcho/captions-es.vtt" srcLang="es" label="Español" default />
          </video>
        ) : (
          <iframe
            src={videoSrc}
            title="Video de la historia MATCHO"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="block h-full w-full border-0"
          />
        )}
      </div>
    </section>
  );
}

export default WorkPageHero;
