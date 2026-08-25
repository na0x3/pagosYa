"use client";

import * as React from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

export interface ScrollExpandMediaProps {
  mediaType?: "video" | "image";
  mediaSrc: string;
  posterSrc?: string;
  bgImageSrc: string;
  title?: string;
  date?: string;
  scrollToExpand?: string;
  textBlend?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export default function ScrollExpandMedia({
  mediaType = "video",
  mediaSrc,
  posterSrc,
  bgImageSrc,
  title = "",
  date,
  scrollToExpand,
  textBlend = false,
  children,
  className,
}: ScrollExpandMediaProps) {
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const mediaTransform = useTransform(
    scrollYProgress,
    [0, 1],
    reduced ? ["translate(-50%,-50%) scale(1)", "translate(-50%,-50%) scale(1)"] : ["translate(-50%,-50%) scale(.36)", "translate(-50%,-50%) scale(1)"],
  );
  const backdropOpacity = useTransform(scrollYProgress, [0, 0.85], reduced ? [0, 0] : [1, 0]);
  const contentOpacity = useTransform(scrollYProgress, [0.72, 1], [0, 1]);
  const copyDistance = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, 140]);
  const leftCopyDistance = useTransform(copyDistance, (value) => -value);
  const firstWord = title.split(" ")[0] ?? "";
  const restOfTitle = title.split(" ").slice(1).join(" ");

  return (
    <div ref={sectionRef} className={cn("relative h-[180svh] overflow-clip motion-reduce:h-auto", className)}>
      <div className="sticky top-0 min-h-svh overflow-hidden bg-black text-white motion-reduce:relative">
        <motion.div className="absolute inset-0" style={{ opacity: backdropOpacity }} aria-hidden>
          <Image src={bgImageSrc} alt="" fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-black/20" />
        </motion.div>

        <motion.div
          className="absolute left-1/2 top-1/2 h-[82svh] w-[94vw] overflow-hidden rounded-2xl shadow-2xl"
          style={{ transform: mediaTransform }}
        >
          {mediaType === "video" ? (
            <video src={mediaSrc} poster={posterSrc} autoPlay={!reduced} muted loop playsInline preload="metadata" className="size-full object-cover" disablePictureInPicture />
          ) : (
            <Image src={mediaSrc} alt={title || "Contenido visual"} fill className="object-cover" sizes="94vw" />
          )}
          <div className="absolute inset-0 bg-black/25" />
        </motion.div>

        <div className={cn("absolute inset-0 z-10 flex items-center justify-center gap-4 text-center", textBlend && "mix-blend-difference")}>
          <motion.h2 className="text-4xl font-bold tracking-tight md:text-6xl" style={{ translateX: leftCopyDistance }}>{firstWord}</motion.h2>
          <motion.h2 className="text-4xl font-bold tracking-tight md:text-6xl" style={{ translateX: copyDistance }}>{restOfTitle}</motion.h2>
        </div>

        <motion.div className="absolute inset-x-0 bottom-8 z-20 flex flex-col items-center gap-1 px-6 text-center" style={{ opacity: contentOpacity }}>
          {date ? <p className="text-sm font-semibold">{date}</p> : null}
          {scrollToExpand ? <p className="text-sm opacity-80">{scrollToExpand}</p> : null}
          {children ? <div className="mt-5 max-w-3xl">{children}</div> : null}
        </motion.div>
      </div>
    </div>
  );
}
