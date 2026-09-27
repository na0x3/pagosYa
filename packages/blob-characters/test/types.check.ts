import { ANIMATIONS, blobSvg, mountBlob, type AnimationStep } from "@pagosya/blob-characters";
const steps: AnimationStep[] = [{ expression: "happy", hold: 100, motion: "celebrate" }];
const handle = mountBlob(document.createElement("span"), { seed: "x", look: { shape: "sun", hue: 40 } });
void handle.play(steps, { loop: false });
void handle.play(ANIMATIONS.paymentFailed);
export const markup: string = blobSvg("x", { expression: "thinking", animate: "always" });
// @ts-expect-error an unknown expression is a type error for TypeScript consumers
blobSvg("x", { expression: "dancing" });
