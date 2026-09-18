"use client";

import { cn } from "@/lib/utils";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import type { ReactNode } from "react";

export function DraggableCardBody({
  className,
  children,
}: Readonly<{ className?: string; children?: ReactNode }>) {
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(useTransform(pointerY, [-220, 220], [9, -9]), {
    stiffness: 180,
    damping: 24,
  });
  const rotateY = useSpring(useTransform(pointerX, [-220, 220], [-9, 9]), {
    stiffness: 180,
    damping: 24,
  });
  const glareOpacity = useTransform(pointerX, [-220, 0, 220], [0.16, 0, 0.16]);

  return (
    <motion.article
      drag
      dragConstraints={{ top: -220, right: 220, bottom: 220, left: -220 }}
      dragElastic={0.12}
      dragMomentum={!reduceMotion}
      whileDrag={{ cursor: "grabbing", scale: reduceMotion ? 1 : 1.015 }}
      whileHover={{ scale: reduceMotion ? 1 : 1.015 }}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerX.set(event.clientX - bounds.left - bounds.width / 2);
        pointerY.set(event.clientY - bounds.top - bounds.height / 2);
      }}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
      }}
      style={{
        rotateX: reduceMotion ? 0 : rotateX,
        rotateY: reduceMotion ? 0 : rotateY,
        transformStyle: "preserve-3d",
      }}
      className={cn(
        "relative min-h-96 w-80 cursor-grab touch-none overflow-hidden rounded-2xl bg-neutral-100 p-6 shadow-2xl dark:bg-neutral-900",
        className,
      )}
    >
      {children}
      {!reduceMotion && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: glareOpacity }}
          className="pointer-events-none absolute inset-0 bg-white"
        />
      )}
    </motion.article>
  );
}

export function DraggableCardContainer({
  className,
  children,
}: Readonly<{ className?: string; children?: ReactNode }>) {
  return <div className={cn("[perspective:3000px]", className)}>{children}</div>;
}
