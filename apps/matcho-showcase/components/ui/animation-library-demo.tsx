"use client";

import AnimatedScroll from "@/components/ui/animated-scroll";
import { Carousel } from "@/components/ui/carousel";
import { DraggableCardBody, DraggableCardContainer } from "@/components/ui/draggable-card";
import GalleryModalAccordion from "@/components/ui/gallery-modal-accordion";
import HeroScrollVideoReveal from "@/components/ui/hero-scroll-video-pin-reveal";
import { LinkPreview } from "@/components/ui/link-preview";
import { Scroll01 } from "@/components/ui/scroll-01";
import StickyScroll from "@/components/ui/sticky-scroll";
import { TextParallaxContentExample } from "@/components/ui/text-parallax-content-scroll";

export const demoImages = [
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1600&q=85",
];

export function DraggableCardDemo() {
  return <DraggableCardContainer className="relative flex min-h-[42rem] items-center justify-center overflow-hidden">{demoImages.slice(0, 3).map((src, index) => <DraggableCardBody key={src} className={["absolute -translate-x-32 -rotate-6", "absolute translate-y-10 rotate-3", "absolute translate-x-36 -rotate-2"][index]}><img src={src} alt={`Landscape ${index + 1}`} className="pointer-events-none h-72 w-full object-cover" /><h3 className="mt-4 text-xl font-bold">Scene {index + 1}</h3></DraggableCardBody>)}</DraggableCardContainer>;
}

export function CarouselDemo() {
  return <div className="min-h-[52rem] py-16"><Carousel slides={demoImages.map((src, index) => ({ id: String(index), title: `Visual chapter ${index + 1}`, button: "Explore", src }))} /></div>;
}

export function LinkPreviewDemo() {
  return <p className="mx-auto max-w-3xl py-32 text-3xl text-neutral-600">Explore a <LinkPreview isStatic imageSrc={demoImages[0]} url="https://example.com" className="font-bold text-black">live visual preview</LinkPreview> without leaving the story.</p>;
}

export function GalleryAccordionDemo() {
  return <GalleryModalAccordion items={demoImages.map((url, index) => ({ id: index, url, title: `Landscape ${index + 1}`, description: "An editable image chapter." }))} />;
}

export function AnimatedScrollDemo() {
  return <AnimatedScroll pages={demoImages.map((image, index) => ({ id: String(index), heading: `Chapter ${index + 1}`, description: "Use the wheel or arrow keys.", contentSide: index % 2 ? "left" : "right", [index % 2 ? "rightImage" : "leftImage"]: image }))} />;
}

export function StickyScrollDemo() {
  return <StickyScroll items={demoImages.concat(demoImages).map((src, index) => ({ id: String(index), src, alt: `Gallery scene ${index + 1}` }))} />;
}

export function StickyStoryDemo() {
  return <div className="mx-auto max-w-5xl px-5"><Scroll01 items={demoImages.map((media, index) => ({ title: `Story ${index + 1}`, description: "Editable copy stays paired with its media.", media }))} /></div>;
}

export { HeroScrollVideoReveal, TextParallaxContentExample };
