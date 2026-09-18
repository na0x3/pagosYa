"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { Dispatch, SetStateAction } from "react";
import { useRef, useState } from "react";

export interface Scroll01Item { title: string; description: string; media: string }
export interface Scroll01Props { items: Scroll01Item[] }

function ScrollItem({ item, index, setActive }: Readonly<{ item: Scroll01Item; index: number; setActive: Dispatch<SetStateAction<number>> }>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 90%", "end 15%"] });
  const y = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [20, -20]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], index === 0 ? [1, 0.7, 1, 0] : [0, 0.7, 1, 0]);
  const active = useTransform(scrollYProgress, (value) => value > 0.4 && value < 0.6);
  useMotionValueEvent(active, "change", (value) => value && setActive((previous) => previous === index ? previous : index));
  return <motion.article ref={ref} style={{ opacity: reduceMotion ? 1 : opacity, y }} className="text-center"><h3 className="mb-2 text-2xl font-semibold">{item.title}</h3><p className="text-muted-foreground">{item.description}</p></motion.article>;
}

export function Scroll01({ items }: Readonly<Scroll01Props>) {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <>
      <div className="space-y-10 md:hidden">{items.map((item, index) => <article key={`${item.title}-${index}`} className="space-y-4"><div><h3 className="text-2xl font-semibold">{item.title}</h3><p className="text-muted-foreground">{item.description}</p></div><img src={item.media} alt={item.title} className="h-72 w-full rounded-2xl object-cover" /></article>)}</div>
      <div className="hidden gap-10 md:grid md:grid-cols-2">
        <div className="sticky top-20 h-[70vh] overflow-hidden rounded-2xl">{items.map((item, index) => <motion.img key={`${item.title}-${index}`} src={item.media} alt={item.title} className="absolute inset-0 h-full w-full object-cover" initial={{ opacity: index === 0 ? 1 : 0 }} animate={{ opacity: activeIndex === index ? 1 : 0 }} transition={{ duration: 0.18, ease: "linear" }} />)}</div>
        <div className="py-[35vh]"><div className="space-y-[30vh]">{items.map((item, index) => <ScrollItem key={`${item.title}-${index}`} item={item} index={index} setActive={setActiveIndex} />)}</div></div>
      </div>
    </>
  );
}

export default Scroll01;
