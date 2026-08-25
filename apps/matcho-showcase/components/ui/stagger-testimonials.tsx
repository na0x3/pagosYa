"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Testimonial {
  id: string | number;
  testimonial: string;
  by: string;
  imgSrc: string;
}

export interface StaggerTestimonialsProps {
  testimonials: Testimonial[];
  className?: string;
  label?: string;
}

export function StaggerTestimonials({ testimonials, className, label = "Reseñas de clientes" }: StaggerTestimonialsProps) {
  const [selected, setSelected] = React.useState(0);
  const [cardSize, setCardSize] = React.useState(365);

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setCardSize(media.matches ? 365 : 290);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (!testimonials.length) return null;
  const move = (steps: number) => setSelected((current) => (current + steps + testimonials.length) % testimonials.length);

  return (
    <section
      className={cn("relative w-full overflow-hidden bg-muted/30", className)}
      style={{ height: 600 }}
      aria-label={label}
      aria-roledescription="carousel"
    >
      {testimonials.map((testimonial, index) => {
        let position = index - selected;
        if (position > testimonials.length / 2) position -= testimonials.length;
        if (position < -testimonials.length / 2) position += testimonials.length;
        const center = position === 0;
        return (
          <article
            key={testimonial.id}
            aria-hidden={!center}
            className={cn(
              "absolute left-1/2 top-1/2 border-2 p-8 transition-[transform,opacity,background-color,color,border-color] duration-500 [transition-timing-function:cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none",
              center ? "z-10 border-primary bg-primary text-primary-foreground" : "z-0 border-border bg-card text-card-foreground opacity-60 hover:border-primary/50",
            )}
            style={{
              width: cardSize,
              height: cardSize,
              clipPath: "polygon(50px 0%, calc(100% - 50px) 0%, 100% 50px, 100% 100%, calc(100% - 50px) 100%, 50px 100%, 0 100%, 0 0)",
              transform: `translate(-50%,-50%) translateX(${(cardSize / 1.5) * position}px) translateY(${center ? -65 : position % 2 ? 15 : -15}px) rotate(${center ? 0 : position % 2 ? 2.5 : -2.5}deg)`,
            }}
          >
            <button
              type="button"
              tabIndex={center ? 0 : -1}
              onClick={() => move(position)}
              className="absolute inset-0 z-20 cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-label={center ? `Reseña actual de ${testimonial.by}` : `Mostrar reseña de ${testimonial.by}`}
            />
            <div className="pointer-events-none">
              <img src={testimonial.imgSrc} alt={testimonial.by.split(",")[0]} className="mb-4 h-14 w-12 bg-muted object-cover object-top" />
              <blockquote className="text-base font-medium sm:text-xl">“{testimonial.testimonial}”</blockquote>
              <p className="absolute bottom-8 left-8 right-8 mt-2 text-sm italic opacity-80">— {testimonial.by}</p>
            </div>
          </article>
        );
      })}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        <button type="button" onClick={() => move(-1)} className="flex size-14 items-center justify-center border-2 border-border bg-background transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Reseña anterior"><ChevronLeft /></button>
        <button type="button" onClick={() => move(1)} className="flex size-14 items-center justify-center border-2 border-border bg-background transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Reseña siguiente"><ChevronRight /></button>
      </div>
    </section>
  );
}
