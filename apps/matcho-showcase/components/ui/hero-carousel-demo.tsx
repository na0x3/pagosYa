"use client";

import { HeroCarousel, type HeroCarouselItem } from "@/components/ui/hero-carousel";

const ITEMS: HeroCarouselItem[] = [
  { id: "green", title: "Verde\ndesde el inicio", image: "/matcho/matcha-green.jpg", credit: "MATCHO", meta: ["FRÍO", "NATURAL"], accent: "#183524" },
  { id: "strawberry", title: "Fresa\ny pausa", image: "/matcho/matcha-strawberry.jpg", credit: "MATCHO", meta: ["FRUTA", "MATCHA"], accent: "#a34853" },
  { id: "black", title: "Una mezcla\nmás intensa", image: "/matcho/matcha-black.jpg", credit: "MATCHO", meta: ["BLACK", "SIN AZÚCAR"], accent: "#191919" },
  { id: "ritual", title: "Hecho\na tu ritmo", image: "/matcho/gallery-1.jpg", credit: "MATCHO", meta: ["HOY", "LA PAZ"], accent: "#ad8a49" },
];

export default function HeroCarouselDemo() {
  return <HeroCarousel items={ITEMS} defaultIndex={1} brand="MATCHO" className="h-[720px]" />;
}
