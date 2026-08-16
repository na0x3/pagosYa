"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, Zap, Shield, Layers, RefreshCw } from "lucide-react";

const CARDS = [
  { id: 1, title: "INITIALIZE", code: "SYS_01", color: "bg-amber-300", icon: Sparkles },
  { id: 2, title: "AUTHENTICATE", code: "SYS_02", color: "bg-cyan-300", icon: Shield },
  { id: 3, title: "PROCESSING", code: "SYS_03", color: "bg-rose-300", icon: Zap },
  { id: 4, title: "SYNCHRONIZE", code: "SYS_04", color: "bg-emerald-300", icon: Layers },
];

export default function CardLoader() {
  const [activeDeck, setActiveDeck] = useState(CARDS);
  const prefersReducedMotion = useReducedMotion();

  const cycleCard = useCallback(() => {
    setActiveDeck((previous) => {
      const [topCard, ...rest] = previous;
      return [...rest, topCard];
    });
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = setInterval(cycleCard, 1800);
    return () => clearInterval(timer);
  }, [cycleCard, prefersReducedMotion]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 font-mono select-none">
      <div className="flex w-80 flex-col gap-5 border-[3.5px] border-black bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between border-b-[3px] border-black pb-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-black bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full border border-black bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full border border-black bg-green-400" />
          </div>
          <span className="bg-black px-2 py-0.5 text-[10px] font-black tracking-widest text-white uppercase">LOADING...</span>
        </div>

        <div className="relative flex h-44 w-full items-center justify-center overflow-hidden border-[3px] border-black bg-zinc-900 shadow-[inset_0px_3px_8px_rgba(0,0,0,0.4)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "12px 12px",
            }}
          />
          <div className="relative flex h-32 w-36 items-center justify-center">
            <AnimatePresence mode="popLayout">
              {activeDeck.map((card, index) => {
                const depthOffset = activeDeck.length - 1 - index;
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={prefersReducedMotion ? false : { x: -120, y: -10, rotate: -15, opacity: 0, scale: 0.85 }}
                    animate={{
                      x: depthOffset * -4,
                      y: depthOffset * -4,
                      rotate: (index % 2 === 0 ? 1 : -1) * (depthOffset * 2),
                      scale: 1 - depthOffset * 0.04,
                      opacity: 1,
                    }}
                    exit={prefersReducedMotion ? undefined : { x: 120, y: 10, rotate: 15, opacity: 0, scale: 0.85 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24 }}
                    style={{ zIndex: index }}
                    className={`absolute inset-0 flex flex-col justify-between border-[3px] border-black p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${card.color}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="bg-black px-1 py-0.5 text-[9px] font-black text-white">{card.code}</span>
                      <Icon size={14} className="stroke-[2.5]" />
                    </div>
                    <div className="my-auto"><h4 className="text-sm leading-tight font-black uppercase">{card.title}</h4></div>
                    <div className="flex items-center justify-between border-t-2 border-black pt-1 text-[8px] font-black">
                      <span>STATUS</span><span className={`h-2 w-2 rounded-full bg-black ${prefersReducedMotion ? "" : "animate-pulse"}`} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-between border-[2.5px] border-black bg-zinc-100 p-2.5 text-xs font-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2"><RefreshCw size={12} className={prefersReducedMotion ? "text-black" : "animate-spin text-black"} /><span className="text-[10px] tracking-wider uppercase">DECK_CYCLE</span></div>
          <span className="bg-black px-1.5 py-0.5 text-[10px] text-yellow-300">ACTIVE</span>
        </div>
      </div>
    </div>
  );
}
