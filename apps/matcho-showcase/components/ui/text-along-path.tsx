"use client";

import { type RefObject, useEffect, useId, useRef } from "react";
import { useScroll, type UseScrollOptions, useTransform } from "motion/react";

type PreserveAspectRatioAlign = "xMinYMin" | "xMidYMin" | "xMaxYMin" | "xMinYMid" | "xMidYMid" | "xMaxYMid" | "xMinYMax" | "xMidYMax" | "xMaxYMax";
type PreserveAspectRatio = "none" | PreserveAspectRatioAlign | `${PreserveAspectRatioAlign} ${"meet" | "slice"}`;
export interface AnimatedPathTextProps {
  path: string; pathId?: string; pathClassName?: string; preserveAspectRatio?: PreserveAspectRatio; showPath?: boolean;
  width?: string | number; height?: string | number; viewBox?: string; svgClassName?: string;
  text: string; textClassName?: string; textAnchor?: "start" | "middle" | "end";
  animationType?: "auto" | "scroll"; duration?: number; repeatCount?: number | "indefinite";
  easingFunction?: { calcMode?: string; keyTimes?: string; keySplines?: string };
  scrollContainer?: RefObject<HTMLElement | null>; scrollOffset?: UseScrollOptions["offset"]; scrollTransformValues?: [number, number];
}

export default function AnimatedPathText({ path, pathId, pathClassName, preserveAspectRatio = "xMidYMid meet", showPath = false, width = "100%", height = "100%", viewBox = "0 0 100 100", svgClassName, text, textClassName, textAnchor = "start", animationType = "auto", duration = 4, repeatCount = "indefinite", easingFunction = {}, scrollContainer, scrollOffset = ["start end", "end end"], scrollTransformValues = [0, 100] }: AnimatedPathTextProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = pathId || `animated-path-${generatedId}`;
  const refs = useRef<SVGTextPathElement[]>([]);
  const { scrollYProgress } = useScroll({ ...(scrollContainer && { container: scrollContainer }), offset: scrollOffset });
  const offset = useTransform(scrollYProgress, [0, 1], scrollTransformValues);
  useEffect(() => animationType === "scroll" ? offset.on("change", (value) => refs.current.forEach((node) => node?.setAttribute("startOffset", `${value}%`))) : undefined, [animationType, offset]);
  const animationProps = { attributeName: "startOffset", begin: "0s", dur: `${duration}s`, repeatCount, ...easingFunction };
  return <svg className={svgClassName} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={viewBox} preserveAspectRatio={preserveAspectRatio}><path id={id} className={pathClassName} d={path} stroke={showPath ? "currentColor" : "none"} fill="none"/><text textAnchor={textAnchor} fill="currentColor"><textPath ref={(node) => { if (node) refs.current[0] = node; }} className={textClassName} href={`#${id}`} startOffset="0%">{animationType === "auto" && <animate {...animationProps} from="0%" to="100%"/>}{text}</textPath></text>{animationType === "auto" && <text textAnchor={textAnchor} fill="currentColor"><textPath ref={(node) => { if (node) refs.current[1] = node; }} className={textClassName} href={`#${id}`} startOffset="-100%"><animate {...animationProps} from="-100%" to="0%"/>{text}</textPath></text>}</svg>;
}
