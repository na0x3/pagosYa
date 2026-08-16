"use client";
import { CoverflowCarousel } from "@/components/ui/coverflow-carousel";

const slides = ["matcha-green.jpg", "matcha-strawberry.jpg", "matcha-black.jpg", "gallery-1.jpg", "gallery-2.png"].map((image, index) => ({ src: `/matcho/${image}`, alt: `MATCHO detalle ${index + 1}`, title: ["Green", "Strawberry", "Black", "Preparado al momento", "Universo MATCHO"][index] }));
export default function CoverflowCarouselDemo() { return <CoverflowCarousel slides={slides} showCaption showNavigation showPagination />; }
