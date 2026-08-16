"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface CardItem { id: string | number; url: string; title: string; }
export interface DiagonalMarqueeCarouselProps { cards?: CardItem[]; angle?: number; baseSpeed?: number; alternateDirections?: boolean; className?: string; cardClassName?: string; fadeClassName?: string; }

const DEFAULT_CARDS: CardItem[] = [
  { id: 1, url: "/matcho/matcha-green.jpg", title: "Matcha Green" },
  { id: 2, url: "/matcho/matcha-strawberry.jpg", title: "Matcha Strawberry" },
  { id: 3, url: "/matcho/matcha-black.jpg", title: "Matcha Black" },
  { id: 4, url: "/matcho/gallery-1.jpg", title: "Preparado al momento" },
  { id: 5, url: "/matcho/gallery-2.png", title: "Universo MATCHO" },
];

function Card({ card, className }: { card: CardItem; className?: string }) {
  return <figure className={cn("group relative h-[300px] w-[400px] shrink-0 overflow-hidden rounded-xl border border-white/25 shadow-2xl", className)}><img src={card.url} alt={card.title} className="h-full w-full object-cover" /><figcaption className="absolute inset-x-0 bottom-0 bg-black/55 px-5 py-4 text-sm font-bold text-white backdrop-blur-sm">{card.title}</figcaption></figure>;
}

function MarqueeRow({ cards, speed, direction, cardClassName }: { cards: CardItem[]; speed: number; direction: 1 | -1; cardClassName?: string }) {
  return <div className="flex w-full overflow-hidden"><div className={cn("flex shrink-0 hover:[animation-play-state:paused]", direction === -1 ? "animate-marquee-left" : "animate-marquee-right")} style={{ "--speed": `${speed}s` } as React.CSSProperties}>{[0, 1].map((copy) => <div className="flex shrink-0" key={copy}>{cards.map((card, index) => <div key={`${card.id}-${copy}-${index}`} className="shrink-0 pr-8"><Card card={card} className={cardClassName} /></div>)}</div>)}</div></div>;
}

export default function DiagonalMarqueeCarousel({ cards = DEFAULT_CARDS, angle = -18, baseSpeed = 120, alternateDirections = true, className, cardClassName, fadeClassName }: DiagonalMarqueeCarouselProps) {
  const rowCards = [...cards, ...cards, ...cards];
  const reversed = [...rowCards].reverse();
  return <div className={cn("relative flex h-screen w-full items-center justify-center overflow-hidden", className)}>
    <style>{`@keyframes marquee-left{to{transform:translate3d(-50%,0,0)}}@keyframes marquee-right{from{transform:translate3d(-50%,0,0)}to{transform:translate3d(0,0,0)}}.animate-marquee-left{animation:marquee-left var(--speed) linear infinite}.animate-marquee-right{animation:marquee-right var(--speed) linear infinite}@media(prefers-reduced-motion:reduce){.animate-marquee-left,.animate-marquee-right{animation-play-state:paused!important}}`}</style>
    <div className="absolute z-0 flex w-[200vw] flex-col gap-8" style={{ transform: `rotate(${angle}deg)` }}>
      <MarqueeRow cards={rowCards} speed={baseSpeed} direction={-1} cardClassName={cardClassName} />
      <MarqueeRow cards={reversed} speed={Math.max(30, baseSpeed - 15)} direction={alternateDirections ? 1 : -1} cardClassName={cardClassName} />
      <MarqueeRow cards={rowCards} speed={baseSpeed + 15} direction={-1} cardClassName={cardClassName} />
      <MarqueeRow cards={reversed} speed={Math.max(35, baseSpeed - 6)} direction={alternateDirections ? 1 : -1} cardClassName={cardClassName} />
      <MarqueeRow cards={rowCards} speed={baseSpeed + 24} direction={-1} cardClassName={cardClassName} />
    </div>
    <div className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 h-1/4 bg-gradient-to-b from-[#e5dfd4] to-transparent", fadeClassName)} /><div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/4 bg-gradient-to-t from-[#e5dfd4] to-transparent", fadeClassName)} />
  </div>;
}
