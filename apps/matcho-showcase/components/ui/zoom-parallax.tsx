"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

interface ParallaxImage {
  src: string;
  alt?: string;
}

interface ZoomParallaxProps {
  /** Up to seven images, displayed as one scroll-composed scene. */
  images: ParallaxImage[];
}

const scales = [4, 5, 6, 5, 6, 8, 9];

function ParallaxLayer({ image, index, progress, reduceMotion }: {
  image: ParallaxImage;
  index: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  reduceMotion: boolean | null;
}) {
  const transform = useTransform(progress, [0, 1], ["scale(1)", `scale(${scales[index]})`]);
  return (
    <motion.div style={{ transform: reduceMotion ? "none" : transform }} className={`matcho-zoom-layer matcho-zoom-layer-${index} absolute inset-0 flex items-center justify-center`}>
      <figure><img src={image.src} alt={image.alt || `Escena MATCHO ${index + 1}`} /></figure>
    </motion.div>
  );
}

export function ZoomParallax({ images }: ZoomParallaxProps) {
  const container = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: container, offset: ["start start", "end end"] });

  return (
    <div ref={container} className="matcho-zoom relative h-[300vh]" aria-label="Galería Zoom Parallax">
      <div className="matcho-zoom-sticky sticky top-0 h-screen overflow-hidden">
        {images.slice(0, 7).map((image, index) => <ParallaxLayer key={`${image.src}-${index}`} image={image} index={index} progress={scrollYProgress} reduceMotion={reduceMotion} />)}
      </div>
    </div>
  );
}
