"use client";

import { cn } from "@/lib/utils";
import * as HoverCard from "@radix-ui/react-hover-card";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { encode } from "qss";
import type { ReactNode } from "react";
import { useState } from "react";

type LinkPreviewProps = {
  children: ReactNode;
  url: string;
  className?: string;
  width?: number;
  height?: number;
  quality?: number;
} & ({ isStatic: true; imageSrc: string } | { isStatic?: false; imageSrc?: never });

export function LinkPreview({ children, url, className, width = 240, height = 150, quality = 60, isStatic = false, imageSrc }: Readonly<LinkPreviewProps>) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const translateX = useSpring(pointerX, { stiffness: 180, damping: 24 });
  const src = isStatic
    ? imageSrc
    : `https://api.microlink.io/?${encode({ url, screenshot: true, meta: false, embed: "screenshot.url", colorScheme: "dark", "viewport.isMobile": true, "viewport.width": width * 3, "viewport.height": height * 3 })}`;

  return (
    <HoverCard.Root openDelay={80} closeDelay={120} onOpenChange={setOpen}>
      <HoverCard.Trigger asChild>
        <a
          href={url}
          className={cn("underline decoration-current/35 underline-offset-4", className)}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            pointerX.set((event.clientX - bounds.left - bounds.width / 2) / 2);
          }}
        >
          {children}
        </a>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side="top" align="center" sideOffset={12} className="z-50 [transform-origin:var(--radix-hover-card-content-transform-origin)]">
          <AnimatePresence>
            {open && (
              <motion.a
                href={url}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                style={{ x: reduceMotion ? 0 : translateX }}
                className="block rounded-xl border border-neutral-200 bg-white p-1 shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
              >
                <img src={src} width={width} height={height} alt={`Preview of ${url}`} className="rounded-lg object-cover" style={{ aspectRatio: `${width}/${height}` }} />
              </motion.a>
            )}
          </AnimatePresence>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
