"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { ArrowUpRight } from "lucide-react";

type CursorState = {
  stageRef: RefObject<HTMLDivElement | null>;
  pointerX: ReturnType<typeof useMotionValue<number>>;
  pointerY: ReturnType<typeof useMotionValue<number>>;
  target: DOMRect | null;
  pressed: boolean;
  active: boolean;
};

const CursorContext = createContext<CursorState | null>(null);

function useCursorState() {
  const value = useContext(CursorContext);
  if (!value) throw new Error("CursorFloatingTarget must render inside its Stage");
  return value;
}

function Stage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const [target, setTarget] = useState<DOMRect | null>(null);
  const [pressed, setPressed] = useState(false);
  const [active, setActive] = useState(false);
  const value = useMemo(() => ({ stageRef, pointerX, pointerY, target, pressed, active }), [active, pointerX, pointerY, pressed, target]);

  return (
    <CursorContext.Provider value={value}>
      <div
        ref={stageRef}
        className="relative grid min-h-[680px] w-full cursor-none place-items-center overflow-hidden bg-[#ad8a49] text-[#0b2116] max-md:min-h-[560px] max-md:cursor-auto"
        onPointerEnter={() => setActive(true)}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => { setActive(false); setPressed(false); setTarget(null); }}
        onPointerMove={(event) => {
          const rect = stageRef.current?.getBoundingClientRect();
          if (!rect) return;
          pointerX.set(event.clientX - rect.left);
          pointerY.set(event.clientY - rect.top);
          const magnetic = (event.target as HTMLElement).closest<HTMLElement>("[data-magnetic]");
          setTarget(magnetic?.getBoundingClientRect() ?? null);
        }}
      >
        {children}
      </div>
    </CursorContext.Provider>
  );
}

function CustomCursor() {
  const { active, pointerX, pointerY, pressed, stageRef, target } = useCursorState();
  const reduceMotion = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rawScaleX = useMotionValue(1);
  const rawScaleY = useMotionValue(1);
  const x = useSpring(rawX, { stiffness: 1000, damping: 50 });
  const y = useSpring(rawY, { stiffness: 1000, damping: 50 });
  const scaleX = useSpring(rawScaleX, { stiffness: 1000, damping: 50 });
  const scaleY = useSpring(rawScaleY, { stiffness: 1000, damping: 50 });
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;

  useEffect(() => {
    const sync = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      if (target && !reduceMotion) {
        rawX.set(target.left + target.width / 2 - stageRect.left);
        rawY.set(target.top + target.height / 2 - stageRect.top);
        rawScaleX.set(target.width / 42);
        rawScaleY.set(target.height / 42);
      } else {
        rawX.set(pointerX.get());
        rawY.set(pointerY.get());
        rawScaleX.set(1);
        rawScaleY.set(1);
      }
    };
    sync();
    const unsubscribeX = pointerX.on("change", sync);
    const unsubscribeY = pointerY.on("change", sync);
    return () => { unsubscribeX(); unsubscribeY(); };
  }, [pointerX, pointerY, rawScaleX, rawScaleY, rawX, rawY, reduceMotion, stageRef, target]);

  if (reduceMotion) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-30 hidden size-[42px] rounded-full border-2 border-[#0b2116] mix-blend-multiply md:block"
      initial={false}
      animate={{ opacity: active ? 1 : 0, borderWidth: target ? 1 : 2 }}
      transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
      style={{ transform }}
    >
      <span className={`absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0b2116] transition-transform duration-150 ${pressed ? "scale-150" : "scale-100"}`} />
    </motion.div>
  );
}

const RING_TEXT = "DESCUBRE • DESCUBRE • DESCUBRE • ";

function FloatingTargetContent() {
  const { pointerX, pointerY, stageRef } = useCursorState();
  const reduceMotion = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 200, damping: 80 });
  const y = useSpring(rawY, { stiffness: 200, damping: 80 });
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0)`;

  useEffect(() => {
    const sync = () => {
      const stage = stageRef.current;
      if (!stage || reduceMotion) { rawX.set(0); rawY.set(0); return; }
      const rect = stage.getBoundingClientRect();
      rawX.set(((pointerX.get() / Math.max(1, rect.width)) - 0.5) * -32);
      rawY.set(((pointerY.get() / Math.max(1, rect.height)) - 0.5) * -32);
    };
    const unsubscribeX = pointerX.on("change", sync);
    const unsubscribeY = pointerY.on("change", sync);
    return () => { unsubscribeX(); unsubscribeY(); };
  }, [pointerX, pointerY, rawX, rawY, reduceMotion, stageRef]);

  return (
    <>
      <p className="pointer-events-none absolute inset-x-0 top-[10%] m-0 text-center font-serif text-[clamp(4rem,15vw,12rem)] leading-none italic text-[#173324]/20">MATCHO</p>
      <motion.a
        href="#productos"
        data-magnetic=""
        className="group relative grid size-52 place-items-center rounded-full border border-[#0b2116] bg-transparent text-[#0b2116] outline-none transition-colors duration-200 hover:bg-[#0b2116] hover:text-[#fffdf6] focus-visible:ring-4 focus-visible:ring-[#fffdf6] sm:size-64"
        style={{ transform }}
      >
        <span className="absolute inset-0 animate-[spin_10s_linear_infinite] motion-reduce:animate-none" aria-hidden="true">
          {RING_TEXT.split("").map((character, index, all) => (
            <span
              key={`${character}-${index}`}
              className="absolute left-1/2 top-1/2 text-[10px] font-bold tracking-[0.16em]"
              style={{ transform: `rotate(${(index * 360) / all.length}deg) translateY(-${index > -1 ? 112 : 112}px)`, transformOrigin: "0 0" }}
            >
              {character}
            </span>
          ))}
        </span>
        <span className="grid size-20 place-items-center rounded-full border border-current sm:size-24">
          <ArrowUpRight className="size-8 transition-transform duration-200 group-hover:rotate-45" aria-hidden="true" />
          <span className="sr-only">Ir a los productos</span>
        </span>
      </motion.a>
      <CustomCursor />
    </>
  );
}

export function CursorFloatingTarget() {
  return (
    <Stage>
      <FloatingTargetContent />
    </Stage>
  );
}

export default CursorFloatingTarget;
