"use client";

import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

export interface CarouselSlide {
  id?: string;
  title: string;
  button: string;
  src: string;
}

export function Carousel({ slides }: Readonly<{ slides: CarouselSlide[] }>) {
  const [current, setCurrent] = useState(0);
  const headingId = useId();
  const move = (step: number) => setCurrent((value) => (value + step + slides.length) % slides.length);

  if (!slides.length) return null;

  return (
    <section
      aria-labelledby={headingId}
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}
      className="relative mx-auto h-[min(70vmin,44rem)] w-[min(70vmin,44rem)] outline-none"
    >
      <h2 id={headingId} className="sr-only">Image carousel</h2>
      <ul
        className="absolute flex h-full transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(-${current * (100 / slides.length)}%)` }}
      >
        {slides.map((slide, index) => {
          const active = current === index;
          return (
            <li
              key={slide.id ?? `${slide.title}-${index}`}
              aria-hidden={!active}
              className="h-full w-[min(70vmin,44rem)] shrink-0 px-2 [perspective:1200px]"
            >
              <button
                type="button"
                onClick={() => setCurrent(index)}
                tabIndex={active ? 0 : -1}
                className="group relative grid h-full w-full place-items-center overflow-hidden rounded-2xl text-center text-white"
                style={{ transform: active ? "scale(1) rotateX(0deg)" : "scale(.97) rotateX(7deg)" }}
              >
                <img src={slide.src} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none" />
                <span className="absolute inset-0 bg-black/35" />
                <span className="relative z-10 p-8">
                  <strong className="block text-3xl font-semibold md:text-5xl">{slide.title}</strong>
                  <span className="mx-auto mt-6 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-black">{slide.button}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="absolute top-[calc(100%+1rem)] flex w-full justify-center gap-3">
        {[-1, 1].map((step) => (
          <button key={step} type="button" onClick={() => move(step)} aria-label={step < 0 ? "Previous slide" : "Next slide"} className="grid size-11 place-items-center rounded-full bg-neutral-200 text-neutral-700 transition-transform hover:-translate-y-0.5 active:translate-y-0 dark:bg-neutral-800 dark:text-neutral-100 motion-reduce:transition-none">
            <ArrowRight className={step < 0 ? "rotate-180" : ""} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
