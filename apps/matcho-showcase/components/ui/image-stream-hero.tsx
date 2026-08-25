"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type CorridorPath = {
  perspective?: number;
  cardWidth?: number;
  cardHeight?: number;
  cardRadius?: number;
  birthHeight?: number;
  exitHeight?: number;
  railBirth?: number;
  railExit?: number;
  fan?: number;
  turnBirth?: number;
  turnExit?: number;
  stops?: number;
};

const PATH: Required<CorridorPath> = {
  perspective: 30,
  cardWidth: 18,
  cardHeight: 25,
  cardRadius: 0.4,
  birthHeight: 2.6,
  exitHeight: 46,
  railBirth: -11,
  railExit: 44,
  fan: 3.3,
  turnBirth: 6,
  turnExit: 28,
  stops: 24,
};

function keyframes(direction: 1 | -1, name: string, path: Required<CorridorPath>) {
  const steps: string[] = [];
  for (let step = 0; step <= path.stops; step += 1) {
    const progress = step / path.stops;
    const scale = (path.birthHeight / path.cardHeight) * Math.pow(path.exitHeight / path.birthHeight, progress);
    const z = path.perspective * (1 - 1 / scale);
    const rail = path.railExit - (path.railExit - path.railBirth) * Math.pow(1 - progress, path.fan);
    const turn = path.turnBirth + (path.turnExit - path.turnBirth) * progress;
    steps.push(`${(progress * 100).toFixed(2)}%{transform:translate3d(${(direction * rail).toFixed(2)}cqw,0,${z.toFixed(2)}cqw) rotateY(${(-direction * turn).toFixed(2)}deg)}`);
  }
  return `@keyframes ${name}{${steps.join("")}}`;
}

export type StreamImage = { src: string; alt?: string };

export type ImageStreamHeroProps = {
  images: StreamImage[];
  cards?: number;
  speed?: number;
  axis?: number;
  path?: CorridorPath;
  children?: React.ReactNode;
  className?: string;
};

export function ImageStreamHero({
  images,
  cards = 9,
  speed = 18,
  axis = 55,
  path,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & ImageStreamHeroProps) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const right = `ish-r-${id}`;
  const left = `ish-l-${id}`;
  const cardClass = `ish-c-${id}`;
  const geometry = React.useMemo(() => ({ ...PATH, ...path }), [path]);
  const css = React.useMemo(
    () => `${keyframes(1, right, geometry)}${keyframes(-1, left, geometry)}@media(prefers-reduced-motion:reduce){.${cardClass}{animation-play-state:paused!important}}`,
    [right, left, cardClass, geometry],
  );

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      {...props}
      style={{ containerType: "inline-size", ...props.style }}
    >
      <style>{css}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ perspective: `${geometry.perspective}cqw`, perspectiveOrigin: `50% ${axis}%` }}
      >
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {[right, left].map((name) =>
            Array.from({ length: cards }, (_, index) => {
              const image = images[index % Math.max(images.length, 1)];
              return (
                <div
                  key={`${name}-${index}`}
                  className={cn(cardClass, "absolute overflow-hidden")}
                  style={{
                    left: "50%",
                    top: `${axis}%`,
                    width: `${geometry.cardWidth}cqw`,
                    height: `${geometry.cardHeight}cqw`,
                    marginLeft: `${-geometry.cardWidth / 2}cqw`,
                    marginTop: `${-geometry.cardHeight / 2}cqw`,
                    borderRadius: `${geometry.cardRadius}cqw`,
                    animation: `${name} ${speed}s linear infinite`,
                    animationDelay: `${-(index * speed) / cards}s`,
                    backfaceVisibility: "hidden",
                  }}
                >
                  {image ? <img src={image.src} alt={image.alt ?? ""} loading="lazy" decoding="async" className="size-full object-cover" draggable={false} /> : null}
                </div>
              );
            }),
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export default ImageStreamHero;
