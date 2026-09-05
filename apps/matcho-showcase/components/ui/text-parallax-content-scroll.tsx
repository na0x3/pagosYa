"use client";

import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import type { ReactNode } from "react";
import { useRef } from "react";

const IMAGE_PADDING = 12;
const DEMO_IMAGE = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1800&q=85";

export function TextParallaxContent({ imgUrl, subheading, heading, children }: Readonly<{ imgUrl: string; subheading: string; heading: string; children?: ReactNode }>) {
  return <section style={{ paddingInline: IMAGE_PADDING }}><div className="relative h-[150vh]"><StickyImage imgUrl={imgUrl} /><OverlayCopy heading={heading} subheading={subheading} /></div>{children}</section>;
}

function StickyImage({ imgUrl }: Readonly<{ imgUrl: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["end end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [1, 0.86]);
  const opacity = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0.35, 0.35] : [0.15, 0.75]);
  return <motion.div ref={ref} style={{ backgroundImage: `url(${imgUrl})`, height: `calc(100vh - ${IMAGE_PADDING * 2}px)`, top: IMAGE_PADDING, scale }} className="sticky overflow-hidden rounded-3xl bg-cover bg-center"><motion.div className="absolute inset-0 bg-neutral-950" style={{ opacity }} /></motion.div>;
}

function OverlayCopy({ subheading, heading }: Readonly<{ subheading: string; heading: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [220, -220]);
  const opacity = useTransform(scrollYProgress, reduceMotion ? [0, 1] : [0.25, 0.5, 0.75], reduceMotion ? [1, 1] : [0, 1, 0]);
  return <motion.div ref={ref} style={{ y, opacity }} className="absolute inset-0 flex h-screen flex-col items-center justify-center text-white"><p className="mb-3 text-xl md:text-3xl">{subheading}</p><h2 className="text-center text-4xl font-bold md:text-7xl">{heading}</h2></motion.div>;
}

export function TextParallaxContentExample() {
  return (
    <div className="bg-white">
      <TextParallaxContent imgUrl={DEMO_IMAGE} subheading="Collaborate" heading="Built for all of us.">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-20 md:grid-cols-12">
          <h2 className="text-3xl font-bold md:col-span-4">A visual chapter with a clear next step.</h2>
          <div className="md:col-span-8">
            <p className="text-xl text-neutral-600 md:text-2xl">Pair the image with concise, editable copy that explains why it matters.</p>
            <button type="button" className="mt-8 inline-flex items-center gap-2 bg-neutral-900 px-7 py-4 text-white">
              Learn more <ArrowUpRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </TextParallaxContent>
    </div>
  );
}
