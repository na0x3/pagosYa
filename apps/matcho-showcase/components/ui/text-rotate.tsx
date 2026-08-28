"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AnimatePresence, motion, type AnimatePresenceProps, type MotionProps, type Transition } from "motion/react";

import { cn } from "@/lib/utils";

export interface TextRotateProps extends Omit<MotionProps, "children"> {
  texts: string[];
  rotationInterval?: number;
  initial?: MotionProps["initial"];
  animate?: MotionProps["animate"];
  exit?: MotionProps["exit"];
  animatePresenceMode?: AnimatePresenceProps["mode"];
  animatePresenceInitial?: boolean;
  staggerDuration?: number;
  staggerFrom?: "first" | "last" | "center" | number | "random";
  transition?: Transition;
  loop?: boolean;
  auto?: boolean;
  splitBy?: "words" | "characters" | "lines" | string;
  onNext?: (index: number) => void;
  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
}

export interface TextRotateRef { next: () => void; previous: () => void; jumpTo: (index: number) => void; reset: () => void }
type WordObject = { characters: string[]; needsSpace: boolean };

export const TextRotate = forwardRef<TextRotateRef, TextRotateProps>(function TextRotate({
  texts,
  transition = { type: "spring", damping: 25, stiffness: 300 },
  initial = { transform: "translateY(100%)", opacity: 0 },
  animate = { transform: "translateY(0)", opacity: 1 },
  exit = { transform: "translateY(-120%)", opacity: 0 },
  animatePresenceMode = "wait",
  animatePresenceInitial = false,
  rotationInterval = 2000,
  staggerDuration = 0,
  staggerFrom = "first",
  loop = true,
  auto = true,
  splitBy = "characters",
  onNext,
  mainClassName,
  splitLevelClassName,
  elementLevelClassName,
  ...props
}, ref) {
  const safeTexts = useMemo(() => texts.length ? texts : [""], [texts]);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const change = useCallback((index: number) => { setCurrentTextIndex(index); onNext?.(index); }, [onNext]);
  const next = useCallback(() => change(currentTextIndex === safeTexts.length - 1 ? (loop ? 0 : currentTextIndex) : currentTextIndex + 1), [change, currentTextIndex, loop, safeTexts.length]);
  const previous = useCallback(() => change(currentTextIndex === 0 ? (loop ? safeTexts.length - 1 : 0) : currentTextIndex - 1), [change, currentTextIndex, loop, safeTexts.length]);
  const jumpTo = useCallback((index: number) => change(Math.max(0, Math.min(index, safeTexts.length - 1))), [change, safeTexts.length]);
  const reset = useCallback(() => change(0), [change]);
  useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [jumpTo, next, previous, reset]);
  useEffect(() => { if (!auto || safeTexts.length < 2) return; const id = window.setInterval(next, rotationInterval); return () => window.clearInterval(id); }, [auto, next, rotationInterval, safeTexts.length]);

  const elements = useMemo<WordObject[]>(() => {
    const value = safeTexts[currentTextIndex] || "";
    const pieces = splitBy === "lines" ? value.split("\n") : splitBy === "words" ? value.split(" ") : splitBy === "characters" ? value.split(" ") : value.split(splitBy);
    const segment = (text: string) => typeof Intl !== "undefined" && "Segmenter" in Intl
      ? Array.from(new Intl.Segmenter("es", { granularity: "grapheme" }).segment(text), ({ segment: part }) => part)
      : Array.from(text);
    return pieces.map((piece, index) => ({ characters: splitBy === "characters" ? segment(piece) : [piece], needsSpace: splitBy !== "lines" && index !== pieces.length - 1 }));
  }, [currentTextIndex, safeTexts, splitBy]);
  const total = elements.reduce((sum, word) => sum + word.characters.length, 0);
  const delay = (index: number) => staggerFrom === "last" ? (total - 1 - index) * staggerDuration : staggerFrom === "center" ? Math.abs(Math.floor(total / 2) - index) * staggerDuration : staggerFrom === "random" ? Math.abs(Math.floor(total / 2) - index) * staggerDuration : typeof staggerFrom === "number" ? Math.abs(staggerFrom - index) * staggerDuration : index * staggerDuration;

  return (
    <motion.span className={cn("flex flex-wrap whitespace-pre-wrap", mainClassName)} {...props} layout transition={transition}>
      <span className="sr-only">{safeTexts[currentTextIndex]}</span>
      <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
        <motion.span key={currentTextIndex} className={cn("flex flex-wrap", splitBy === "lines" && "w-full flex-col")} layout aria-hidden="true">
          {elements.map((word, wordIndex) => {
            const prior = elements.slice(0, wordIndex).reduce((sum, item) => sum + item.characters.length, 0);
            return <span key={wordIndex} className={cn("inline-flex", splitLevelClassName)}>{word.characters.map((character, index) => <motion.span key={`${character}-${index}`} initial={initial} animate={animate} exit={exit} transition={{ ...transition, delay: delay(prior + index) }} className={cn("inline-block", elementLevelClassName)}>{character}</motion.span>)}{word.needsSpace && <span className="whitespace-pre"> </span>}</span>;
          })}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
});
