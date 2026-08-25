"use client";

import { BadgeCheck, HandHeart, Leaf, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const questions = [
  "¿Qué sabor va conmigo?",
  "¿Cómo se prepara?",
  "¿Tiene azúcar?",
  "¿Puedo pedirlo frío?",
  "¿Qué hace distinto al matcha?",
  "¿Dónde nace cada mezcla?",
  "¿Cuál es el favorito?",
  "¿Hay opciones intensas?",
  "¿Puedo elegir el tamaño?",
  "¿Se prepara al momento?",
  "¿Qué combina con fresa?",
  "¿Cuánto cuesta mi pausa?",
];

const features = [
  {
    description: "Una carta breve, palabras claras y decisiones que se entienden antes de agregar al carrito.",
    icon: Leaf,
    title: "La carta respira",
  },
  {
    description: "Cada imagen, precio y variante existe para acercarte al sabor, no para llenar espacio.",
    icon: Sparkles,
    title: "El producto manda",
  },
  {
    description: "El movimiento conecta origen, preparación y resultado sin esconder información importante.",
    icon: BadgeCheck,
    title: "La historia orienta",
  },
  {
    description: "La experiencia se vuelve estática y legible cuando el dispositivo o la persona lo necesita.",
    icon: HandHeart,
    title: "El ritmo se adapta",
  },
];

function MarqueeRow({ items, reverse = false, duration = "44s" }: { items: string[]; reverse?: boolean; duration?: string }) {
  const repeated = [...items, ...items];
  return (
    <div className="overflow-hidden py-1" aria-label={items.join(", ")}>
      <div
        className={cn("matcho-marquee-track flex w-max gap-3 motion-safe:animate-[marquee_var(--duration)_linear_infinite]", reverse && "[animation-direction:reverse]")}
        style={{ "--duration": duration } as React.CSSProperties}
      >
        {repeated.map((question, index) => (
          <span
            key={`${question}-${index}`}
            aria-hidden={index >= items.length}
            className="shrink-0 border border-[#c9bc79] bg-[#ede7b9] px-4 py-2 text-sm font-semibold text-[#0b2116]"
          >
            {question}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Component({ className }: { className?: string }) {
  const rowSize = Math.ceil(questions.length / 3);
  const rows = [questions.slice(0, rowSize), questions.slice(rowSize, rowSize * 2), questions.slice(rowSize * 2)];

  return (
    <section className={cn("relative overflow-hidden bg-[#f3f0cb] pt-24 text-[#0b2116] sm:pt-36", className)}>
      <div className="mx-auto flex max-w-5xl flex-col items-center px-5 text-center">
        <h2 className="max-w-[14ch] text-[clamp(2.5rem,6vw,5.8rem)] font-bold leading-[0.94] tracking-[-0.04em] text-balance">
          Menos dudas entre el antojo y el primer sorbo.
        </h2>
        <p className="mt-6 max-w-[65ch] text-base leading-7 sm:text-lg">
          Una tienda puede responder lo esencial mientras conserva la personalidad del comercio. La claridad también puede tener ritmo.
        </p>
      </div>

      <div className="relative mt-12 space-y-1 sm:mt-16">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#f3f0cb] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#f3f0cb] to-transparent" />
        <MarqueeRow items={rows[0]} duration="42s" />
        <MarqueeRow items={rows[1]} duration="48s" reverse />
        <MarqueeRow items={rows[2]} duration="45s" />
      </div>

      <div className="mt-14 grid border-y border-dashed border-[#49604e] sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ description, icon: Icon, title }, index) => (
          <article
            className={cn(
              "flex min-h-72 flex-col justify-between border-b border-dashed border-[#49604e] px-6 py-8 text-left sm:min-h-80",
              "sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0 lg:border-b-0",
            )}
            key={title}
          >
            <Icon className="size-10 stroke-[1.5]" aria-hidden="true" />
            <div>
              <span className="text-xs font-bold tracking-[0.16em]" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-2xl font-bold tracking-[-0.03em]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#3f5144]">{description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default Component;
