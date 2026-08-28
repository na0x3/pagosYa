"use client";

import AnimatedPathText from "@/components/ui/text-along-path";
import { TextGlitch } from "@/components/ui/text-glitch-effect";
import { LayeredText } from "@/components/ui/layered-text";
import { TextRevealBlock } from "@/components/ui/text-reveal-block";
import { TextRotate } from "@/components/ui/text-rotate";

export function TextAnimationsDemo() {
  return <div className="bg-background text-foreground">
    <section className="grid min-h-[70vh] place-items-center overflow-hidden"><LayeredText className="text-primary"/></section>
    <section className="flex min-h-[50vh] items-center justify-center p-8 text-4xl md:text-7xl"><span className="flex flex-wrap items-center gap-3">Hazlo <TextRotate texts={["claro", "propio", "memorable"]} mainClassName="overflow-hidden bg-primary px-3 py-2 text-primary-foreground" staggerFrom="last" staggerDuration={.025}/></span></section>
    <section className="p-6 md:p-12"><TextGlitch text="TU HISTORIA" hoverText="TU MARCA"/></section>
    <section className="flex min-h-[55vh] items-center justify-center p-8"><TextRevealBlock as="h2" text="Cada línea llega con intención." className="max-w-3xl text-5xl font-semibold leading-tight tracking-[-.04em] md:text-7xl" blockColor="var(--primary)"/></section>
    <section className="h-[60vh] p-8"><AnimatedPathText path="M 20,50 C 160,0 340,100 480,50 S 800,0 980,50" viewBox="0 0 1000 100" text="PAGOSYA · TU TIENDA · TU HISTORIA · " textClassName="text-[28px] font-bold uppercase" duration={18} showPath/></section>
  </div>;
}
