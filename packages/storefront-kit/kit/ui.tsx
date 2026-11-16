/**
 * @pagosya/ui — the trusted storefront design framework.
 *
 * Generated storefronts compose these sections, tune them with store tokens, and write bespoke
 * components only where the brand needs a moment nobody else has. Everything here is shared
 * verbatim by the isolated preview compiler and the portable Next.js export, so it must stay
 * SSR-safe, dependency-free beyond React/Motion/Lenis, and render every commerce hook literally
 * (the publish gate inspects JSX statically and only sees unconditional markup).
 *
 * Styling is self-contained (`ui-` classes + CSS custom properties), never Tailwind, because the
 * Tailwind pass only scans authored components.
 */
import { Children, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationFrame, useInView, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';

/* ------------------------------------------------------------------ tokens */

export type CardAspect = '1/1' | '4/5' | '3/4' | '2/3' | '5/4' | '16/9';
export type ScrollFeel = 'native' | 'soft' | 'cinematic';
export type StoreTokens = {
  /** Page background. */ paper: string;
  /** Text colour; muted text is derived from it at fixed opacity rungs, never a second hue. */ ink: string;
  /** The one accent: primary action, selected state, eyebrow, rating marks, announcement bar. */ accent: string;
  /** Text on the accent. Defaults to paper. */ onAccent?: string;
  /** Raised/alternate surface. Defaults to a 5% ink tint of paper. */ surface?: string;
  /** CSS font-family lists. Declare @font-face for bundled fonts in styles/globals.css. */
  displayFont?: string; bodyFont?: string;
  /** Lead/subhead register: 'italic' gives it its own voice. */ subheadStyle?: 'italic' | 'normal';
  /** Base corner radius in px (0–28). Controls, media and pills derive from it. */ radius?: number;
  /** Multiplies the whole 8-step spacing scale (0.85–1.25). */ space?: number;
  /** display:body size ratio (2.4–3.4). */ displayRatio?: number;
  /** Uppercase label tracking in em (0.06–0.22). */ labelTracking?: number;
  /** Heading weight (300–800). */ displayWeight?: number;
  /** One aspect for every product image in the store. */ cardAspect?: CardAspect;
};

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
/** Token values land inside a <style> element: strip anything that could end a declaration or the element. */
const safe = (value: string | undefined, fallback: string) => {
  const cleaned = String(value ?? '').replace(/[<>{};\\]/g, '').trim().slice(0, 160);
  return cleaned || fallback;
};
const ASPECTS: CardAspect[] = ['1/1', '4/5', '3/4', '2/3', '5/4', '16/9'];

export function themeCss(tokens: StoreTokens): string {
  const paper = safe(tokens.paper, '#fbf8f3');
  const ink = safe(tokens.ink, '#1d1b18');
  const accent = safe(tokens.accent, ink);
  const onAccent = safe(tokens.onAccent, paper);
  const surface = safe(tokens.surface, `color-mix(in srgb, ${ink} 5%, ${paper})`);
  const display = safe(tokens.displayFont, 'ui-serif, Georgia, serif');
  const body = safe(tokens.bodyFont, 'ui-sans-serif, system-ui, sans-serif');
  const radius = clamp(tokens.radius, 0, 28, 6);
  const space = clamp(tokens.space, 0.85, 1.25, 1);
  const ratio = clamp(tokens.displayRatio, 2.4, 3.4, 2.9);
  const tracking = clamp(tokens.labelTracking, 0.06, 0.22, 0.14);
  const weight = Math.round(clamp(tokens.displayWeight, 300, 800, 460) / 10) * 10;
  const aspect = ASPECTS.includes(tokens.cardAspect as CardAspect) ? tokens.cardAspect : '4/5';
  const steps = [4, 8, 12, 20, 32, 48, 72, 112].map((px, i) => `--ui-s${i + 1}:${Math.round(px * space)}px`).join(';');
  return `:root{--ui-paper:${paper};--ui-ink:${ink};--ui-accent:${accent};--ui-on-accent:${onAccent};--ui-surface:${surface};`
    + `--ui-display-font:${display};--ui-body-font:${body};--ui-display-weight:${weight};--ui-subhead-style:${tokens.subheadStyle === 'normal' ? 'normal' : 'italic'};`
    + `--ui-radius:${radius}px;--ui-radius-control:${Math.min(radius, 10)}px;--ui-radius-media:${Math.round(Math.min(radius * 1.5, 22))}px;`
    + `--ui-ratio:${ratio};--ui-tracking:${tracking}em;--ui-aspect:${aspect};${steps};`
    // The commerce runtime (cart, product page, checkout) reads these, so the whole store shares one system.
    + `--store-background:var(--ui-paper);--store-foreground:var(--ui-ink);--store-accent:var(--ui-accent);--store-accent-foreground:var(--ui-on-accent);`
    + `--store-surface:var(--ui-surface);--store-radius:var(--ui-radius-control);--store-heading-font:var(--ui-display-font);--store-body-font:var(--ui-body-font);`
    + `--store-border:var(--ui-line)}`;
}

/* ------------------------------------------------------------------ base css */

const UI_CSS = `
:root{--ui-line:color-mix(in srgb,var(--ui-ink) 14%,var(--ui-paper));--ui-ink-85:color-mix(in srgb,var(--ui-ink) 85%,var(--ui-paper));--ui-ink-70:color-mix(in srgb,var(--ui-ink) 70%,var(--ui-paper));--ui-ink-55:color-mix(in srgb,var(--ui-ink) 55%,var(--ui-paper));--ui-ink-40:color-mix(in srgb,var(--ui-ink) 40%,var(--ui-paper));--ui-body:clamp(15px,.35vw + 14px,17px);--ui-display:clamp(calc(var(--ui-body) * 1.9),calc(var(--ui-body) * var(--ui-ratio) * .42 + 3.2vw),calc(var(--ui-body) * var(--ui-ratio)));--ui-h2:clamp(calc(var(--ui-body) * 1.5),1.2vw + 1.2rem,calc(var(--ui-body) * var(--ui-ratio) * .62));--ui-ease:var(--motion-ease-settle,cubic-bezier(.22,1,.36,1));--ui-shadow:0 1px 2px color-mix(in srgb,var(--ui-ink) 8%,transparent),0 12px 32px -12px color-mix(in srgb,var(--ui-ink) 22%,transparent)}
body{margin:0;background:var(--ui-paper)}
html.lenis,html.lenis body{height:auto}.lenis.lenis-smooth{scroll-behavior:auto!important}.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}.lenis.lenis-stopped{overflow:clip}
.ui-root{background:var(--ui-paper);color:var(--ui-ink);font-family:var(--ui-body-font);font-size:var(--ui-body);line-height:1.7;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;min-height:100dvh}
.ui-root *,.ui-root *::before,.ui-root *::after{box-sizing:border-box}
.ui-root img{max-width:100%;display:block}
.ui-root :focus-visible{outline:2px solid var(--ui-accent);outline-offset:3px}
.ui-skip{position:absolute;left:var(--ui-s3);top:-100px;z-index:60;padding:var(--ui-s2) var(--ui-s3);background:var(--ui-ink);color:var(--ui-paper);border-radius:var(--ui-radius-control)}.ui-skip:focus{top:var(--ui-s3)}
.ui-container{width:min(100% - 2*clamp(16px,4vw,48px),1240px);margin-inline:auto}.ui-container[data-width=narrow]{width:min(100% - 32px,760px)}.ui-container[data-width=wide]{width:min(100% - 2*clamp(16px,3vw,40px),1440px)}.ui-container[data-width=full]{width:100%}
.ui-section{padding-block:var(--ui-s7)}.ui-section[data-space=sm]{padding-block:var(--ui-s6)}.ui-section[data-space=lg]{padding-block:var(--ui-s8)}.ui-section[data-space=none]{padding-block:0}
.ui-section[data-tone=surface]{background:var(--ui-surface)}.ui-section[data-tone=ink]{background:var(--ui-ink);color:var(--ui-paper);--ui-line:color-mix(in srgb,var(--ui-paper) 18%,var(--ui-ink))}.ui-section[data-tone=accent]{background:var(--ui-accent);color:var(--ui-on-accent)}
.ui-display{font-family:var(--ui-display-font);font-weight:var(--ui-display-weight);font-size:var(--ui-display);line-height:1.04;letter-spacing:-.02em;margin:0;text-wrap:balance;max-width:18ch}
.ui-h2{font-family:var(--ui-display-font);font-weight:var(--ui-display-weight);font-size:var(--ui-h2);line-height:1.1;letter-spacing:-.015em;margin:0;text-wrap:balance;max-width:24ch}
.ui-h3{font-family:var(--ui-display-font);font-weight:var(--ui-display-weight);font-size:calc(var(--ui-body) * 1.25);line-height:1.2;margin:0}
.ui-eyebrow{display:inline-block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:var(--ui-tracking);color:var(--ui-accent);margin:0 0 var(--ui-s3)}
[data-tone=ink] .ui-eyebrow,[data-tone=accent] .ui-eyebrow{color:inherit;opacity:.8}
.ui-lead{font-family:var(--ui-display-font);font-style:var(--ui-subhead-style);font-size:calc(var(--ui-body) * 1.2);line-height:1.45;color:var(--ui-ink-70);margin:var(--ui-s3) 0 0;max-width:46ch}
[data-tone] .ui-lead{color:inherit;opacity:.82}
.ui-text{margin:0;max-width:62ch;color:var(--ui-ink-85)}.ui-text+.ui-text{margin-top:var(--ui-s3)}[data-tone] .ui-text{color:inherit}
.ui-muted{color:var(--ui-ink-70)}
.ui-hairline{border:0;border-top:1px solid var(--ui-line);margin:0}
.ui-stack{display:flex;flex-direction:column;gap:var(--ui-s3)}.ui-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--ui-s3)}
.ui-button{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:48px;padding:0 var(--ui-s5);border:1px solid transparent;border-radius:var(--ui-radius-control);font:inherit;font-weight:600;font-size:15px;letter-spacing:.01em;text-decoration:none;cursor:pointer;transition:transform var(--motion-fast,.2s) var(--motion-ease,var(--ui-ease)),background-color var(--motion-fast,.2s),color var(--motion-fast,.2s),border-color var(--motion-fast,.2s)}
.ui-button:active{transform:scale(.97)}
.ui-button[data-variant=solid]{background:var(--ui-accent);color:var(--ui-on-accent)}.ui-button[data-variant=solid]:hover{background:color-mix(in srgb,var(--ui-accent) 88%,var(--ui-ink))}
.ui-button[data-variant=outline]{border-color:currentColor;color:inherit;background:transparent}.ui-button[data-variant=outline]:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.ui-button[data-variant=ghost]{color:inherit;background:transparent;padding-inline:var(--ui-s3)}.ui-button[data-variant=ghost]:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
.ui-button[data-variant=link]{min-height:44px;padding:0;color:inherit;background:none;text-decoration:underline;text-underline-offset:.3em;text-decoration-thickness:1px}
.ui-button[data-size=sm]{min-height:44px;padding-inline:var(--ui-s4);font-size:14px}.ui-button[data-size=lg]{min-height:56px;padding-inline:var(--ui-s6);font-size:16px}
.ui-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--ui-accent) 12%,var(--ui-paper));color:var(--ui-ink);font-size:12px;font-weight:600}
.ui-announcement{background:var(--ui-accent);color:var(--ui-on-accent);font-size:12px;font-weight:600;letter-spacing:var(--ui-tracking);text-transform:uppercase;text-align:center;padding:10px var(--ui-s3)}.ui-announcement a{color:inherit}
.ui-header{position:relative;z-index:30;background:var(--ui-paper);border-bottom:1px solid var(--ui-line)}.ui-header[data-sticky]{position:sticky;top:0;background:color-mix(in srgb,var(--ui-paper) 90%,transparent);backdrop-filter:saturate(1.4) blur(14px)}
.ui-header[data-variant=floating]{position:sticky;top:var(--ui-s3);margin:var(--ui-s3) auto 0;width:min(100% - 24px,1180px);border:1px solid var(--ui-line);border-radius:calc(var(--ui-radius) + 8px);box-shadow:var(--ui-shadow);background:color-mix(in srgb,var(--ui-paper) 86%,transparent);backdrop-filter:blur(16px)}
.ui-header[data-variant=floating] .ui-container{width:calc(100% - 2*var(--ui-s4))}
.ui-header__bar{display:grid;grid-template-columns:1fr auto;align-items:center;gap:var(--ui-s4);min-height:68px}
.ui-header[data-variant=centered] .ui-header__bar,.ui-header[data-variant=split] .ui-header__bar{grid-template-columns:1fr auto 1fr}
.ui-header[data-variant=centered] .ui-brand,.ui-header[data-variant=split] .ui-brand{grid-column:2;grid-row:1;justify-self:center;text-align:center}
.ui-header[data-variant=centered] .ui-nav,.ui-header[data-variant=split] .ui-nav{grid-column:1;grid-row:1;justify-self:start}
.ui-header[data-variant=centered] .ui-header__tools,.ui-header[data-variant=split] .ui-header__tools{grid-column:3;grid-row:1;justify-self:end}
.ui-header[data-variant=centered] .ui-header__bar{grid-template-rows:auto auto;row-gap:0}.ui-header[data-variant=centered] .ui-nav{grid-column:1/-1;grid-row:2;justify-self:center;padding-bottom:var(--ui-s2)}.ui-header[data-variant=centered] .ui-brand{padding-top:var(--ui-s3)}
.ui-header__main{display:flex;align-items:center;gap:var(--ui-s6);min-width:0}
.ui-brand{display:inline-flex;flex-direction:column;color:inherit;text-decoration:none;line-height:1.1;min-width:0}.ui-brand__name{font-family:var(--ui-display-font);font-weight:var(--ui-display-weight);font-size:clamp(19px,1.2vw + 12px,26px);letter-spacing:-.01em}.ui-brand__tag{font-size:11px;letter-spacing:var(--ui-tracking);text-transform:uppercase;color:var(--ui-ink-70);margin-top:3px}.ui-brand img{max-height:40px;width:auto}
.ui-nav{display:flex;gap:var(--ui-s1)}.ui-nav a{display:inline-flex;align-items:center;min-height:44px;padding:0 var(--ui-s3);color:var(--ui-ink-85);text-decoration:none;font-size:15px;border-radius:var(--ui-radius-control)}.ui-nav a:hover{color:var(--ui-ink);background:color-mix(in srgb,var(--ui-ink) 5%,transparent)}
.ui-header__tools{display:flex;align-items:center;gap:var(--ui-s2)}
.ui-cart{position:relative;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 var(--ui-s3);border:1px solid var(--ui-line);border-radius:var(--kit-btn-radius,999px);background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer}.ui-cart:hover{border-color:var(--ui-ink-40)}:root[data-dna-button] .ui-cart{text-transform:var(--kit-btn-case);letter-spacing:var(--kit-btn-tracking)}
.ui-cart [data-cart-count]{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--ui-accent);color:var(--ui-on-accent);font-size:12px;font-variant-numeric:tabular-nums}.ui-cart [data-cart-count]:empty{display:none}
.ui-menu{display:none}.ui-menu summary{list-style:none;display:grid;place-items:center;width:44px;height:44px;border-radius:999px;cursor:pointer}.ui-menu summary::-webkit-details-marker{display:none}
.ui-menu__panel{position:absolute;left:0;right:0;top:100%;display:grid;gap:2px;padding:var(--ui-s3) clamp(16px,4vw,48px) var(--ui-s5);background:var(--ui-paper);border-bottom:1px solid var(--ui-line);box-shadow:var(--ui-shadow)}.ui-menu__panel a{min-height:48px;display:flex;align-items:center;color:inherit;text-decoration:none;font-size:18px;border-bottom:1px solid var(--ui-line)}
@media (max-width:820px){.ui-nav{display:none}.ui-menu{display:block}.ui-header .ui-header__bar,.ui-header[data-variant] .ui-header__bar{grid-template-columns:auto 1fr auto;grid-template-rows:auto}.ui-header .ui-header__main{display:contents}.ui-header .ui-brand,.ui-header[data-variant] .ui-brand{grid-column:2;grid-row:1;justify-self:center;text-align:center;padding-top:0}.ui-header .ui-menu{grid-column:1;grid-row:1}.ui-header .ui-header__tools,.ui-header[data-variant] .ui-header__tools{grid-column:3;grid-row:1;justify-self:end}.ui-cart__label{display:none}}
.ui-hero{position:relative;overflow:clip}
.ui-hero[data-variant=split] .ui-hero__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:var(--ui-s6);align-items:center;min-height:min(86dvh,820px);padding-block:var(--ui-s6)}
.ui-hero[data-variant=split] .ui-hero__media{border-radius:var(--ui-radius-media);overflow:hidden;aspect-ratio:4/5;background:var(--ui-surface)}
.ui-hero__media img{width:100%;height:100%;object-fit:cover}
.ui-hero[data-variant=fullbleed]{min-height:min(92dvh,900px);display:grid;align-items:end;color:#fff}.ui-hero[data-variant=fullbleed] .ui-hero__media{position:absolute;inset:0}.ui-hero[data-variant=fullbleed] .ui-hero__media::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgb(0 0 0/.62),rgb(0 0 0/.08) 55%,transparent)}.ui-hero[data-variant=fullbleed] .ui-hero__copy{position:relative;padding-block:var(--ui-s7)}.ui-hero[data-variant=fullbleed] .ui-lead,.ui-hero[data-variant=fullbleed] .ui-eyebrow{color:inherit}
/* Editorial is a masthead: one wide band of photography, the headline beneath it. It must not read as a second 'split'. */
.ui-hero[data-variant=editorial] .ui-hero__grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--ui-s5) var(--ui-s4);padding-block:var(--ui-s5) var(--ui-s7)}.ui-hero[data-variant=editorial] .ui-hero__copy{grid-column:1/9;position:relative;z-index:1}.ui-hero[data-variant=editorial] .ui-display{max-width:16ch}.ui-hero[data-variant=editorial] .ui-hero__media{order:-1;grid-column:1/13;aspect-ratio:21/9;max-height:min(58dvh,560px);border-radius:var(--ui-radius-media);overflow:hidden;background:var(--ui-surface)}
.ui-hero[data-variant=typographic]{padding-block:var(--ui-s8) var(--ui-s7);text-align:center}.ui-hero[data-variant=typographic] .ui-display{max-width:14ch;margin-inline:auto;font-size:calc(var(--ui-display) * 1.25)}.ui-hero[data-variant=typographic] .ui-lead{margin-inline:auto}.ui-hero[data-variant=typographic] .ui-row{justify-content:center}.ui-hero[data-variant=typographic] .ui-hero__media{margin:var(--ui-s6) auto 0;width:min(100%,980px);aspect-ratio:16/9;border-radius:var(--ui-radius-media);overflow:hidden}
.ui-hero[data-variant=contained] .ui-hero__grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:var(--ui-s6);align-items:center;padding-block:var(--ui-s5)}
.ui-hero[data-variant=contained] .ui-hero__copy{min-width:0}.ui-hero[data-variant=contained] .ui-display{font-size:clamp(32px,4.4vw,64px);max-width:18ch}
.ui-hero[data-variant=contained] .ui-hero__media{display:flex;justify-content:center;align-items:center;min-width:0}
.ui-hero[data-variant=contained] .ui-hero__media img{width:auto;height:auto;max-width:100%;max-height:min(64dvh,560px);object-fit:contain;border-radius:var(--ui-radius-media)}
.ui-hero__actions{margin-top:var(--ui-s5)}
.ui-hero .ui-display{font-size:calc(var(--ui-display) * 1.3)}
.ui-video-hero{position:relative;isolation:isolate;display:grid;align-items:end;min-height:min(86dvh,900px);background:var(--ui-ink);color:#fff;overflow:clip}
.ui-video-hero__media,.ui-video-hero__media::after,.ui-video-hero__media>img,.ui-video-hero__media>video{position:absolute;inset:0;width:100%;height:100%}
.ui-video-hero__media>img,.ui-video-hero__media>video{object-fit:cover}.ui-video-hero__media>video{opacity:0;transition:opacity .2s var(--ui-ease)}.ui-video-hero__media>video[data-playing]{opacity:1}
.ui-video-hero__media::after{content:"";background:linear-gradient(180deg,rgb(0 0 0/.08) 15%,rgb(0 0 0/.38) 55%,rgb(0 0 0/.78));pointer-events:none}
.ui-video-hero__copy{position:relative;padding-block:var(--ui-s8) var(--ui-s7);padding-right:clamp(0px,8vw,100px)}.ui-video-hero .ui-display{font-size:calc(var(--ui-display) * 1.45);max-width:14ch}.ui-video-hero .ui-lead,.ui-video-hero .ui-eyebrow{color:inherit}
.ui-video-hero__control{position:relative;justify-self:end;margin:calc(-1 * var(--ui-s6)) var(--ui-s4) var(--ui-s4);z-index:1;min-width:44px;min-height:44px;border:1px solid rgb(255 255 255/.65);border-radius:999px;padding:8px 16px;background:rgb(0 0 0/.65);color:#fff;font:inherit;font-size:12px;cursor:pointer}
.ui-video-hero :focus-visible{outline-color:#fff}.ui-video-hero .ui-button[data-variant=solid]{background:var(--ui-paper);color:var(--ui-ink)}
.ui-floating{position:relative;overflow:clip}.ui-floating__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:var(--ui-s6);align-items:center;padding-block:var(--ui-s7);min-height:min(85dvh,850px)}.ui-floating__copy{position:relative;z-index:2}.ui-floating .ui-display{font-size:calc(var(--ui-display) * 1.35);max-width:12ch}.ui-floating__stage{position:relative;height:clamp(420px,45vw,650px)}
.ui-floating__item{position:absolute;inset:12% 12% 8% 18%;margin:0;z-index:1}.ui-floating__frame{height:100%;margin:0;overflow:hidden;border-radius:var(--ui-radius-media);box-shadow:var(--ui-shadow);background:var(--ui-surface)}.ui-floating__frame img{width:100%;height:100%;object-fit:cover}
.ui-floating__item:nth-child(2){inset:0 57% 55% -3%;z-index:2}.ui-floating__item:nth-child(2) .ui-floating__frame{transform:rotate(-8deg)}
.ui-floating__item:nth-child(3){inset:57% -3% 0 61%;z-index:2}.ui-floating__item:nth-child(3) .ui-floating__frame{transform:rotate(7deg)}
.ui-floating__item:nth-child(4){inset:-3% -1% 72% 76%}.ui-floating__item:nth-child(4) .ui-floating__frame{transform:rotate(5deg)}
.ui-floating__item:nth-child(5){inset:76% 70% -2% 0}.ui-floating__item:nth-child(5) .ui-floating__frame{transform:rotate(-5deg)}
.ui-parallax-stack{position:relative;height:clamp(420px,58vw,760px);isolation:isolate}.ui-parallax-stack>[data-ui-parallax]{position:absolute;inset:12% 18% 8% 12%}.ui-parallax-stack>[data-ui-parallax] figure{height:100%;margin:0;overflow:hidden;border-radius:var(--ui-radius-media);box-shadow:var(--ui-shadow);background:var(--ui-surface)}.ui-parallax-stack>[data-ui-parallax] img{width:100%;height:100%;object-fit:cover}.ui-parallax-stack>[data-ui-parallax]:nth-child(2){inset:0 60% 58% 0;z-index:2}.ui-parallax-stack>[data-ui-parallax]:nth-child(3){inset:58% 0 0 64%;z-index:3}
.ui-scroll-hero{position:relative;height:220vh;color:#fff;background:var(--ui-ink)}.ui-scroll-hero__stage{position:sticky;top:0;height:100dvh;overflow:clip;display:grid;align-items:end}.ui-scroll-hero__media,.ui-scroll-hero__media::after,.ui-scroll-hero__media>img,.ui-scroll-hero__media>video{position:absolute;inset:0;width:100%;height:100%}.ui-scroll-hero__media>img,.ui-scroll-hero__media>video{object-fit:cover}.ui-scroll-hero__media>video{opacity:0}.ui-scroll-hero__media>video[data-ready]{opacity:1}.ui-scroll-hero__media::after{content:"";background:linear-gradient(to top,rgb(0 0 0/.72),rgb(0 0 0/.08) 62%);pointer-events:none}.ui-scroll-hero__copy{position:relative;z-index:1;padding-block:var(--ui-s8) var(--ui-s7)}.ui-scroll-hero .ui-display{font-size:calc(var(--ui-display) * 1.5);max-width:13ch}.ui-scroll-hero .ui-lead,.ui-scroll-hero .ui-eyebrow{color:inherit}.ui-scroll-hero[data-static]{height:auto}.ui-scroll-hero[data-static] .ui-scroll-hero__stage{position:relative;min-height:78dvh;height:auto}
.ui-section-sequence{display:grid;gap:var(--ui-s7)}
.ui-compare{margin:0;min-width:0}.ui-compare__stage{position:relative;aspect-ratio:var(--ui-compare-aspect,4/5);overflow:hidden;border-radius:var(--ui-radius-media);background:var(--ui-surface)}.ui-compare__stage>img{width:100%;height:100%;object-fit:cover}.ui-compare__before{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--ui-compare-position)) 0 0)}
.ui-compare__divider{position:absolute;inset:0 auto 0 var(--ui-compare-position);width:2px;background:#fff;box-shadow:0 0 3px #000;pointer-events:none}.ui-compare__divider::after{content:"↔";position:absolute;left:50%;top:50%;display:grid;place-items:center;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;background:#fff;color:#111;font:600 22px/1 system-ui;box-shadow:0 2px 12px rgb(0 0 0/.2)}
.ui-compare__caption{display:grid;gap:var(--ui-s2);padding-top:var(--ui-s3)}.ui-compare__labels{display:flex;justify-content:space-between;gap:var(--ui-s3);font-size:13px}.ui-compare__label{font-size:14px;font-weight:600}.ui-compare__range{display:block;width:100%;min-height:44px;margin:0;accent-color:var(--ui-accent);cursor:ew-resize}.ui-compare__hint{margin:0;font-size:12px;color:var(--ui-ink-70)}
@media(max-width:820px){.ui-floating__grid{grid-template-columns:1fr;min-height:0;gap:var(--ui-s5);padding-block:var(--ui-s6)}.ui-floating__stage{height:clamp(300px,95vw,500px);margin-inline:var(--ui-s3)}.ui-floating__item{transform:none!important}.ui-floating .ui-display{max-width:15ch}.ui-video-hero{min-height:78dvh}.ui-video-hero__copy{padding-top:var(--ui-s8);padding-right:0}.ui-video-hero .ui-display{font-size:calc(var(--ui-display) * 1.2)}.ui-parallax-stack{height:clamp(340px,110vw,520px)}.ui-scroll-hero{height:auto}.ui-scroll-hero__stage{position:relative;min-height:78dvh;height:auto}.ui-scroll-hero__media{transform:none!important}.ui-scroll-hero .ui-display{font-size:calc(var(--ui-display) * 1.15)}}
@media(prefers-reduced-motion:reduce){.ui-video-hero__media>video{transition:none}.ui-floating__item{transform:none!important}}
@media (max-width:820px){.ui-hero[data-variant=contained] .ui-hero__grid{grid-template-columns:1fr;gap:var(--ui-s5)}.ui-hero[data-variant=contained] .ui-hero__media img{max-height:360px}.ui-hero[data-variant=split] .ui-hero__grid,.ui-hero[data-variant=editorial] .ui-hero__grid{grid-template-columns:1fr;min-height:0}.ui-hero[data-variant=editorial] .ui-hero__copy,.ui-hero[data-variant=editorial] .ui-hero__media{grid-column:1/-1;transform:none}.ui-hero[data-variant=editorial] .ui-hero__media{aspect-ratio:3/2;max-height:none}.ui-hero[data-variant=split] .ui-hero__media{order:-1;aspect-ratio:4/5}}
.ui-showcase{position:relative;height:230vh}.ui-showcase__stage{position:sticky;top:0;height:100dvh;display:grid;place-items:center;overflow:clip}.ui-showcase__media{height:min(62dvh,700px);width:auto;max-width:86vw;aspect-ratio:var(--ui-aspect);border-radius:var(--ui-radius-media);overflow:hidden;will-change:transform;background:var(--ui-surface);box-shadow:var(--ui-shadow)}.ui-showcase__media img{width:100%;height:100%;object-fit:cover}.ui-showcase__copy{position:absolute;inset:auto 0 var(--ui-s6);text-align:center;padding-inline:16px}.ui-showcase__copy>*{margin-inline:auto}.ui-showcase__copy .ui-text{color:inherit}
.ui-showcase__veil{position:absolute;inset:0;background:linear-gradient(to top,color-mix(in srgb,var(--ui-paper) 92%,transparent),transparent 45%);pointer-events:none}
.ui-showcase[data-static]{height:auto}.ui-showcase[data-static] .ui-showcase__stage{position:relative;height:auto;padding-block:var(--ui-s7);gap:var(--ui-s5)}.ui-showcase[data-static] .ui-showcase__copy{position:static}.ui-showcase[data-static] .ui-showcase__veil{display:none}
.ui-showcase[data-copy] .ui-showcase__media{height:min(54dvh,620px)}.ui-showcase[data-copy] .ui-showcase__stage{place-items:start center;padding-top:max(136px,17dvh)}
@media (max-width:820px){.ui-showcase{height:170vh}.ui-showcase__media{height:auto;width:78vw}.ui-showcase[data-copy] .ui-showcase__media{height:auto;width:72vw}}
.ui-section-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:var(--ui-s4);margin-bottom:var(--ui-s6)}.ui-section-head[data-align=center]{flex-direction:column;align-items:center;text-align:center}.ui-section-head[data-align=center] .ui-h2,.ui-section-head[data-align=center] .ui-text{margin-inline:auto}
[data-ui-catalog]{--ui-cols:4}
[data-ui-catalog] .catalog-group+.catalog-group{margin-top:var(--ui-s7)}[data-ui-catalog] .catalog-group__title{font-family:var(--ui-display-font);font-weight:var(--ui-display-weight);font-size:calc(var(--ui-body) * 1.5);margin:0 0 var(--ui-s5)}
[data-ui-catalog] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items){display:grid!important;grid-template-columns:repeat(auto-fill,minmax(min(100%,calc((1240px - 3*var(--ui-s5))/var(--ui-cols))),1fr))!important;gap:var(--ui-s6) var(--ui-s5)!important;align-items:stretch!important}
[data-ui-catalog][data-layout=rail] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items){display:flex!important;overflow-x:auto;scroll-snap-type:x mandatory;gap:var(--ui-s4)!important;padding-bottom:var(--ui-s3);scrollbar-width:thin}
[data-ui-catalog][data-layout=rail] .menu-item{flex:0 0 min(78vw,340px);scroll-snap-align:start}
[data-ui-catalog][data-layout=editorial] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items){grid-template-columns:repeat(6,minmax(0,1fr))!important}[data-ui-catalog][data-layout=editorial] .menu-item{grid-column:span 2}[data-ui-catalog][data-layout=editorial] .menu-item:nth-child(5n+1),[data-ui-catalog][data-layout=editorial] .menu-item:nth-child(5n+2){grid-column:span 3}
[data-ui-catalog][data-layout=spotlight] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items){grid-template-columns:repeat(4,minmax(0,1fr))!important}[data-ui-catalog][data-layout=spotlight] .menu-item:first-child{grid-column:span 2;grid-row:span 2}[data-ui-catalog][data-layout=spotlight] .menu-item:first-child .ui-card__media{aspect-ratio:auto;flex:1}
[data-ui-catalog][data-layout=masonry] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items){display:block!important;columns:3 280px;column-gap:var(--ui-s5)}[data-ui-catalog][data-layout=masonry] .menu-item{break-inside:avoid;margin-bottom:var(--ui-s6)}[data-ui-catalog][data-layout=masonry] .menu-item:nth-child(3n+2) .ui-card__media{aspect-ratio:3/4}[data-ui-catalog][data-layout=masonry] .menu-item:nth-child(3n) .ui-card__media{aspect-ratio:1/1}
@media (max-width:820px){[data-ui-catalog] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items),[data-ui-catalog][data-layout=editorial] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items),[data-ui-catalog][data-layout=spotlight] :is([data-pagosya-grid]:not(:has(>.catalog-group)),.catalog-group__items){grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:var(--ui-s5) var(--ui-s3)!important}[data-ui-catalog][data-layout] .menu-item:nth-child(n){grid-column:auto;grid-row:auto}[data-ui-catalog][data-layout=spotlight] .menu-item:first-child{grid-column:1/-1}}
.ui-card{position:relative;display:flex;flex-direction:column;gap:var(--ui-s3);height:100%;color:inherit;padding:0!important}
.ui-card__media{position:relative;display:block;overflow:hidden;aspect-ratio:var(--ui-aspect);border-radius:var(--ui-radius-media);background:var(--ui-surface)}
.ui-card__media img{width:100%;height:100%;object-fit:cover;transition:transform var(--motion-slow,.9s) var(--motion-ease,var(--ui-ease))}
.ui-card__body{display:flex;flex-direction:column;gap:var(--ui-s1);margin-top:auto}
.ui-card__name{font-family:var(--ui-display-font);font-weight:var(--ui-display-weight);font-size:calc(var(--ui-body) * 1.05);line-height:1.25;margin:0}.ui-card__name :is(a,button){color:inherit;text-decoration:none;font:inherit;background:none;border:0;padding:0;text-align:inherit;cursor:pointer}.ui-card__name :is(a,button)::after{content:"";position:absolute;inset:0;z-index:1}
.ui-card__media:is(button){width:100%;padding:0;border:0;cursor:pointer}
.ui-card__price{font-variant-numeric:tabular-nums;font-weight:600;margin:0}.ui-card__meta{font-size:13px;color:var(--ui-ink-70);margin:0}
.ui-card__desc{font-size:14px;color:var(--ui-ink-70);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ui-card__add{position:relative;z-index:2;align-self:flex-start;min-height:44px;padding:0 var(--ui-s4);border:1px solid var(--ui-ink);border-radius:var(--kit-btn-radius,var(--ui-radius-control));background:transparent;color:var(--ui-ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background-color .2s,color .2s}.ui-card__add:hover:not(:disabled){background:var(--ui-ink);color:var(--ui-paper)}.ui-card__add:disabled{opacity:.45;cursor:default}
.ui-card[data-sold-out] .ui-card__media img{filter:grayscale(.6);opacity:.7}
.ui-card[data-card=overlay] .ui-card__body{position:absolute;inset:auto var(--ui-s3) var(--ui-s3);padding:var(--ui-s3) var(--ui-s4);border-radius:var(--ui-radius-control);background:color-mix(in srgb,var(--ui-paper) 90%,transparent);backdrop-filter:blur(10px)}.ui-card[data-card=overlay] .ui-card__body{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:var(--ui-s3)}.ui-card[data-card=overlay] .ui-card__body>:not(.ui-card__add){grid-column:1}.ui-card[data-card=overlay] .ui-card__add{grid-column:2;grid-row:1/span 4;align-self:center;background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-on-accent)}
.ui-card{container-type:inline-size}
@container (max-width:380px){.ui-card[data-card=overlay] .ui-card__body{grid-template-columns:1fr;row-gap:var(--ui-s1)}.ui-card[data-card=overlay] .ui-card__add{grid-column:1;grid-row:auto;justify-self:start;margin-top:var(--ui-s2)}}
@container (max-width:240px){.ui-card[data-card=overlay] .ui-card__body{position:static;padding:0;background:none;backdrop-filter:none}}
.ui-card[data-card=minimal] .ui-card__media{border-radius:0}.ui-card[data-card=minimal] .ui-card__body{flex-direction:row;flex-wrap:wrap;justify-content:space-between;gap:var(--ui-s1) var(--ui-s3)}.ui-card[data-card=minimal] .ui-card__name{flex:1 1 60%}.ui-card[data-card=minimal] .ui-card__add{border:0;padding:0;text-decoration:underline;text-underline-offset:.3em;background:none!important;color:inherit!important;flex-basis:100%}
.ui-card[data-card=framed]{padding:var(--ui-s3)!important;border:1px solid var(--ui-line);border-radius:calc(var(--ui-radius-media) + 6px);background:var(--ui-paper);transition:border-color .25s,box-shadow .25s}.ui-card[data-card=framed]:hover{border-color:var(--ui-ink-40);box-shadow:var(--ui-shadow)}.ui-card[data-card=framed] .ui-card__add{width:100%;background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-on-accent)}
.ui-card[data-card=caption] .ui-card__body{text-align:center;align-items:center}.ui-card[data-card=caption] .ui-card__name{font-style:var(--ui-subhead-style)}.ui-card[data-card=caption] .ui-card__add{align-self:center;border-radius:999px}
:root:not([data-dna-card=zoom]) [data-fx~=zoom] .ui-card:hover .ui-card__media img{transform:scale(1.06)}
[data-fx~=lift] .ui-card{transition:transform var(--motion-base,.35s) var(--motion-ease,var(--ui-ease))}:root:not([data-dna-card=tilt]) [data-fx~=lift] .ui-card:hover{transform:translateY(-6px)}
.ui-feature{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--ui-s7);align-items:center}.ui-feature[data-reverse] .ui-feature__media{order:2}.ui-feature__media{border-radius:var(--ui-radius-media);overflow:hidden;aspect-ratio:4/5;background:var(--ui-surface)}.ui-feature__media img{width:100%;height:100%;object-fit:cover}
@media (max-width:820px){.ui-feature{grid-template-columns:1fr;gap:var(--ui-s5)}.ui-feature[data-reverse] .ui-feature__media{order:0}}
.ui-chapters{display:grid;gap:var(--ui-s5)}.ui-chapter{position:sticky;top:calc(var(--ui-s6) + var(--i) * 18px);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--ui-s6);align-items:center;min-height:min(72dvh,640px);padding:var(--ui-s6);border:1px solid var(--ui-line);border-radius:calc(var(--ui-radius-media) + 8px);background:var(--ui-paper);box-shadow:var(--ui-shadow)}.ui-chapter:nth-child(even){background:var(--ui-surface)}.ui-chapter__media{aspect-ratio:4/3;border-radius:var(--ui-radius-media);overflow:hidden}.ui-chapter__media img{width:100%;height:100%;object-fit:cover}
@media (max-width:820px){.ui-chapter{position:relative;top:auto;grid-template-columns:1fr;padding:var(--ui-s4);min-height:0}}
.ui-marquee{overflow:hidden;border-block:1px solid var(--ui-line);padding-block:var(--ui-s4);font-family:var(--ui-display-font);font-size:clamp(22px,2.4vw,40px);font-style:var(--ui-subhead-style);white-space:nowrap}.ui-marquee__track{display:inline-flex;animation:ui-marquee var(--ui-marquee-duration,38s) linear infinite}.ui-marquee:hover .ui-marquee__track{animation-play-state:paused}.ui-marquee__item{display:inline-flex;align-items:center}.ui-marquee__item>span{display:inline-flex;align-items:center;gap:var(--ui-s6);padding-right:var(--ui-s6)}.ui-marquee__item>span::after{content:"✦";font-size:.5em;color:var(--ui-accent);font-style:normal}
@keyframes ui-marquee{to{transform:translateX(-50%)}}
.ui-statement{font-family:var(--ui-display-font);font-weight:var(--ui-display-weight);font-size:clamp(26px,3.4vw,56px);line-height:1.18;letter-spacing:-.015em;max-width:22ch;margin:0;text-wrap:balance}.ui-statement[data-align=center]{margin-inline:auto;text-align:center}
.ui-gallery{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--ui-s3)}.ui-gallery__item{margin:0;border-radius:var(--ui-radius-media);overflow:hidden;background:var(--ui-surface);grid-column:span 4;aspect-ratio:4/5}.ui-gallery__item img{width:100%;height:100%;object-fit:cover}.ui-gallery[data-variant=mosaic] .ui-gallery__item:nth-child(4n+1){grid-column:span 7;aspect-ratio:7/5}.ui-gallery[data-variant=mosaic] .ui-gallery__item:nth-child(4n+2){grid-column:span 5;aspect-ratio:1/1}.ui-gallery[data-variant=mosaic] .ui-gallery__item:nth-child(4n+3){grid-column:span 5;aspect-ratio:1/1}.ui-gallery[data-variant=mosaic] .ui-gallery__item:nth-child(4n){grid-column:span 7;aspect-ratio:7/5}
.ui-gallery[data-variant=strip]{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}.ui-gallery[data-variant=strip] .ui-gallery__item{flex:0 0 min(72vw,420px);scroll-snap-align:start}
@media (max-width:820px){.ui-gallery .ui-gallery__item,.ui-gallery[data-variant=mosaic] .ui-gallery__item:nth-child(n){grid-column:span 6;aspect-ratio:4/5}}
.ui-faq{border-top:1px solid var(--ui-line)}.ui-faq details{border-bottom:1px solid var(--ui-line)}.ui-faq summary{display:flex;justify-content:space-between;align-items:center;gap:var(--ui-s4);min-height:64px;cursor:pointer;list-style:none;font-family:var(--ui-display-font);font-size:calc(var(--ui-body) * 1.15)}.ui-faq summary::-webkit-details-marker{display:none}.ui-faq summary::after{content:"+";font-family:var(--ui-body-font);font-size:22px;transition:transform .3s var(--ui-ease)}.ui-faq details[open] summary::after{transform:rotate(45deg)}.ui-faq details>div{padding-bottom:var(--ui-s5)}
.ui-trust{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--ui-s4)}.ui-trust__item{display:flex;gap:var(--ui-s3);align-items:flex-start}.ui-trust__item strong{display:block;font-size:15px}.ui-trust__item span{font-size:14px;color:var(--ui-ink-70)}.ui-trust__mark{flex:0 0 36px;height:36px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--ui-accent) 14%,var(--ui-paper));color:var(--ui-accent)}
.ui-footer{background:var(--ui-ink);color:var(--ui-paper);padding-block:var(--ui-s7) var(--ui-s5);--ui-line:color-mix(in srgb,var(--ui-paper) 16%,var(--ui-ink))}.ui-footer[data-tone=paper]{background:var(--ui-paper);color:var(--ui-ink);border-top:1px solid var(--ui-line);--ui-line:color-mix(in srgb,var(--ui-ink) 14%,var(--ui-paper))}
.ui-footer__grid{display:grid;grid-template-columns:minmax(0,1.6fr) repeat(auto-fit,minmax(150px,1fr));gap:var(--ui-s6)}.ui-footer h2{font-size:12px;letter-spacing:var(--ui-tracking);text-transform:uppercase;font-weight:600;margin:0 0 var(--ui-s3);opacity:.7}.ui-footer ul{list-style:none;margin:0;padding:0;display:grid;gap:var(--ui-s2)}.ui-footer a{color:inherit;text-decoration:none;opacity:.88}.ui-footer a:hover{opacity:1;text-decoration:underline;text-underline-offset:.25em}.ui-footer__brand{font-family:var(--ui-display-font);font-size:clamp(28px,3vw,44px);line-height:1.05;margin:0 0 var(--ui-s3)}.ui-footer .ui-text{color:inherit;opacity:.8}.ui-footer__base{display:flex;flex-wrap:wrap;justify-content:space-between;gap:var(--ui-s3);margin-top:var(--ui-s7);padding-top:var(--ui-s4);border-top:1px solid var(--ui-line);font-size:13px;opacity:.72}
@media (max-width:820px){.ui-footer__grid{grid-template-columns:1fr 1fr}.ui-footer__grid>:first-child{grid-column:1/-1}}
.ui-footer__policies .pagosya-policies{margin:0}.ui-footer__policies button{color:inherit;font-size:13px}
.ui-product-page,.ui-checkout-page{min-height:60dvh}
/* Scroll-driven enhancements: pure CSS, so they also reach cards the commerce runtime injects.
   Browsers without view timelines keep the static, fully visible layout. */
@supports (animation-timeline: view()){
  @media (prefers-reduced-motion:no-preference){
    :root:not([data-ui-motion=off]) .ui-reveal{animation:ui-reveal linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
    :root:not([data-ui-motion=off]) [data-fx~=grow] .menu-item{animation:ui-grow linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
    :root:not([data-ui-motion=off]) [data-fx~=reveal] .menu-item{animation:ui-reveal linear both;animation-timeline:view();animation-range:entry 0% entry 60%}
    :root:not([data-ui-motion=off]) .ui-words>span{animation:ui-word linear both;animation-timeline:view();animation-range:cover 10% cover 45%}
    :root:not([data-ui-motion=off]) .ui-scroll-grow{animation:ui-grow-media linear both;animation-timeline:view();animation-range:entry 0% cover 50%}
  }
}
@keyframes ui-reveal{from{opacity:0;transform:translateY(var(--motion-distance,28px))}to{opacity:1;transform:none}}
@keyframes ui-grow{from{transform:scale(.86);opacity:.35}to{transform:none;opacity:1}}
@keyframes ui-grow-media{from{transform:scale(.8);border-radius:calc(var(--ui-radius-media) * 2.5)}to{transform:none}}
@keyframes ui-word{from{opacity:.38}to{opacity:1}}
.ui-header[data-menu=overlay] .ui-nav{display:none}
.ui-header[data-menu=overlay] .ui-header__bar{grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:auto}
.ui-header[data-menu=overlay] .ui-header__main{display:contents}
.ui-header[data-menu=overlay] .ui-brand{grid-column:2;grid-row:1;justify-self:center;text-align:center;padding-top:0}
.ui-header[data-menu=overlay] .ui-header__tools{grid-column:3;grid-row:1;justify-self:end}
.ui-header[data-menu=overlay] :is(.ui-overlay-trigger,.ui-menu){grid-column:1;grid-row:1}
.ui-header[data-menu=overlay] .ui-menu{display:block}
.ui-overlay-trigger,.ui-overlay-menu__bar button{font:inherit;color:inherit;background:none;border:0;min-height:44px;min-width:44px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:12px}
.ui-overlay-menu{position:fixed;inset:0;width:100%;max-width:none;height:100dvh;max-height:none;margin:0;border:0;padding:clamp(20px,4vw,64px);background:var(--ui-ink);color:var(--ui-paper);overflow:auto}
.ui-overlay-menu::backdrop{background:transparent}
.ui-overlay-menu__bar{display:flex;align-items:center;justify-content:space-between;gap:20px;font-family:var(--ui-body-font)}
.ui-overlay-menu nav{display:flex;flex-direction:column;justify-content:center;min-height:70%;padding-block:40px;gap:16px}
.ui-overlay-menu nav a{font-family:var(--ui-display-font);font-size:clamp(32px,8vw,128px);line-height:1.05;color:inherit;text-decoration:none;display:flex;align-items:baseline;justify-content:space-between;gap:20px;overflow-wrap:anywhere;border-bottom:1px solid color-mix(in srgb,currentColor 25%,transparent);padding-block:12px}
.ui-overlay-menu nav a span{font-size:.55em;flex-shrink:0}
.ui-overlay-menu :focus-visible,.ui-overlay-trigger:focus-visible{outline:2px solid currentColor;outline-offset:6px}
@media (prefers-reduced-motion:reduce){.ui-marquee__track{animation:none}.ui-button,.ui-card__media img{transition:none}}
:root[data-ui-motion=off] .ui-marquee__track{animation:none}
`;

/* ------------------------------------------------------------------ motion */

export type MotionPersonality = 'calm' | 'snappy' | 'playful' | 'cinematic';
type MotionTokenSet = { ease: string; settle: string; exit: string; settleExit: string; fast: number; base: number; slow: number; distance: number; stagger: number; parallax: number; press: number };
/**
 * The store's motion personality (html[data-dna-motion]) as numbers and curves: a mirror of MOTION_TOKENS in the
 * commerce runtime, which sets the same values as --motion-* tokens (a test pins both to the API's table). The mirror
 * serves code that runs before that runtime has loaded: React effects run before the deferred commerce.js.
 * ease/exit may overshoot (playful): transforms only; settle/settleExit never do.
 */
const MOTION_PERSONALITIES: Record<MotionPersonality, MotionTokenSet> = {
  calm: { ease: 'cubic-bezier(.25,.1,.25,1)', settle: 'cubic-bezier(.25,.1,.25,1)', exit: 'cubic-bezier(.4,0,1,1)', settleExit: 'cubic-bezier(.4,0,1,1)', fast: 180, base: 320, slow: 560, distance: 12, stagger: 70, parallax: .5, press: .98 },
  snappy: { ease: 'cubic-bezier(.2,.9,.2,1)', settle: 'cubic-bezier(.2,.9,.2,1)', exit: 'cubic-bezier(.4,0,.6,1)', settleExit: 'cubic-bezier(.4,0,.6,1)', fast: 120, base: 200, slow: 320, distance: 8, stagger: 35, parallax: .3, press: .96 },
  playful: { ease: 'cubic-bezier(.34,1.56,.64,1)', settle: 'cubic-bezier(.22,1,.36,1)', exit: 'cubic-bezier(.36,0,.66,-.56)', settleExit: 'cubic-bezier(.5,0,.75,0)', fast: 200, base: 360, slow: 600, distance: 18, stagger: 60, parallax: .8, press: .92 },
  cinematic: { ease: 'cubic-bezier(.16,1,.3,1)', settle: 'cubic-bezier(.16,1,.3,1)', exit: 'cubic-bezier(.7,0,.84,0)', settleExit: 'cubic-bezier(.7,0,.84,0)', fast: 260, base: 520, slow: 900, distance: 28, stagger: 110, parallax: 1.3, press: .98 },
};
const MOTION_VARS: Record<keyof MotionTokenSet, string> = { ease: '--motion-ease', settle: '--motion-ease-settle', exit: '--motion-ease-exit', settleExit: '--motion-ease-settle-exit', fast: '--motion-fast', base: '--motion-base', slow: '--motion-slow', distance: '--motion-distance', stagger: '--motion-stagger', parallax: '--motion-parallax', press: '--motion-press-scale' };
type MotionNumber = 'fast' | 'base' | 'slow' | 'distance' | 'stagger' | 'parallax' | 'press';
type MotionCurve = 'ease' | 'settle' | 'exit' | 'settleExit';

function motionPersonality(): MotionTokenSet | null {
  const name = document.documentElement.getAttribute('data-dna-motion')
    ?? (window as unknown as { PAGOSYA_CONFIG?: { dna?: { motion?: unknown } } }).PAGOSYA_CONFIG?.dna?.motion;
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(MOTION_PERSONALITIES, name) ? MOTION_PERSONALITIES[name as MotionPersonality] : null;
}
const motionVar = (name: keyof MotionTokenSet) => typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(MOTION_VARS[name]).trim() : '';
/**
 * A motion number (ms, px or a factor) for WAAPI and Motion code: the store's own --motion-* value, else its
 * personality's, else `fallback` — the use site's value for a store without a personality. Client-only (effects).
 */
export function motionToken(name: MotionNumber, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  const match = motionVar(name).match(/^(-?\d*\.?\d+)(ms|s|px)?$/);
  if (match) return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
  return motionPersonality()?.[name] ?? fallback;
}
/** A motion curve, resolved like motionToken. `ease` and `exit` may overshoot: use them on transforms only. */
export function motionEase(name: MotionCurve, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return motionVar(name) || motionPersonality()?.[name] || fallback;
}

/** True only when the shopper allows motion and the merchant has not switched it off. */
export function useUiMotion(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAllowed(!preference.matches && (window as unknown as { PAGOSYA_CONFIG?: { motion?: string } }).PAGOSYA_CONFIG?.motion !== 'off');
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return allowed;
}

function configuredScrollFeel(): ScrollFeel {
  const value = (window as unknown as { PAGOSYA_CONFIG?: { scrollFeel?: string } }).PAGOSYA_CONFIG?.scrollFeel;
  return value === 'native' || value === 'cinematic' ? value : 'soft';
}

/** Smooths wheel input while leaving touch, keyboard and programmatic navigation native. */
function useSmoothScroll(enabled: boolean): void {
  useEffect(() => {
    const feel = configuredScrollFeel();
    document.documentElement.dataset.uiScroll = enabled ? feel : 'native';
    if (!enabled || feel === 'native') return;
    if (document.querySelector('[data-pagosya-product-page],[data-pagosya-checkout-page]')) return;
    const pointer = window.matchMedia('(hover:hover) and (pointer:fine)');
    let cancelled = false;
    let loading = false;
    let lenis: { destroy(): void } | null = null;
    const clear = () => {
      lenis?.destroy(); lenis = null;
      delete document.documentElement.dataset.pagosyaSmoothScroll;
      document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-scrolling', 'lenis-stopped');
    };
    const shouldRun = () => pointer.matches && document.visibilityState === 'visible'
      && !document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]');
    const sync = async () => {
      if (!shouldRun()) { clear(); return; }
      if (lenis || loading) return;
      loading = true;
      try {
        const Lenis = (await import('lenis')).default;
        loading = false;
        if (cancelled || !shouldRun()) return;
        lenis = new Lenis({
          autoRaf: true,
          smoothWheel: true,
          syncTouch: false,
          lerp: feel === 'cinematic' ? 0.075 : 0.12,
          wheelMultiplier: feel === 'cinematic' ? 0.86 : 1,
          prevent: node => Boolean(node.closest('[data-lenis-prevent],dialog,[role="dialog"],[data-cart-panel],aside,form,textarea,select,input[type="range"],[data-pagosya-cart],[data-pagosya-checkout]')),
        });
        document.documentElement.dataset.pagosyaSmoothScroll = 'on';
      } catch {
        loading = false;
        clear();
      }
    };
    const observer = new MutationObserver(() => { void sync(); });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal'] });
    pointer.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    void sync();
    return () => {
      cancelled = true;
      observer.disconnect();
      pointer.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      clear();
    };
  }, [enabled]);
}

const EASE_FALLBACK = 'cubic-bezier(.22,1,.36,1)';
/** Resolves the theme's `--ui-ease` for WAAPI, which cannot read the cascade itself. */
function readUiEase(): string {
  if (typeof getComputedStyle !== 'function') return EASE_FALLBACK;
  return getComputedStyle(document.documentElement).getPropertyValue('--ui-ease').trim() || EASE_FALLBACK;
}

/**
 * Full-screen openings (a letter sweep, a curtain, a signature stroke, the store name flashed in the middle) are retired:
 * the owner asked for stores to open straight onto the page. The components stay exported so every store already
 * written with them still compiles; they render nothing.
 */
export function PageEntrance(_props: { variant?: 'letter' | 'curtain' | 'stroke' | 'wordmark'; mark?: string; duration?: number }) {
  return null;
}

/** Retired with PageEntrance: renders nothing. */
export function BrandEntrance(_props: { name: string; duration?: number }) {
  return null;
}

/** Retired with PageEntrance: renders nothing. */
export function SignatureStrokeEntrance(_props: { duration?: number }) {
  return null;
}

/**
 * Direct children (headline, copy, media — decorative only) lift and fade in one after another
 * on mount. Progressive enhancement: without JS, reduced motion, or motion off, children are
 * simply visible, since nothing here hides them by default.
 */
export function EntranceGroup({ children, delay = 0, stagger, className }: { children: ReactNode; delay?: number; stagger?: number; className?: string }) {
  const enabled = useUiMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.children) as HTMLElement[];
    if (!items.length || typeof items[0].animate !== 'function') return;
    const easing = readUiEase();
    // The store's motion personality sets the pace; an explicit stagger is the author's choice.
    const itemDuration = clamp(motionToken('base', 320), 120, 600, 320);
    const distance = clamp(motionToken('distance', 20), 0, 40, 20);
    const cap = 1000 - itemDuration - 1;
    const step = clamp(stagger ?? motionToken('stagger', 60), 0, 120, 60);
    const base = clamp(delay, 0, 600, 0);
    let anims: Animation[] = [];
    const play = () => {
      anims.forEach(a => a.cancel());
      anims = items.map((item, index) => item.animate(
        [{ transform: `translateY(${distance}px)`, opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }],
        { duration: itemDuration, delay: Math.min(base + index * step, cap), easing, fill: 'both' },
      ));
    };
    const scrolledPast = () => { const rect = root.getBoundingClientRect(); return window.scrollY > 0 && rect.top < window.innerHeight; };
    if (!scrolledPast()) play();
    const cancelAll = () => anims.forEach(a => a.cancel());
    window.addEventListener('keydown', cancelAll);
    window.addEventListener('pointerdown', cancelAll);
    const onReplay = () => { if (!scrolledPast()) play(); };
    window.addEventListener('pagosya:replay-motion', onReplay);
    return () => {
      cancelAll();
      window.removeEventListener('keydown', cancelAll);
      window.removeEventListener('pointerdown', cancelAll);
      window.removeEventListener('pagosya:replay-motion', onReplay);
    };
  }, [enabled, delay, stagger]);
  return <div ref={ref} className={className} data-ui-entrance-group="">{children}</div>;
}

/* ------------------------------------------------------------------ root */

/**
 * Wrap every page once. Emits the design system CSS and the store's tokens, which also theme
 * the shared cart, product page and checkout.
 */
/** Shared styling without installing another smooth-scroll controller in the sketch Shell. */
export function StoreStyles({ tokens }: { tokens: StoreTokens }) {
  return <style data-pagosya-ui="" dangerouslySetInnerHTML={{ __html: UI_CSS + SKETCH_CATALOG_CSS + themeCss(tokens) }} />;
}
export function StoreTheme({ tokens, children }: { tokens: StoreTokens; children: ReactNode }) {
  const motionOn = useUiMotion();
  useSmoothScroll(motionOn);
  useEffect(() => { document.documentElement.dataset.uiMotion = motionOn ? 'on' : 'off'; }, [motionOn]);
  return <div className="ui-root">
    <StoreStyles tokens={tokens} />
    <a className="ui-skip" href="#contenido">Ir al contenido</a>
    {children}
  </div>;
}


/** Structural catalog options share the platform template and inventory runtime. */
const SKETCH_CATALOG_CSS = `
[data-ui-catalog][data-presentation] .ui-card{border-radius:0;box-shadow:none;background:transparent;color:inherit}
[data-ui-catalog][data-presentation] .ui-card:has([data-product-media][hidden]) .ui-card__body{min-height:16rem;display:flex;flex-direction:column;justify-content:center}
[data-ui-catalog][data-presentation] .ui-card:has([data-product-media][hidden]) .ui-card__name{font-size:clamp(2rem,4vw,4rem)}
[data-ui-catalog][data-presentation] .ui-card__price{white-space:nowrap}
[data-ui-catalog][data-presentation] .ui-card__buy{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:1rem}
[data-ui-catalog][data-presentation] .ui-card__add{width:auto;min-width:44px;min-height:44px;flex:none;padding:.7rem 1rem;background:transparent;color:inherit;border:1px solid currentColor;border-radius:0}
[data-ui-catalog][data-presentation] .ui-card__name{font-size:clamp(1.25rem,2.7vw,3rem)}
[data-ui-catalog][data-presentation] .ui-card__body{padding:1.2rem 0}
[data-ui-catalog][data-presentation=two-up] [data-pagosya-grid]{grid-template-columns:repeat(2,minmax(0,1fr))!important}
[data-ui-catalog][data-presentation=rail] .menu-item{flex-basis:min(78vw,520px)}
[data-ui-catalog][data-presentation=index] [data-pagosya-grid]{display:block!important;counter-reset:product}
[data-ui-catalog][data-presentation=index] .menu-item{counter-increment:product;display:grid;grid-template-columns:3rem 1.3fr 1fr .9fr;align-items:center;gap:2rem;padding:2rem 0;border-top:1px solid currentColor}
.ui-card__number::before{content:counter(product,decimal-leading-zero)}
.ui-card__index-title{font:inherit;font-family:var(--ui-display-font);font-size:clamp(1.7rem,4vw,4.5rem);line-height:1.05;margin:0;text-transform:uppercase}
.ui-card__index-title a{color:inherit;text-decoration:none}
[data-ui-catalog][data-presentation=index] .ui-card__media{aspect-ratio:1/1}
[data-ui-catalog][data-presentation=spotlight] [data-pagosya-grid]{grid-template-columns:repeat(2,minmax(0,1fr))!important}
[data-ui-catalog][data-presentation=spotlight] .menu-item:first-child{grid-column:1/-1;grid-row:auto;display:grid;grid-template-columns:1.5fr 1fr;align-items:center;gap:clamp(1rem,5vw,5rem);border-bottom:1px solid currentColor;padding-bottom:3rem}
[data-ui-catalog][data-presentation=spotlight] .menu-item:first-child .ui-card__name{font-size:clamp(2.5rem,6vw,6rem)}
[data-ui-catalog][data-presentation=lookbook] [data-pagosya-grid]{display:block!important}
[data-ui-catalog][data-presentation=lookbook] .menu-item{display:grid;grid-template-columns:1.4fr 1fr;gap:clamp(2rem,8vw,8rem);align-items:center;margin-bottom:6rem}
[data-ui-catalog][data-presentation=lookbook] .menu-item:nth-child(even){grid-template-columns:1fr 1.4fr}
[data-ui-catalog][data-presentation=lookbook] .menu-item:nth-child(even) .ui-card__media{order:2}
[data-ui-catalog][data-presentation=lookbook] .ui-card__name{font-size:clamp(2rem,5vw,5rem)}
[data-ui-catalog][data-presentation=asymmetric] .menu-item:nth-child(3n+2){padding-top:6rem}
[data-ui-catalog][data-presentation=asymmetric] .menu-item:nth-child(3n) .ui-card__media{aspect-ratio:1/1}
@media(max-width:820px){
[data-ui-catalog][data-presentation=index] .menu-item{grid-template-columns:2rem 1fr 1fr;gap:1rem}
[data-ui-catalog][data-presentation=index] .ui-card__body{grid-column:2/-1}
[data-ui-catalog][data-presentation=lookbook] .menu-item:nth-child(n),[data-ui-catalog][data-presentation=spotlight] .menu-item:first-child{display:block;margin-bottom:2rem}
[data-ui-catalog][data-presentation=lookbook] .menu-item:nth-child(even) .ui-card__media{order:initial}
[data-ui-catalog][data-presentation=asymmetric] .menu-item:nth-child(n){padding-top:0}
}
@media(max-width:599px){[data-ui-catalog][data-presentation=two-up] [data-pagosya-grid],[data-ui-catalog][data-presentation=spotlight] [data-pagosya-grid]{grid-template-columns:1fr!important}}
`;

/* ------------------------------------------------------------------ primitives */

type Width = 'narrow' | 'default' | 'wide' | 'full';
type Tone = 'paper' | 'surface' | 'ink' | 'accent';
export function Container({ width = 'default', className, children }: { width?: Width; className?: string; children?: ReactNode }) {
  return <div className={['ui-container', className].filter(Boolean).join(' ')} data-width={width === 'default' ? undefined : width}>{children}</div>;
}
export function Section({ id, tone = 'paper', space = 'md', width = 'default', reveal = false, className, children, label }: {
  id?: string; tone?: Tone; space?: 'none' | 'sm' | 'md' | 'lg'; width?: Width; reveal?: boolean; className?: string; children?: ReactNode; label?: string;
}) {
  return <section id={id} aria-label={label} className={['ui-section', reveal ? 'ui-reveal' : '', className].filter(Boolean).join(' ')} data-tone={tone === 'paper' ? undefined : tone} data-space={space === 'md' ? undefined : space}>
    <Container width={width}>{children}</Container>
  </section>;
}
export function Eyebrow({ children }: { children: ReactNode }) { return <p className="ui-eyebrow">{children}</p>; }
export function Display({ children, as = 'h1', className }: { children: ReactNode; as?: 'h1' | 'h2' | 'p'; className?: string }) {
  const Tag = as; return <Tag className={['ui-display', className].filter(Boolean).join(' ')}>{children}</Tag>;
}
export function Heading({ children, as = 'h2', size = 'h2', className }: { children: ReactNode; as?: 'h2' | 'h3' | 'p'; size?: 'h2' | 'h3'; className?: string }) {
  const Tag = as; return <Tag className={[size === 'h3' ? 'ui-h3' : 'ui-h2', className].filter(Boolean).join(' ')}>{children}</Tag>;
}
export function Lead({ children }: { children: ReactNode }) { return <p className="ui-lead">{children}</p>; }
export function Text({ children, muted = false }: { children: ReactNode; muted?: boolean }) { return <p className={muted ? 'ui-text ui-muted' : 'ui-text'}>{children}</p>; }
export function Hairline() { return <hr className="ui-hairline" />; }
export function Badge({ children }: { children: ReactNode }) { return <span className="ui-badge">{children}</span>; }
// Stores that never mount StoreTheme have no --ui-* tokens: the art then takes the text colour instead of vanishing.
const ILLUSTRATION_TONES: Record<string, string> = { ink: 'var(--ui-ink, currentColor)', accent: 'var(--ui-accent, currentColor)', onAccent: 'var(--ui-on-accent, currentColor)', paper: 'var(--ui-paper, currentColor)', surface: 'var(--ui-surface, currentColor)' };
/** A picture from the illustration library (assets/creative/…). Store-colour art (fluent-mono, motif packs) is painted
 * in a store colour through a CSS mask; colour art is a plain image. Decorative unless a label is given. */
export function Illustration({ src, tone = 'accent', size = 96, label, className }: { src: string; tone?: 'ink' | 'accent' | 'onAccent' | 'paper' | 'surface' | (string & {}); size?: number; label?: string; className?: string }) {
  // Only a library path goes into a CSS url(); anything else (or anything with quotes or brackets) is a plain image.
  if (!/^\/?assets\/creative\/(?:fluent-mono|motif-[a-z0-9-]+)\/[a-z0-9-]+\.svg$/.test(src)) return <img className={className} src={src} alt={label || ''} aria-hidden={label ? undefined : true} width={size} height={size} />;
  const mask = `url("${src}") center / contain no-repeat`;
  return <span className={['ui-illustration', className].filter(Boolean).join(' ')} data-illustration={src} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    style={{ display: 'inline-block', width: size, height: size, flex: 'none', backgroundColor: ILLUSTRATION_TONES[tone] ?? tone, WebkitMask: mask, mask }} />;
}
/** The body of a standard store page that has no content yet. Only tests use it: a customer must never see it, so no
 * store gets a page file until the sub-project that owns that page replaces this with real content. */
export function StandardPagePlaceholder({ title }: { title: string }) {
  return <main id="contenido" className="ui-standard-page" data-standard-page>
    <Container><Display>{title}</Display><Lead>Esta página se completa pronto.</Lead></Container>
  </main>;
}
export type InfoPageKind = 'about' | 'contact' | 'shipping' | 'faq' | 'refund' | 'privacy' | 'terms' | 'cookies' | 'notfound' | 'collections' | 'search';
// These pages also live inside custom Shells that do not mount StoreTheme. Keep their
// layout self-contained and scoped, inheriting the store's colors and type tokens.
const STANDARD_PAGE_CSS = `
.ui-info-page,.ui-account-gate{box-sizing:border-box;min-height:45vh;padding-block:clamp(40px,6vw,88px);color:inherit;font-family:inherit}
:where(.ui-info-page,.ui-account-gate) > .ui-container{box-sizing:border-box;width:calc(100% - 48px);max-width:1120px;margin-inline:auto}
:where(.ui-info-page,.ui-account-gate) .ui-display{max-width:22ch;margin:0 0 28px;font-family:var(--store-heading-font,var(--brand-heading-font,inherit));font-size:clamp(32px,4.5vw,60px);font-weight:var(--ui-display-weight,700);line-height:1.08;letter-spacing:-.025em;text-wrap:balance}
.ui-info-page [data-pagosya-page]{max-width:72ch;font-size:clamp(16px,1.2vw,18px);line-height:1.75;overflow-wrap:anywhere}
.ui-info-page [data-pagosya-page=collections],.ui-info-page [data-pagosya-page=search]{max-width:none}
.ui-info-page [data-pagosya-page] :is(p,ul,ol,dl){margin:0 0 1.25em}
.ui-info-page [data-pagosya-page] :is(h2,h3){font:inherit;font-family:var(--store-heading-font,inherit);font-weight:700;font-size:1.4em;line-height:1.25;margin:1.8em 0 .6em}
.ui-info-page [data-pagosya-page] :is(ul,ol){padding-inline-start:1.4em}.ui-info-page [data-pagosya-page] li+li{margin-top:.5em}
.ui-info-page [data-pagosya-page] a:not([class]){text-decoration:underline;text-underline-offset:.2em}
.ui-account-gate .ui-lead{font:inherit;font-size:clamp(17px,1.4vw,21px);line-height:1.6;color:inherit;max-width:48ch;margin:0 0 32px}
.ui-account-gate .ui-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:48px;max-width:100%;padding:14px 24px;font:inherit;font-weight:700;line-height:1.3;text-align:center;text-decoration:none;border:1px solid currentColor;border-radius:var(--store-radius,var(--ui-radius-control,4px));background:var(--store-accent,var(--brand-accent,#1d1b18));color:var(--store-accent-foreground,var(--brand-accent-foreground,#fff));cursor:pointer}
.ui-account-gate .ui-button[aria-disabled=true]{opacity:.55;cursor:default}.ui-account-gate .ui-button:focus-visible{outline:3px solid currentColor;outline-offset:4px}
@media(max-width:600px){:where(.ui-info-page,.ui-account-gate) > .ui-container{width:calc(100% - 32px)}.ui-account-gate .ui-button{width:100%}}
`;
const INFO_PAGE_TITLES: Record<InfoPageKind, string> = {
  about: 'Nosotros', contact: 'Contacto', shipping: 'Envíos y entregas', faq: 'Preguntas frecuentes', refund: 'Cambios y devoluciones',
  privacy: 'Privacidad', terms: 'Términos y condiciones', cookies: 'Cookies y almacenamiento', notfound: 'Página no encontrada',
  collections: 'Colecciones', search: 'Buscar',
};
/** A store information page: a title and the runtime's empty mount, which fills it from the live store (commerce.js,
 * `renderInfoPages`). Never put children in the mount: the runtime owns it. `children` (a store's own sections, spec 2026-11-05)
 * go between the title and the mount, full width. */
export function InfoPage({ kind, children }: { kind: InfoPageKind; children?: ReactNode }) {
  return <main id="contenido" className="ui-info-page" data-info-page={kind}>
    <style data-pagosya-standard-pages="" dangerouslySetInnerHTML={{ __html: STANDARD_PAGE_CSS }} />
    <Container><Display>{INFO_PAGE_TITLES[kind]}</Display></Container>
    {children}
    <Container><div data-pagosya-page={kind} /></Container>
  </main>;
}

export type AccountGateView = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'orders' | 'addresses' | 'profile' | 'subscriptions';
const ACCOUNT_GATE_COPY: Record<AccountGateView, { title: string; lead: string; action: string }> = {
  login: { title: 'Ingresa a tu cuenta', lead: 'Revisa tus pedidos y guarda tus datos para comprar más rápido.', action: 'Ingresar' },
  register: { title: 'Crea tu cuenta', lead: 'Con una cuenta sigues tus pedidos y guardas tus direcciones.', action: 'Crear cuenta' },
  'forgot-password': { title: 'Recupera tu contraseña', lead: 'Te enviamos un enlace a tu correo para elegir una contraseña nueva.', action: 'Recuperar contraseña' },
  'reset-password': { title: 'Elige una contraseña nueva', lead: 'Pide un enlace a tu correo y desde ahí eliges la contraseña nueva.', action: 'Pedir un enlace' },
  orders: { title: 'Mis pedidos', lead: 'Mira el estado y el detalle de tus compras.', action: 'Ver mis pedidos' },
  addresses: { title: 'Mis direcciones', lead: 'Guarda y cambia las direcciones donde recibes tus pedidos.', action: 'Ver mis direcciones' },
  profile: { title: 'Mi perfil', lead: 'Cambia tus datos, descarga tu información o elimina tu cuenta.', action: 'Ver mi perfil' },
  subscriptions: { title: 'Mis suscripciones', lead: 'Revisa y administra tus entregas recurrentes.', action: 'Ver mis suscripciones' },
};
/** The account page's slot: the store runtime draws the sign-in, sign-up and account views here, styled by the store, where a
 * trusted parent answers its account bridge (spec 2026-10-08). Static exports keep the account-link fallback below. */
export function AccountGatePage({ view }: { view: AccountGateView }) {
  const copy = ACCOUNT_GATE_COPY[view];
  return <main id="contenido" className="ui-account-gate" data-account-gate={view}>
    <style data-pagosya-standard-pages="" dangerouslySetInnerHTML={{ __html: STANDARD_PAGE_CSS }} />
    <Container><Display>{copy.title}</Display><Lead>{copy.lead}</Lead>
      <a className="ui-button" data-variant="solid" href="#" data-pagosya-account={view}>{copy.action}</a></Container>
  </main>;
}
export function Button({ href, children, variant = 'solid', size = 'md', onClick, type = 'button' }: {
  href?: string; children: ReactNode; variant?: 'solid' | 'outline' | 'ghost' | 'link'; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; type?: 'button' | 'submit';
}) {
  return href
    ? <a className="ui-button" data-variant={variant} data-size={size === 'md' ? undefined : size} href={href}>{children}</a>
    : <button className="ui-button" data-variant={variant} data-size={size === 'md' ? undefined : size} type={type} onClick={onClick}>{children}</button>;
}
export type Img = { src: string; alt: string; position?: string; fit?: 'cover' | 'contain'; sketchPhoto?: string; sketchNode?: string; sketchFree?: { x: number; y: number; w?: number; r?: number } };
function sketchFreeStyle(free?: Img['sketchFree']): CSSProperties {
  if (!free) return {};
  return Object.fromEntries([['--skb-fx', free.x], ['--skb-fy', free.y], ['--skb-fw', free.w], ['--skb-fr', free.r]].filter(([, value]) => typeof value === 'number' && Number.isFinite(value)).map(([key, value]) => [key, String(value)])) as CSSProperties;
}
function Picture({ image, eager = false }: { image?: Img; eager?: boolean }) {
  if (!image?.src) return null;
  return <img data-skb-photo={image.sketchPhoto} data-skb-node={image.sketchNode} data-skb-free={image.sketchFree ? 'on' : undefined} src={image.src} alt={image.alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" style={{ objectPosition: image.position, objectFit: image.fit, ...sketchFreeStyle(image.sketchFree) }} />;
}

/* ------------------------------------------------------------------ commerce chrome */

/** Opens the shared cart. The count is filled in by the commerce runtime. */
export function CartButton({ label = 'Pedido' }: { label?: string }) {
  return <button type="button" className="ui-cart" data-cart-open aria-label={`Abrir ${label.toLowerCase()}`}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
    <span className="ui-cart__label">{label}</span><span data-cart-count />
  </button>;
}
/** Required once per page that sells: the cart drawer and the live status line. */
export function CommerceSlots() {
  return <><div data-pagosya-cart hidden /><p data-pagosya-status role="status" aria-live="polite" /></>;
}
/* T1 kit templates: author the markup of a kit surface; the commerce runtime fills the slots. Prices, totals,
 * stock, options and checkout stay platform-owned. Each template needs one root element and its required slots:
 * product page gallery/title/pricing/buy; cart lines/total/action plus a button[data-cart-close]; cart line
 * name/line-total/quantity; added notice message plus a button[data-cart-open]; review summary/fields. */
export function ProductPageTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-product-page-template>{children}</template>; }
export function CartTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-cart-template>{children}</template>; }
export function CartLineTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-cart-line-template>{children}</template>; }
export function AddedTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-added-template>{children}</template>; }
export function ReviewTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-review-template>{children}</template>; }
const KIT_SLOT_ATTRIBUTE = { product: 'data-product-slot', cart: 'data-cart-slot', line: 'data-cart-field', added: 'data-added-field', review: 'data-review-slot' } as const;
export function KitSlot({ kind, name, as = 'div', className, children }: { kind: keyof typeof KIT_SLOT_ATTRIBUTE; name: string; as?: keyof JSX.IntrinsicElements; className?: string; children?: ReactNode }) {
  const Tag = as as any;
  return <Tag className={className} {...{ [KIT_SLOT_ATTRIBUTE[kind]]: name }}>{children}</Tag>;
}
export function AnnouncementBar({ children }: { children: ReactNode }) { return <div className="ui-announcement">{children}</div>; }

export type NavLink = { label: string; href: string };
function OverlayMenu({ links, name }: { links: NavLink[]; name: string }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const animation = useRef<Animation | null>(null);
  const enabled = useUiMotion();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setReady(typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function'); }, []);
  useEffect(() => { if (!enabled) animation.current?.finish(); }, [enabled]);
  useEffect(() => () => { animation.current?.cancel(); dialog.current?.close(); }, []);
  const close = (animate: boolean) => {
    const el = dialog.current;
    if (!el?.open) return;
    animation.current?.cancel();
    const finish = () => { el.close(); setOpen(false); trigger.current?.focus({ preventScroll: true }); };
    if (animate && enabled && typeof el.animate === 'function') {
      const current = el.animate([{ transform: 'translateY(0%)' }, { transform: 'translateY(-100%)' }], { duration: clamp(motionToken('fast', 220), 80, 400, 220), easing: motionEase('settleExit', readUiEase()), fill: 'forwards' });
      animation.current = current;
      current.finished.then(() => { finish(); current.cancel(); }).catch(() => {});
    } else finish();
  };
  if (!ready) return <details className="ui-menu"><summary>Menú</summary><div className="ui-menu__panel">{links.map(link => <a key={link.href + link.label} href={link.href}>{link.label}</a>)}</div></details>;
  return <>
    <button ref={trigger} type="button" className="ui-overlay-trigger" aria-haspopup="dialog" aria-controls={id} aria-expanded={open} onClick={event => {
      const el = dialog.current;
      if (!el || el.open) return;
      animation.current?.cancel(); el.showModal(); setOpen(true);
      if (enabled && event.detail > 0 && typeof el.animate === 'function') animation.current = el.animate([{ transform: 'translateY(-100%)' }, { transform: 'translateY(0%)' }], { duration: clamp(motionToken('base', 240), 120, 400, 240), easing: readUiEase() });
    }}>Menú <span aria-hidden="true">☰</span></button>
    <dialog ref={dialog} id={id} className="ui-overlay-menu" aria-label={`Menú de ${name}`} onCancel={event => { event.preventDefault(); close(false); }} onClose={() => setOpen(false)} onKeyDown={() => animation.current?.finish()}>
      <div className="ui-overlay-menu__bar"><span>{name}</span><button type="button" autoFocus onClick={event => close(event.detail > 0)}>Cerrar <span aria-hidden="true">×</span></button></div>
      <nav aria-label="Principal">{links.map(link => <a key={link.href + link.label} href={link.href} onClick={() => close(false)}>{link.label}<span aria-hidden="true">↗</span></a>)}</nav>
    </dialog>
  </>;
}
export function SiteHeader({ name, tagline, logo, links = [], variant = 'classic', sticky = true, cartLabel = 'Pedido', menu = 'panel' }: {
  name: string; tagline?: string; logo?: Img; links?: NavLink[]; variant?: 'classic' | 'centered' | 'split' | 'floating'; sticky?: boolean; cartLabel?: string; menu?: 'panel' | 'overlay';
}) {
  const brand = <a className="ui-brand" href="index.html">{logo?.src ? <img src={logo.src} alt={logo.alt || name} /> : <span className="ui-brand__name">{name}</span>}{tagline ? <span className="ui-brand__tag">{tagline}</span> : null}</a>;
  const nav = <nav className="ui-nav" aria-label="Principal">{links.map(link => <a key={link.href + link.label} href={link.href}>{link.label}</a>)}</nav>;
  return <header className="ui-header" data-menu={menu} data-variant={variant === 'classic' ? undefined : variant} data-sticky={sticky && variant !== 'floating' ? '' : undefined}>
    <div className="ui-container ui-header__bar">
      {menu === 'overlay' ? <OverlayMenu links={links} name={name} /> : <details className="ui-menu"><summary aria-label="Menú"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></summary><div className="ui-menu__panel">{links.map(link => <a key={link.href + link.label} href={link.href}>{link.label}</a>)}</div></details>}
      {variant === 'classic' || variant === 'floating' ? <div className="ui-header__main">{brand}{nav}</div> : <>{brand}{nav}</>}
      <div className="ui-header__tools"><CartButton label={cartLabel} /></div>
    </div>
  </header>;
}

/* ------------------------------------------------------------------ sections */

export function Hero({ variant, eyebrow, title, lead, image, actions, copy: customCopy, media: customMedia, scrollGrow = false, entrance = false }: {
  variant?: 'contained' | 'split' | 'fullbleed' | 'editorial' | 'typographic'; eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; image?: Img; actions?: ReactNode;
  copy?: ReactNode; media?: ReactNode;
  /** The image grows into place as it scrolls into view. */ scrollGrow?: boolean; entrance?: boolean;
}) {
  const media = customMedia ?? (image?.src ? <div className={['ui-hero__media', scrollGrow ? 'ui-scroll-grow' : ''].filter(Boolean).join(' ')}><Picture image={image} eager /></div> : null);
  // With unknown image dimensions, preserve the photograph instead of assuming
  // a wide crop is suitable. Explicit art-directed variants remain available.
  const shape = media ? variant || 'contained' : 'typographic';
  const Copy = entrance ? EntranceGroup : 'div';
  const copy = customCopy ?? <Copy className="ui-hero__copy">
    {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
    <Display>{title}</Display>
    {lead ? <Lead>{lead}</Lead> : null}
    {actions ? <div className="ui-row ui-hero__actions">{actions}</div> : null}
  </Copy>;
  if (shape === 'fullbleed') return <section className="ui-hero" data-variant="fullbleed">{media}<div className="ui-container">{copy}</div></section>;
  if (shape === 'typographic') return <section className="ui-hero" data-variant="typographic"><div className="ui-container">{copy}{media}</div></section>;
  return <section className="ui-hero" data-variant={shape}><div className="ui-container ui-hero__grid">{copy}{media}</div></section>;
}

/** A real optional video, always backed by a real poster. Decorative footage only; narration belongs in an accessible player. */
export function VideoHero({ poster, src, eyebrow, title, lead, actions, entrance = false }: {
  poster: Img; src?: string; eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; actions?: ReactNode; entrance?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const enabled = useUiMotion();
  const [saveData, setSaveData] = useState(true);
  const [intent, setIntent] = useState<'auto' | 'play' | 'pause'>('auto');
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setSaveData(Boolean(connection?.saveData));
  }, []);
  useEffect(() => { setFailed(false); setIntent('auto'); setPlaying(false); }, [src]);
  const shouldPlay = Boolean(src && !failed && (intent === 'play' || (intent === 'auto' && enabled && !saveData)));
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!shouldPlay) { video.pause(); return; }
    let current = true;
    video.play().catch(() => { if (current) { setPlaying(false); setIntent('pause'); } });
    return () => { current = false; video.pause(); };
  }, [shouldPlay, src]);
  const Copy = entrance ? EntranceGroup : 'div';
  return <section className="ui-video-hero">
    <div className="ui-video-hero__media">
      <Picture image={poster} eager />
      {shouldPlay || playing ? <video ref={ref} key={src} src={src} poster={poster.src} muted loop playsInline preload="none"
        data-pagosya-video-managed="" aria-hidden="true" tabIndex={-1} data-playing={playing ? '' : undefined}
        style={poster.position ? { objectPosition: poster.position } : undefined}
        onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false); }} /> : null}
    </div>
    <div className="ui-container"><Copy className="ui-video-hero__copy">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}<Display>{title}</Display>
      {lead ? <Lead>{lead}</Lead> : null}{actions ? <div className="ui-row ui-hero__actions">{actions}</div> : null}
    </Copy></div>
    {src && !failed ? <button type="button" className="ui-video-hero__control" onClick={() => setIntent(shouldPlay ? 'pause' : 'play')}>
      {shouldPlay ? 'Pausar video' : 'Reproducir video'}
    </button> : null}
  </section>;
}

function FloatingImage({ image, index, progress, enabled }: { image: Img; index: number; progress: ReturnType<typeof useScroll>['scrollYProgress']; enabled: boolean }) {
  const distance = index === 0 ? 18 : index % 2 ? -28 : 32;
  const transform = useTransform(progress, [0, 1], [`translateY(${distance}px)`, `translateY(${-distance}px)`]);
  return <motion.div className="ui-floating__item" style={{ transform: enabled ? transform : 'none' }}>
    <figure className="ui-floating__frame"><Picture image={image} eager={index === 0} /></figure>
  </motion.div>;
}

/** A coordinated photograph composition; copy stays still and every image remains visible on mobile. */
export function FloatingMedia({ images, eyebrow, title, lead, actions, copy, sketch = false, mediaFree, motion: animate = true, entrance = false }: {
  images: Img[]; eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; actions?: ReactNode; copy?: ReactNode; sketch?: boolean; mediaFree?: Img['sketchFree']; motion?: boolean; entrance?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const enabled = useUiMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const available = images.filter(image => image?.src).slice(0, 5);
  const Copy = entrance ? EntranceGroup : 'div';
  return <section ref={ref} className="ui-floating"><div className="ui-container ui-floating__grid">
    {copy ?? <Copy className="ui-floating__copy">{eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}<Display>{title}</Display>
      {lead ? <Lead>{lead}</Lead> : null}{actions ? <div className="ui-row ui-hero__actions">{actions}</div> : null}
    </Copy>}
    {available.length ? <div className="ui-floating__stage" data-skb-group={sketch ? 'media' : undefined} data-skb-free={mediaFree ? 'on' : undefined} style={sketchFreeStyle(mediaFree)}>{available.map((image, index) =>
      <FloatingImage key={image.src + index} image={image} index={index} progress={scrollYProgress} enabled={enabled && animate} />)}</div> : null}
  </div></section>;
}

/** Two or three approved photographs move at bounded opposing depths around a stable stage. */
export function ParallaxStack({ images, strength = 54, className }: { images: Img[]; strength?: number; className?: string }) {
  const available = images.filter(image => image?.src).slice(0, 3);
  const limit = clamp(strength, 20, 100, 54);
  return <div className={['ui-parallax-stack', className].filter(Boolean).join(' ')}>
    {available.map((image, index) => <Parallax key={image.src + index} strength={index === 0 ? limit : index === 1 ? -limit * .72 : limit * .55}>
      <figure><Picture image={image} eager={index === 0} /></figure>
    </Parallax>)}
  </div>;
}

/** A sticky native-media scene. Video seeks with scroll on desktop; poster and copy remain complete everywhere. */
export function ScrollScrubHero({ poster, src, eyebrow, title, lead, actions }: {
  poster: Img; src?: string; eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; actions?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const enabled = useUiMotion();
  const [desktop, setDesktop] = useState(false);
  const [ready, setReady] = useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const mediaY = useTransform(scrollYProgress, [0, 1], ['0%', '10%']);
  const mediaScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  useEffect(() => {
    const mq = window.matchMedia('(min-width:821px)');
    const update = () => setDesktop(mq.matches);
    update(); mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const active = enabled && desktop;
  useEffect(() => {
    if (!active || !src) return;
    let frame = 0;
    const unsubscribe = scrollYProgress.on('change', progress => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(video.duration - .04, Math.max(0, progress * video.duration));
      });
    });
    return () => { cancelAnimationFrame(frame); unsubscribe(); };
  }, [active, src, scrollYProgress]);
  return <section ref={ref} className="ui-scroll-hero" data-static={active ? undefined : ''}>
    <div className="ui-scroll-hero__stage">
      <motion.div className="ui-scroll-hero__media" style={{ y: active ? mediaY : 0, scale: active ? mediaScale : 1 }}>
        <Picture image={poster} eager />
        {active && src ? <video ref={videoRef} src={src} poster={poster.src} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} data-ready={ready ? '' : undefined} onLoadedData={() => setReady(true)} onError={() => setReady(false)} /> : null}
      </motion.div>
      <div className="ui-container ui-scroll-hero__copy"><EntranceGroup>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}<Display>{title}</Display>
        {lead ? <Lead>{lead}</Lead> : null}{actions ? <div className="ui-row ui-hero__actions">{actions}</div> : null}
      </EntranceGroup></div>
    </div>
  </section>;
}

/** Compare two supplied images without invented results. Native range supports touch and keyboard without custom drag traps. */
export function BeforeAfter({ before, after, label, beforeLabel = 'Antes', afterLabel = 'Después', initial = 50, aspect = '4/5' }: {
  before: Img; after: Img; label: string; beforeLabel?: string; afterLabel?: string; initial?: number; aspect?: CardAspect;
}) {
  const [position, setPosition] = useState(() => clamp(initial, 0, 100, 50));
  return <figure className="ui-compare" style={{ '--ui-compare-position': `${position}%`, '--ui-compare-aspect': ASPECTS.includes(aspect) ? aspect : '4/5' } as CSSProperties}>
    <div className="ui-compare__stage">
      <Picture image={after} />
      <img className="ui-compare__before" src={before.src} alt={before.alt} loading="lazy" decoding="async" style={before.position ? { objectPosition: before.position } : undefined} />
      <span className="ui-compare__divider" aria-hidden="true" />
    </div>
    <figcaption className="ui-compare__caption"><span className="ui-compare__label">{label}</span>
      <div className="ui-compare__labels" aria-hidden="true"><span>{beforeLabel}</span><span>{afterLabel}</span></div>
      <input className="ui-compare__range" type="range" min="0" max="100" step="1" value={position} aria-label={label}
        aria-valuetext={`${position}% ${beforeLabel}, ${100 - position}% ${afterLabel}`} onChange={event => setPosition(Number(event.currentTarget.value))} />
      <p className="ui-compare__hint">Desliza para comparar. También puedes usar las flechas del teclado.</p>
    </figcaption>
  </figure>;
}

/**
 * The signature product moment: the section pins while the product photograph grows from a
 * small framed object to fill the stage. Static and fully visible without motion.
 */
export function ProductShowcase({ image, eyebrow, title, body, action, from = 0.56, to = 1.04 }: {
  image: Img; eyebrow?: ReactNode; title?: ReactNode; body?: ReactNode; action?: ReactNode; from?: number; to?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const enabled = useUiMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const start = Math.min(1, Math.max(0.3, from)), end = Math.min(1.2, Math.max(start, to));
  const scale = useTransform(scrollYProgress, [0, 0.62], [start, end]);
  const radius = useTransform(scrollYProgress, [0, 0.62], [36, 0]);
  const copyOpacity = useTransform(scrollYProgress, [0.52, 0.8], [0, 1]);
  const copyY = useTransform(scrollYProgress, [0.52, 0.8], [24, 0]);
  const hasCopy = Boolean(title || body || action);
  const copy = <>
    {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
    {title ? <Heading>{title}</Heading> : null}
    {body ? <p className="ui-text" style={{ marginTop: 'var(--ui-s3)' }}>{body}</p> : null}
    {action ? <div className="ui-row" style={{ justifyContent: 'center', marginTop: 'var(--ui-s4)' }}>{action}</div> : null}
  </>;
  return <section ref={ref} className="ui-showcase" data-static={enabled ? undefined : ''} data-copy={hasCopy ? '' : undefined} aria-label={typeof title === 'string' ? title : undefined}>
    <div className="ui-showcase__stage">
      <motion.div className="ui-showcase__media" style={{ scale: enabled ? scale : 1, borderRadius: enabled ? radius : 'var(--ui-radius-media)' }}><Picture image={image} /></motion.div>
      {hasCopy && enabled ? <motion.div className="ui-showcase__veil" style={{ opacity: copyOpacity }} /> : null}
      {hasCopy ? <motion.div className="ui-showcase__copy" style={{ opacity: enabled ? copyOpacity : 1, y: enabled ? copyY : 0 }}>{copy}</motion.div> : null}
    </div>
  </section>;
}

/** Any content grows from `from` to full size as it scrolls into view. */
export function ScrollScale({ children, from = 0.82, className }: { children: ReactNode; from?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useUiMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const scale = useTransform(scrollYProgress, [0, 1], [Math.min(1, Math.max(0.5, from)), 1]);
  return <motion.div ref={ref} className={className} style={{ scale: enabled ? scale : 1 }}>{children}</motion.div>;
}
/** Content drifts against the scroll by up to `strength` px (or `mobileStrength` at <=759px). Decoration only. */
export function Parallax({ children, strength = 60, mobileStrength = 0, className }: {
  children: ReactNode; strength?: number; mobileStrength?: number; className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const enabled = useUiMotion();
  const { scrollYProgress } = useScroll({ target: outerRef, offset: ['start end', 'end start'] });
  const [mobile, setMobile] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width:759px)');
    setMobile(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setMobile(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // The store's motion personality scales the author's strength (×0.3 snappy … ×1.3 cinematic), within the same bounds.
  const [depth, setDepth] = useState(1);
  useEffect(() => { setDepth(clamp(motionToken('parallax', 1), 0, 2, 1)); }, []);
  const limit = mobile ? clamp(mobileStrength * depth, -20, 20, 0) : clamp(strength * depth, -160, 160, 60);
  const transform = useTransform(scrollYProgress, [0, 1], [`translateY(${limit}px)`, `translateY(${-limit}px)`]);
  // The scroll target (outer) stays untransformed so its own measured position can't feed back into the transform it drives.
  return <div ref={outerRef} className={className} data-ui-parallax="">
    <motion.div style={{ transform: enabled && limit ? transform : 'none' }}>{children}</motion.div>
  </div>;
}
/** Once-only scroll entrance, visible without JavaScript and immediately visible on focus. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const enabled = useUiMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || typeof IntersectionObserver !== 'function') return;
    let anim: Animation | undefined;
    const start = () => {
      if (!anim) anim = el.animate(
        [{ transform: `translateY(${clamp(motionToken('distance', 28), 0, 40, 28)}px)`, opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }],
        { duration: clamp(motionToken('slow', 500), 200, 900, 500), delay: clamp(delay, 0, 300, 0), easing: readUiEase(), fill: 'both' },
      );
      return anim;
    };
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { start(); observer.disconnect(); } }, { threshold: 0.2 });
    if (el.getBoundingClientRect().top < 0 || el.contains(document.activeElement)) return;
    observer.observe(el);
    const onFocusIn = () => { start().finish(); observer.disconnect(); };
    el.addEventListener('focusin', onFocusIn);
    return () => { observer.disconnect(); anim?.cancel(); el.removeEventListener('focusin', onFocusIn); };
  }, [enabled, delay]);
  return <div ref={ref} className={className} data-ui-reveal="">{children}</div>;
}
/** Gives a small group of narrative beats one reading rhythm without changing their content order. */
export function SectionSequence({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={['ui-section-sequence', className].filter(Boolean).join(' ')} aria-label={label}>
    {Children.map(children, (child, index) => <Reveal delay={Math.min(index * 50, 150)}>{child}</Reveal>)}
  </div>;
}
/** A statement whose words light up as it is read. */
export function Statement({ children, align = 'start', as: Tag = 'p' }: { children: string; align?: 'start' | 'center'; as?: 'p' | 'span' }) {
  const words = children.split(/\s+/).filter(Boolean);
  return <><MotionStyles /><Tag className="ui-statement ui-words" data-align={align === 'center' ? 'center' : undefined}>
    {words.map((word, index) => <span key={index}>{word}{index < words.length - 1 ? ' ' : ''}</span>)}
  </Tag></>;
}
export function TextFillStatement(props: { children: string; align?: 'start' | 'center' }) { return <Statement {...props} />; }
// Owner 2026-11-14: like the other motion parts, a Marquee takes a className (V2 designs gave it one and the build failed).
export function Marquee({ items, speed = 38, className }: { items: string[]; speed?: number; className?: string }) {
  const list = items.filter(Boolean).slice(0, 12);
  const run = (hidden: boolean) => <div className="ui-marquee__item" aria-hidden={hidden || undefined}>{list.map((item, i) => <span key={i}>{item}</span>)}</div>;
  return <><MotionStyles /><div className={className ? `ui-marquee ${className}` : 'ui-marquee'} style={{ '--ui-marquee-duration': `${Math.min(90, Math.max(12, speed))}s` } as CSSProperties}>
    <div className="ui-marquee__track">{run(false)}{run(true)}</div>
  </div></>;
}

/* Owner 2026-10-30 («stores that should be animated are plain still»): a template Shell (Esencial) never mounts StoreTheme,
 * so the CSS-driven parts (Marquee, Statement, scrollGrow) had no styles there and stood still. Each part brings this block;
 * React hoists it into <head> once. Colours and fonts fall back to the template's --es-* tokens. */
const MOTION_CSS = `
.ui-marquee{overflow:hidden;border-block:1px solid var(--ui-line,color-mix(in srgb,currentColor 18%,transparent));padding-block:var(--ui-s4,16px);font-family:var(--ui-display-font,var(--es-heading,inherit));font-size:clamp(22px,2.4vw,40px);white-space:nowrap}
.ui-marquee__track{display:inline-flex;animation:ui-marquee var(--ui-marquee-duration,38s) linear infinite}.ui-marquee:hover .ui-marquee__track{animation-play-state:paused}
.ui-marquee__item{display:inline-flex;align-items:center}.ui-marquee__item>span{display:inline-flex;align-items:center;gap:var(--ui-s6,32px);padding-right:var(--ui-s6,32px)}
.ui-marquee__item>span::after{content:"✦";font-size:.5em;color:var(--ui-accent,var(--es-accent,currentColor));font-style:normal}
@keyframes ui-marquee{to{transform:translateX(-50%)}}
.ui-statement{font-family:var(--ui-display-font,var(--es-heading,inherit));font-size:clamp(26px,3.4vw,56px);line-height:1.18;letter-spacing:-.015em;max-width:22ch;margin:0;text-wrap:balance}
.ui-statement[data-align=center]{margin-inline:auto;text-align:center}
@supports (animation-timeline: view()){
  :root:not([data-ui-motion=off]) .ui-words>span{animation:ui-word linear both;animation-timeline:view();animation-range:cover 10% cover 45%}
  :root:not([data-ui-motion=off]) .ui-scroll-grow{animation:ui-grow-media linear both;animation-timeline:view();animation-range:entry 0% cover 50%}
}
@keyframes ui-word{from{opacity:.38}to{opacity:1}}
@keyframes ui-grow-media{from{transform:scale(.8)}to{transform:none}}
.ui-float{display:inline-block;animation:ui-float var(--ui-float-time,4.2s) ease-in-out var(--ui-float-delay,0ms) infinite}
@keyframes ui-float{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(calc(-1 * var(--ui-float-lift,14px))) rotate(1.5deg)}}
.ui-sticker{--ui-sticker-size:clamp(84px,9vw,128px);position:relative;display:inline-grid;place-items:center;width:var(--ui-sticker-size);aspect-ratio:1;border-radius:50%;background:var(--ui-accent,var(--es-accent,#111));color:var(--ui-accent-foreground,var(--es-on-accent,#fff));font-family:var(--ui-display-font,var(--es-heading,inherit));font-weight:700;font-size:calc(var(--ui-sticker-size) * .15);line-height:1.05;text-align:center;padding:14%;box-shadow:0 6px 18px rgb(0 0 0 / .14);animation:ui-sticker-spin 14s linear infinite}
.ui-sticker::before{content:"";position:absolute;inset:6%;border-radius:50%;border:2px dashed currentColor;opacity:.55}
.ui-sticker>span{position:relative;animation:ui-sticker-spin 14s linear infinite reverse}
@keyframes ui-sticker-spin{to{transform:rotate(360deg)}}
.ui-wiggle{display:inline-block}.ui-wiggle:hover,.ui-wiggle:focus-within{animation:ui-wiggle .6s cubic-bezier(.34,1.56,.64,1)}
@keyframes ui-wiggle{0%,100%{transform:none}20%{transform:rotate(-4deg) scale(1.03)}45%{transform:rotate(3deg) scale(1.03)}70%{transform:rotate(-2deg)}}
.ui-bounce__word{display:inline-block;white-space:nowrap}.ui-bounce__word>span{display:inline-block;animation:ui-bounce .7s cubic-bezier(.34,1.56,.64,1) both;animation-delay:calc(min(var(--i),24) * 45ms)}
.ui-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
@keyframes ui-bounce{0%{opacity:0;transform:translateY(.6em) scale(.7)}60%{opacity:1;transform:translateY(-.12em) scale(1.06)}100%{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ui-marquee__track,.ui-float,.ui-sticker,.ui-sticker>span,.ui-wiggle:hover,.ui-wiggle:focus-within,.ui-bounce__word>span{animation:none}}
:root[data-ui-motion=off] :is(.ui-marquee__track,.ui-float,.ui-sticker,.ui-sticker>span,.ui-wiggle:hover,.ui-wiggle:focus-within,.ui-bounce__word>span){animation:none}
`;
function MotionStyles() {
  return <style href="pagosya-ui-motion" precedence="default">{MOTION_CSS}</style>;
}

/** Bobs gently up and down without end: a cut-out product, a can, a sweet. Decoration; still with reduced motion. */
export function Float({ children, delay = 0, lift = 14, className }: { children: ReactNode; delay?: number; lift?: number; className?: string }) {
  return <><MotionStyles /><span className={['ui-float', className].filter(Boolean).join(' ')} style={{ '--ui-float-delay': `${clamp(delay, 0, 3000, 0)}ms`, '--ui-float-lift': `${clamp(lift, 4, 28, 14)}px`, '--ui-float-time': `${4.2 + (clamp(delay, 0, 3000, 0) % 900) / 1000}s` } as CSSProperties}>{children}</span></>;
}
/** A round badge in the brand colour that turns slowly; its words stay upright. Two or three words. */
export function Sticker({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <><MotionStyles /><span className={['ui-sticker', className].filter(Boolean).join(' ')} style={style}><span>{children}</span></span></>;
}
/** Wobbles once when pointed at or focused: buttons, product photos, cards. */
export function Wiggle({ children, className }: { children: ReactNode; className?: string }) {
  return <><MotionStyles /><span className={['ui-wiggle', className].filter(Boolean).join(' ')}>{children}</span></>;
}
/** A short headline whose letters bounce in one after another. Words never break inside; screen readers read the whole text. */
export function BounceText({ children }: { children: string }) {
  let index = 0;
  const words = String(children ?? '').split(/(\s+)/);
  return <><MotionStyles /><span className="ui-bounce"><span className="ui-sr">{children}</span>{words.map((word, w) => /^\s+$/.test(word) || !word ? word
    : <span key={w} className="ui-bounce__word" aria-hidden="true">{Array.from(word).map((char, c) => <span key={c} style={{ '--i': index++ } as CSSProperties}>{char}</span>)}</span>)}</span></>;
}

export function SectionHead({ eyebrow, title, body, action, align = 'start' }: { eyebrow?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; align?: 'start' | 'center' }) {
  return <div className="ui-section-head" data-align={align === 'center' ? 'center' : undefined}>
    <div>{eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}<Heading>{title}</Heading>{body ? <p className="ui-text" style={{ marginTop: 'var(--ui-s3)' }}>{body}</p> : null}</div>
    {action}
  </div>;
}

export type CardStyle = 'classic' | 'overlay' | 'minimal' | 'framed' | 'caption';
export type CatalogLayout = 'grid' | 'editorial' | 'spotlight' | 'rail' | 'masonry';
export type CatalogFx = 'none' | 'grow' | 'zoom' | 'lift' | 'reveal' | 'grow zoom' | 'reveal zoom' | 'reveal lift';
/**
 * The live catalog. Product cards are filled by the commerce runtime from real inventory, using
 * this card design; prices, stock, options and purchasing stay platform-owned.
 */
export function Catalog({ id = 'productos', eyebrow, title, body, layout = 'grid', card = 'classic', fx = 'zoom', columns = 4, showDescription = false, showAdd = true, heading, presentation, productIds = [], sketch = false }: {
  id?: string; eyebrow?: ReactNode; title?: ReactNode; body?: ReactNode; layout?: CatalogLayout; card?: CardStyle; fx?: CatalogFx; columns?: 2 | 3 | 4 | 5; showDescription?: boolean; showAdd?: boolean;
  heading?: ReactNode; presentation?: 'index' | 'two-up' | 'rail' | 'spotlight' | 'asymmetric' | 'lookbook'; productIds?: string[]; sketch?: boolean;
}) {
  const purchasing = <>
    <p className="ui-card__price" data-product-field="price" />
    <button hidden={!showAdd} type="button" className="ui-card__add" data-product-add>{presentation ? 'Añadir +' : 'Añadir'}</button>
  </>;
  return <section id={id} className="ui-section" aria-label={typeof title === 'string' ? title : 'Productos'}>
    <div className="ui-container">
      {heading ?? (title ? <SectionHead eyebrow={eyebrow} title={title} body={body} /> : null)}
      <div data-ui-catalog="" data-presentation={presentation} data-layout={layout} data-fx={fx} style={{ '--ui-cols': String(columns) } as CSSProperties}>
        <div data-pagosya-catalog data-pagosya-grid data-design-product-ids={productIds.length ? productIds.join(',') : undefined} data-skb-group={sketch ? 'items' : undefined} tabIndex={presentation === 'rail' ? 0 : undefined} aria-label={presentation === 'rail' ? 'Productos' : undefined} />
      </div>
      <template data-pagosya-product-template>
        <article className="ui-card" data-card={card} data-presentation={presentation}>
          {presentation === 'index' ? <><span className="ui-card__number" aria-hidden="true" /><h3 className="ui-card__index-title"><a data-product-link><span data-product-field="name" /></a></h3></> : null}
          <a className="ui-card__media" data-product-link data-product-media><img data-product-field="image" alt="" /></a>
          <div className="ui-card__body">
            {presentation !== 'index' ? <h3 className="ui-card__name"><a data-product-link><span data-product-field="name" /></a></h3> : null}
            <p className="ui-card__meta" data-product-field="options" />
            {showDescription ? <p className="ui-card__desc" data-product-field="description" /> : null}
            {presentation ? <div className="ui-card__buy">{purchasing}</div> : purchasing}
          </div>
        </article>
      </template>
    </div>
  </section>;
}

/** The platform-owned live catalog in a touch-friendly horizontal rail. */
export function ProductRail(props: Omit<Parameters<typeof Catalog>[0], 'layout'>) {
  return <Catalog {...props} layout="rail" />;
}

export function FeatureSplit({ image, eyebrow, title, children, action, copy, sketch = false, mediaFree, reverse = false, grow = false }: {
  image: Img; eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; reverse?: boolean; grow?: boolean; copy?: ReactNode; sketch?: boolean; mediaFree?: Img['sketchFree'];
}) {
  return <div className="ui-feature" data-reverse={reverse ? '' : undefined}>
    <div data-skb-group={sketch ? 'media' : undefined} data-skb-free={mediaFree ? 'on' : undefined} style={sketchFreeStyle(mediaFree)} className={['ui-feature__media', grow ? 'ui-scroll-grow' : ''].filter(Boolean).join(' ')}><Picture image={image} /></div>
    {copy ?? <div className="ui-stack">{eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}<Heading>{title}</Heading>{children}{action ? <div className="ui-row" style={{ marginTop: 'var(--ui-s3)' }}>{action}</div> : null}</div>}
  </div>;
}
export type Chapter = { eyebrow?: string; title?: ReactNode; body: ReactNode; image?: Img };
/** Cards that stack over each other as the visitor scrolls. */
export function StoryChapters({ chapters }: { chapters: Chapter[] }) {
  return <div className="ui-chapters">{chapters.slice(0, 6).map((chapter, index) => <article key={index} className="ui-chapter" style={{ '--i': index } as CSSProperties}>
    <div className="ui-stack">{chapter.eyebrow ? <Eyebrow>{chapter.eyebrow}</Eyebrow> : null}{chapter.title ? <Heading as="h3">{chapter.title}</Heading> : null}<Text>{chapter.body}</Text></div>
    {chapter.image?.src ? <div className="ui-chapter__media"><Picture image={chapter.image} /></div> : null}
  </article>)}</div>;
}
export function Gallery({ images, variant = 'mosaic' }: { images: Img[]; variant?: 'mosaic' | 'grid' | 'strip' }) {
  return <div className="ui-gallery" data-variant={variant} tabIndex={variant === 'strip' ? 0 : undefined} aria-label={variant === 'strip' ? 'Galería' : undefined}>{images.filter(image => image?.src).slice(0, 12).map((image, index) => <figure key={index} className="ui-gallery__item"><Picture image={image} /></figure>)}</div>;
}
export type TrustPoint = { title: string; detail: string };
/** Factual reassurance only: what the store really does (delivery, payment, invoice). Never invented claims. */
export function TrustStrip({ points }: { points: TrustPoint[] }) {
  return <div className="ui-trust">{points.slice(0, 4).map((point, index) => <div key={index} className="ui-trust__item">
    <span className="ui-trust__mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 5 5L20 7" /></svg></span>
    <div><strong>{point.title}</strong><span>{point.detail}</span></div>
  </div>)}</div>;
}
export type FaqItem = { question: string; answer: string };
export function Faq({ items }: { items: FaqItem[] }) {
  return <div className="ui-faq">{items.slice(0, 12).map((item, index) => <details key={index}><summary>{item.question}</summary><div><Text>{item.answer}</Text></div></details>)}</div>;
}
/** Verified-purchase reviews rendered by the commerce runtime. Never write reviews by hand. */
export function Reviews({ title = 'Reseñas verificadas' }: { title?: string }) {
  return <div><Heading>{title}</Heading><div data-pagosya-reviews style={{ marginTop: 'var(--ui-s5)' }} /></div>;
}

export type FooterColumn = { title: string; links: NavLink[] };
export function SiteFooter({ name, blurb, columns = [], note, tone = 'ink' }: { name: string; blurb?: string; columns?: FooterColumn[]; note?: string; tone?: 'ink' | 'paper' }) {
  return <footer className="ui-footer" data-tone={tone === 'paper' ? 'paper' : undefined}>
    <div className="ui-container">
      <div className="ui-footer__grid">
        <div><p className="ui-footer__brand">{name}</p>{blurb ? <p className="ui-text">{blurb}</p> : null}</div>
        {columns.slice(0, 4).map(column => <div key={column.title}><h2>{column.title}</h2><ul>{column.links.slice(0, 8).map(link => <li key={link.href + link.label}><a href={link.href}>{link.label}</a></li>)}</ul></div>)}
      </div>
      <div className="ui-footer__base"><span>© {name}</span><nav className="ui-footer__policies" data-pagosya-policies aria-label="Políticas de la tienda" hidden /><span>{note || 'Pagos seguros con pagosYa'}</span></div>
    </div>
  </footer>;
}

/* ------------------------------------------------------------------ rich section kit */

/* Owner 2026-11-13 («sections are too simple and not modern … build a rich component library … make sure yapi can use them»),
 * after Amboras's kit v5 (studied from its builder rulebook; its code is unlicensed and is not copied here). Parts marked
 * «Magic UI» are adapted from https://magicui.design — MIT License, Copyright (c) Magic UI — with plain ui-k- classes instead of
 * Tailwind (the kit is never scanned by Tailwind), the store's tokens instead of fixed colours, and reduced motion respected.
 * Every part renders a complete, readable settled state before JavaScript runs and when motion is off. */
const RICH_CSS = `
.ui-k-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.ui-k-marquee{display:flex;gap:var(--k-gap,24px);overflow:hidden;padding:8px 0}
.ui-k-marquee--v{flex-direction:column}
.ui-k-marquee__track{display:flex;flex-shrink:0;align-items:center;justify-content:space-around;gap:var(--k-gap,24px);animation:ui-k-marquee var(--k-dur,40s) linear infinite}
.ui-k-marquee--v .ui-k-marquee__track{flex-direction:column;animation-name:ui-k-marquee-v}
.ui-k-marquee__track--rev{animation-direction:reverse}
.ui-k-marquee--pause:hover .ui-k-marquee__track{animation-play-state:paused}
@keyframes ui-k-marquee{from{transform:translateX(0)}to{transform:translateX(calc(-100% - var(--k-gap,24px)))}}
@keyframes ui-k-marquee-v{from{transform:translateY(0)}to{transform:translateY(calc(-100% - var(--k-gap,24px)))}}
.ui-k-ticker{display:inline-block;font-variant-numeric:tabular-nums}
.ui-k-rotate{position:relative;display:inline-block;overflow:hidden;vertical-align:bottom}
.ui-k-rotate__word{display:inline-block}
.ui-k-shiny{color:color-mix(in srgb,currentColor 62%,transparent);background:linear-gradient(90deg,transparent,currentColor 50%,transparent) 0 0/var(--k-shiny,100px) 100% no-repeat;-webkit-background-clip:text;background-clip:text;animation:ui-k-shiny 8s infinite}
@keyframes ui-k-shiny{0%,90%,100%{background-position:calc(-100% - var(--k-shiny,100px)) 0}30%,60%{background-position:calc(100% + var(--k-shiny,100px)) 0}}
.ui-k-aurora{position:relative;display:inline-block}
.ui-k-aurora__fill{position:relative;display:inline-block;background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:ui-k-aurora 10s ease-in-out infinite}
@keyframes ui-k-aurora{0%,100%{background-position:0% 50%}25%{background-position:50% 100%}50%{background-position:100% 50%}75%{background-position:50% 0%}}
.ui-k-progress{position:fixed;inset:0 0 auto 0;z-index:60;height:3px;transform-origin:left;background:var(--es-accent,currentColor)}
.ui-k-velocity{width:100%;overflow:hidden;white-space:nowrap}
.ui-k-velocity__track{display:inline-flex;align-items:center;will-change:transform}
.ui-k-velocity__block{display:inline-flex;flex-shrink:0;align-items:center;gap:var(--k-gap,32px);padding-right:var(--k-gap,32px)}
.ui-k-spot{--k-card-bg:var(--es-paper,#fff);position:relative;isolation:isolate;overflow:hidden;border:1px solid transparent;border-radius:20px;color:var(--es-ink,#111)}
.ui-k-spot__glow{position:absolute;inset:1px;z-index:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .3s}
.ui-k-spot:hover .ui-k-spot__glow{opacity:1}
.ui-k-spot__body{position:relative;z-index:1;padding:28px}
.ui-k-videotext{position:relative;width:100%;min-height:clamp(180px,32vw,420px)}
.ui-k-videotext__mask{position:absolute;inset:0;-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center}
.ui-k-videotext__mask video,.ui-k-videotext__mask img{width:100%;height:100%;object-fit:cover}
.ui-k-morph{position:relative;width:100%;height:1.15em;text-align:center;line-height:1;font-family:var(--es-heading,inherit);font-weight:700}
.ui-k-morph__a,.ui-k-morph__b{position:absolute;inset:0 0 auto 0;margin:auto;display:inline-block;width:100%}
.ui-k-shimmer{--k-spread:90deg;--k-cut:.06em;--k-speed:3s;position:relative;z-index:0;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;border-radius:999px;padding:14px 30px;white-space:nowrap;color:var(--es-paper,#fff);background:var(--es-ink,#111);font-weight:600;text-decoration:none;transition:transform .3s}
.ui-k-shimmer:active{transform:translateY(1px)}
.ui-k-shimmer__spark{position:absolute;inset:0;z-index:-3;overflow:visible;filter:blur(2px);container-type:size}
.ui-k-shimmer__beam{position:absolute;inset:0;aspect-ratio:1;height:100cqh;animation:ui-k-shimmer-slide var(--k-speed) ease-in-out infinite alternate}
.ui-k-shimmer__beam::before{content:"";position:absolute;inset:-100%;background:conic-gradient(from calc(270deg - (var(--k-spread) * .5)),transparent 0,var(--es-accent,#fff) var(--k-spread),transparent var(--k-spread));animation:ui-k-spin-around calc(var(--k-speed) * 2) infinite linear}
.ui-k-shimmer__bg{position:absolute;inset:var(--k-cut);z-index:-2;border-radius:inherit;background:var(--es-ink,#111)}
.ui-k-shimmer__label{position:relative}
@keyframes ui-k-shimmer-slide{to{transform:translate(calc(100cqw - 100%),0)}}
@keyframes ui-k-spin-around{0%{transform:rotate(0)}15%,35%{transform:rotate(90deg)}65%,85%{transform:rotate(270deg)}100%{transform:rotate(360deg)}}
.ui-k-hoverbtn{position:relative;display:inline-flex;overflow:hidden;border:1px solid currentColor;border-radius:999px;padding:12px 26px;font-weight:600;color:var(--es-ink,#111);background:var(--es-paper,#fff);text-decoration:none;white-space:nowrap}
.ui-k-hoverbtn__rest{display:flex;align-items:center;gap:10px}
.ui-k-hoverbtn__dot{width:8px;height:8px;border-radius:999px;background:var(--es-accent,#111);transition:transform .35s}
.ui-k-hoverbtn:hover .ui-k-hoverbtn__dot,.ui-k-hoverbtn:focus-visible .ui-k-hoverbtn__dot{transform:scale(60)}
.ui-k-hoverbtn__label{transition:transform .3s,opacity .3s}
.ui-k-hoverbtn:hover .ui-k-hoverbtn__label,.ui-k-hoverbtn:focus-visible .ui-k-hoverbtn__label{transform:translateX(48px);opacity:0}
.ui-k-hoverbtn__hover{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--es-paper,#fff);transform:translateX(48px);opacity:0;transition:transform .3s,opacity .3s}
.ui-k-hoverbtn:hover .ui-k-hoverbtn__hover,.ui-k-hoverbtn:focus-visible .ui-k-hoverbtn__hover{transform:translateX(0);opacity:1}
.ui-k-bento{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:clamp(220px,24vw,340px);gap:16px}
.ui-k-bento__card{position:relative;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;border-radius:20px;background:color-mix(in srgb,var(--es-ink,#111) 5%,var(--es-paper,#fff));color:var(--es-ink,#111)}
.ui-k-bento__card--wide{grid-column:span 2}.ui-k-bento__card--tall{grid-row:span 2}.ui-k-bento__card--big{grid-column:span 2;grid-row:span 2}
.ui-k-bento__card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.ui-k-bento__card:hover img{transform:scale(1.04)}
.ui-k-bento__card--photo{color:#fff}
.ui-k-bento__card--photo::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgb(0 0 0 / .62),rgb(0 0 0 / 0) 58%)}
.ui-k-bento__copy{position:relative;z-index:1;display:grid;gap:6px;padding:24px;transition:transform .3s}
.ui-k-bento__title{margin:0;font-family:var(--es-heading,inherit);font-size:clamp(20px,2vw,28px);line-height:1.05}
.ui-k-bento__text{margin:0;max-width:44ch;opacity:.86;line-height:1.45}
.ui-k-bento__cta{display:inline-flex;align-items:center;gap:6px;margin-top:6px;color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:4px}
.ui-k-bento__cta svg,.ui-k-hoverbtn__hover svg{width:18px;height:18px;flex:none}
.ui-k-kinetic__w{display:inline-block;white-space:pre}
.ui-k-kinetic.is-in .ui-k-kinetic__w{animation:ui-k-rise .75s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i) * 55ms)}
.ui-k-kinetic--blur.is-in .ui-k-kinetic__w{animation-name:ui-k-blur-in}
.ui-k-kinetic--fade.is-in .ui-k-kinetic__w{animation-name:ui-k-fade-in}
@keyframes ui-k-rise{from{opacity:0;transform:translateY(.45em)}}
@keyframes ui-k-blur-in{from{opacity:0;filter:blur(10px)}}
@keyframes ui-k-fade-in{from{opacity:0}}
.ui-k-carousel{position:relative}
.ui-k-carousel__track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;border-radius:20px}
.ui-k-carousel__track::-webkit-scrollbar{display:none}
.ui-k-carousel__slide{position:relative;flex:0 0 100%;aspect-ratio:var(--k-aspect,16/9);scroll-snap-align:start;overflow:hidden;color:#fff}
.ui-k-carousel__slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ui-k-carousel__slide--copy::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgb(0 0 0 / .55),rgb(0 0 0 / 0) 55%)}
.ui-k-carousel__copy{position:absolute;inset:auto 0 0 0;z-index:1;display:grid;gap:6px;padding:clamp(20px,4vw,48px)}
.ui-k-carousel__title{margin:0;font-family:var(--es-heading,inherit);font-size:clamp(24px,3.4vw,48px);line-height:1}
.ui-k-carousel__copy a{color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:4px}
.ui-k-carousel__arrows{position:absolute;inset:auto 16px 16px auto;z-index:2;display:flex;gap:8px}
.ui-k-arrow{display:inline-grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:var(--es-paper,#fff);color:var(--es-ink,#111);cursor:pointer;box-shadow:0 6px 18px -8px rgb(0 0 0 / .4)}
.ui-k-arrow svg{width:18px;height:18px}
.ui-k-dots{display:flex;justify-content:center;gap:8px;margin-top:14px}
.ui-k-dot{width:10px;height:10px;padding:0;border:1px solid currentColor;border-radius:999px;background:transparent;cursor:pointer;opacity:.5}
.ui-k-dot[aria-current="true"]{background:currentColor;opacity:1}
.ui-k-rail{position:relative}
.ui-k-rail__track{display:flex;gap:var(--k-gap,16px);overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 clamp(16px,4vw,48px);padding:4px clamp(16px,4vw,48px) 12px;scrollbar-width:thin}
.ui-k-rail__item{flex:0 0 var(--k-item,min(78%,340px));scroll-snap-align:start}
.ui-k-rail__arrows{display:flex;justify-content:flex-end;gap:8px;padding:0 clamp(16px,4vw,48px) 12px}
.ui-k-scene{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,5vw,72px);align-items:start}
.ui-k-scene__media{position:sticky;top:calc(var(--kit-nav-h,72px) + 24px);aspect-ratio:4/5;max-height:76vh;overflow:hidden;border-radius:24px}
.ui-k-scene__media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease}
.ui-k-scene__media img[data-on="true"]{opacity:1}
.ui-k-scene__step{display:flex;flex-direction:column;justify-content:center;gap:12px;min-height:70vh;opacity:.35;transition:opacity .4s}
.ui-k-scene__step[data-on="true"]{opacity:1}
.ui-k-scene__step h3{margin:0;font-family:var(--es-heading,inherit);font-size:clamp(26px,3vw,44px);line-height:1.02}
.ui-k-scene__step p{margin:0;max-width:46ch;line-height:1.55}
.ui-k-scene__inline{display:none}
.ui-k-hscroll{position:relative}
.ui-k-hscroll__pin{position:sticky;top:0;display:flex;align-items:center;height:100vh;overflow:hidden}
.ui-k-hscroll__track{display:flex;gap:var(--k-gap,24px);padding:0 clamp(16px,4vw,48px);will-change:transform}
.ui-k-hscroll__track > *{flex:0 0 auto}
.ui-k-reveal-card{position:relative;display:block;overflow:hidden;border-radius:20px;color:#fff;text-decoration:none;aspect-ratio:var(--k-aspect,4/5)}
.ui-k-reveal-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.ui-k-reveal-card:hover img,.ui-k-reveal-card:focus-visible img{transform:scale(1.06)}
.ui-k-reveal-card__panel{position:absolute;inset:auto 12px 12px 12px;display:grid;gap:4px;padding:16px 18px;border-radius:14px;background:color-mix(in srgb,var(--es-paper,#fff) 92%,transparent);color:var(--es-ink,#111);transform:translateY(calc(100% - 56px));transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.ui-k-reveal-card:hover .ui-k-reveal-card__panel,.ui-k-reveal-card:focus-visible .ui-k-reveal-card__panel{transform:none}
.ui-k-reveal-card__title{margin:0;font-family:var(--es-heading,inherit);font-size:20px;line-height:1.15}
.ui-k-reveal-card__caption{margin:0;font-size:14px;line-height:1.45;opacity:.8}
.ui-k-frame{position:relative;overflow:hidden;aspect-ratio:var(--k-aspect,4/5);max-height:75vh}
.ui-k-frame img{width:100%;height:100%;object-fit:cover;display:block}
.ui-k-frame--rounded{border-radius:28px}.ui-k-frame--arch{border-radius:999px 999px 24px 24px}.ui-k-frame--pill{border-radius:999px}
.ui-k-frame--circle{border-radius:50%;aspect-ratio:1}.ui-k-frame--cut{clip-path:polygon(0 0,82% 0,100% 18%,100% 100%,0 100%)}
.ui-k-frame--tilt{border-radius:18px;transform:rotate(-2.5deg);box-shadow:0 30px 60px -30px rgb(0 0 0 / .45)}
.ui-k-tabs__list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.ui-k-tabs__tab{min-height:44px;padding:10px 18px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.ui-k-tabs__tab[aria-selected="true"]{background:var(--es-ink,#111);color:var(--es-paper,#fff);border-color:transparent}
.ui-k-wipe{overflow:hidden}
.ui-k-wipe img{display:block;width:100%;height:100%;object-fit:cover}
.ui-k-wipe.is-armed{clip-path:inset(0 0 100% 0)}.ui-k-wipe.is-armed.ui-k-wipe--left{clip-path:inset(0 100% 0 0)}
.ui-k-wipe.is-in{clip-path:inset(0 0 0 0);transition:clip-path 1.1s cubic-bezier(.65,0,.35,1)}
.ui-k-imgtext{display:block;margin:0;background-size:cover;background-position:center;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--es-ink,#111);font-family:var(--es-heading,inherit);font-weight:900;line-height:.86;letter-spacing:-.03em;font-size:clamp(64px,15vw,240px)}
@media (max-width:767px){
  .ui-k-bento{grid-template-columns:minmax(0,1fr);grid-auto-rows:clamp(200px,62vw,300px)}
  .ui-k-bento__card--wide,.ui-k-bento__card--big{grid-column:auto}.ui-k-bento__card--tall,.ui-k-bento__card--big{grid-row:auto}
  .ui-k-scene{grid-template-columns:minmax(0,1fr)}
  .ui-k-scene__media{display:none}
  .ui-k-scene__inline{display:block;aspect-ratio:4/5;max-height:70vh;overflow:hidden;border-radius:20px}
  .ui-k-scene__inline img{width:100%;height:100%;object-fit:cover}
  .ui-k-scene__step{min-height:0;opacity:1;padding:20px 0}
  .ui-k-reveal-card__panel{transform:none}
}
@media (prefers-reduced-motion:reduce){
  .ui-k-marquee__track,.ui-k-shiny,.ui-k-aurora__fill,.ui-k-shimmer__beam,.ui-k-shimmer__beam::before,.ui-k-kinetic.is-in .ui-k-kinetic__w{animation:none}
  .ui-k-wipe.is-armed{clip-path:none}
}
:root[data-ui-motion=off] :is(.ui-k-marquee__track,.ui-k-shiny,.ui-k-aurora__fill,.ui-k-shimmer__beam,.ui-k-shimmer__beam::before,.ui-k-kinetic.is-in .ui-k-kinetic__w){animation:none}
/* Owner 2026-11-15: the showcase pieces (ProductStage, ProductRail), after Amboras's examples. */
.ui-k-stage{position:relative;overflow:hidden;isolation:isolate;min-height:clamp(560px,92vh,860px);background:var(--k-stage-bg);color:var(--k-stage-ink);transition:background-color .8s ease,color .8s ease;touch-action:pan-y;user-select:none}
.ui-k-stage__slide{position:absolute;inset:0;display:grid;place-items:center;padding:72px 24px 120px;opacity:0;pointer-events:none;transition:opacity .5s ease}
.ui-k-stage__slide[data-on=true]{opacity:1;pointer-events:auto}
.ui-k-stage__title{position:relative;z-index:1;margin:0;display:flex;flex-direction:column;align-items:center;gap:clamp(120px,19vw,270px);font-family:var(--kit-display,inherit);font-weight:800;font-size:clamp(60px,12.5vw,200px);line-height:.84;letter-spacing:-.025em;text-transform:uppercase;text-align:center;color:inherit;max-width:100%}
.ui-k-stage__top,.ui-k-stage__bottom{display:block;max-width:100%;overflow-wrap:anywhere;transform:translateY(35%);opacity:0;transition:transform .75s cubic-bezier(.2,.7,.2,1),opacity .5s ease}
.ui-k-stage__bottom{transition-delay:.08s}
.ui-k-stage__slide[data-on=true] :is(.ui-k-stage__top,.ui-k-stage__bottom){transform:none;opacity:1}
.ui-k-stage__product{position:absolute;left:50%;top:47%;z-index:2;width:clamp(220px,32vw,500px);transform:translate(-50%,-44%) rotate(-9deg) scale(.86);opacity:0;transition:transform .85s cubic-bezier(.2,.7,.2,1),opacity .5s ease}
.ui-k-stage__slide[data-on=true] .ui-k-stage__product{transform:translate(-50%,-50%) rotate(-3deg);opacity:1}
.ui-k-stage__product img{display:block;width:100%;margin:0 auto;height:auto;max-height:50vh;object-fit:contain;filter:drop-shadow(0 28px 36px rgba(0,0,0,.28))}
.ui-k-stage__decor{position:absolute;z-index:3;width:clamp(34px,4.6vw,70px);height:auto;object-fit:contain;opacity:0;transition:opacity .6s ease .25s;filter:drop-shadow(0 10px 14px rgba(0,0,0,.2));animation:ui-k-bob 5.5s ease-in-out infinite}
.ui-k-stage__slide[data-on=true] .ui-k-stage__decor{opacity:1}
.ui-k-stage__decor[data-spot="0"]{left:9%;top:24%}
.ui-k-stage__decor[data-spot="1"]{right:11%;top:19%;animation-delay:-1.4s;width:clamp(28px,3.4vw,52px)}
.ui-k-stage__decor[data-spot="2"]{left:20%;bottom:27%;animation-delay:-2.6s}
.ui-k-stage__decor[data-spot="3"]{right:21%;bottom:31%;animation-delay:-.8s;width:clamp(40px,5.4vw,84px)}
.ui-k-stage__decor[data-spot="4"]{left:36%;top:13%;animation-delay:-3.3s;width:clamp(24px,2.8vw,42px)}
.ui-k-stage__decor[data-spot="5"]{right:5%;top:52%;animation-delay:-2s}
@keyframes ui-k-bob{0%,100%{translate:0 0;rotate:0deg}50%{translate:0 -12px;rotate:6deg}}
.ui-k-stage__bar{position:absolute;left:0;right:0;bottom:0;z-index:4;display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:16px;padding:clamp(16px,2.6vw,32px)}
.ui-k-stage__count{display:grid;gap:10px;font-family:var(--kit-display,inherit);line-height:1}
.ui-k-stage__count strong{font-size:clamp(26px,2.6vw,38px);font-weight:800}
.ui-k-stage__count small{font-size:13px;font-weight:700;opacity:.7}
.ui-k-stage__steps{display:flex;gap:6px}
.ui-k-stage__steps button{position:relative;width:40px;height:18px;padding:0;border:0;background:none;color:inherit;cursor:pointer}
.ui-k-stage__steps button::before,.ui-k-stage__steps i{content:"";position:absolute;left:0;top:8px;height:2px;border-radius:2px}
.ui-k-stage__steps button::before{right:0;background:currentColor;opacity:.25}
.ui-k-stage__steps i{width:0;background:currentColor}
.ui-k-stage__steps button[data-done=true] i,.ui-k-stage__steps button[aria-current=true] i{width:100%}
.ui-k-stage[data-playing=true] .ui-k-stage__steps button[aria-current=true] i{animation:ui-k-step var(--k-stage-ms,6500ms) linear}
@keyframes ui-k-step{from{width:0}to{width:100%}}
.ui-k-stage__facts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:0;padding:0;list-style:none}
.ui-k-stage__facts li{padding:7px 13px;border:1px solid color-mix(in srgb,currentColor 42%,transparent);border-radius:999px;font-size:11px;font-weight:750;letter-spacing:.09em;text-transform:uppercase;line-height:1.1}
.ui-k-stage__buy{justify-self:end;display:inline-flex;align-items:center;gap:14px;min-height:50px;padding:6px 6px 6px 22px;border:0;border-radius:999px;background:var(--k-stage-ink);color:var(--k-stage-bg);font:inherit;font-size:13px;font-weight:750;letter-spacing:.07em;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:transform .2s ease}
.ui-k-stage__buy:hover{transform:translateY(-2px)}
.ui-k-stage__buy>span:last-child{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--k-stage-bg);color:var(--k-stage-ink)}
.ui-k-stage__buy svg{width:18px;height:18px}
.ui-k-stage__arrows{position:absolute;inset:50% clamp(12px,2vw,28px) auto;z-index:4;display:flex;justify-content:space-between;pointer-events:none;transform:translateY(-50%)}
.ui-k-stage__arrows .ui-k-arrow{pointer-events:auto;color:var(--k-stage-ink);background:color-mix(in srgb,var(--k-stage-bg) 70%,transparent);border-color:color-mix(in srgb,var(--k-stage-ink) 30%,transparent)}
@media (max-width:720px){
  .ui-k-stage{min-height:640px}
  .ui-k-stage__slide{padding:56px 16px 170px}
  .ui-k-stage__title{gap:clamp(170px,58vw,260px);font-size:clamp(46px,16vw,92px)}
  .ui-k-stage__product{width:auto;top:44%}
  .ui-k-stage__product img{width:auto;max-width:min(58vw,260px);max-height:min(32vh,270px);margin:0 auto}
  .ui-k-stage__bar{grid-template-columns:auto 1fr;row-gap:12px}
  .ui-k-stage__facts{grid-column:1/-1;order:-1}
  .ui-k-stage__arrows{display:none}
  /* live 2026-11-15 (Oh Belly rev 18): five 40-px steps left the button 118 px and «Agregar · Bs 18,00» on four lines */
  .ui-k-stage__steps button{width:22px}
  .ui-k-stage__buy{white-space:nowrap;padding-left:16px}
}
.ui-k-rail-show{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,360px);align-items:center;gap:clamp(24px,4vw,64px);padding:clamp(48px,7vw,96px) clamp(16px,4vw,56px);overflow:hidden}
.ui-k-rail-show--dark{background:radial-gradient(120% 90% at 40% 30%,#3a4044 0%,#1d2124 70%);color:#f2f2ef}
.ui-k-rail-show--light{background:radial-gradient(120% 90% at 40% 30%,#ffffff 0%,#e9e6e0 75%);color:#1b1b1b}
.ui-k-rail-show__stage{position:relative;padding-top:56px}
.ui-k-rail-show__bar{position:absolute;left:-56px;right:-24px;top:56px;height:4px;border-radius:4px;background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(150,150,150,.5));box-shadow:0 2px 6px rgba(0,0,0,.35)}
.ui-k-rail-show__pieces{position:relative;display:flex;align-items:flex-start;justify-content:center}
.ui-k-rail-show__piece{position:relative;flex:1 1 0;min-width:0;max-width:300px;margin:0 -2.5%;padding:0;border:0;background:none;color:inherit;cursor:pointer;transform-origin:50% 0;transform:scale(.9);opacity:.55;filter:saturate(.8) brightness(.85);transition:transform .5s cubic-bezier(.2,.7,.2,1),opacity .4s ease,filter .4s ease}
.ui-k-rail-show__piece[data-on=true]{z-index:2;transform:scale(1.06) translateY(6px);opacity:1;filter:none}
.ui-k-rail-show__piece:focus-visible{outline:2px solid currentColor;outline-offset:6px}
.ui-k-rail-show__hook{display:block;width:42px;height:32px;margin:-30px auto -4px;color:inherit;opacity:.8}
.ui-k-rail-show__piece img{display:block;width:100%;margin:0 auto;height:auto;max-height:440px;object-fit:contain;filter:drop-shadow(0 26px 30px rgba(0,0,0,.35))}
.ui-k-rail-show__panel{display:grid;gap:14px;align-content:center}
.ui-k-rail-show__kicker{margin:0;font-size:12px;opacity:.7}
.ui-k-rail-show__head{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.ui-k-rail-show__head h3{margin:0;font-family:var(--kit-display,inherit);font-size:clamp(24px,2.4vw,34px);line-height:1.08;color:inherit}
.ui-k-rail-show__head span{font-weight:600;white-space:nowrap}
.ui-k-rail-show__text{margin:0;font-size:14px;line-height:1.55;opacity:.78}
.ui-k-rail-show__options{display:grid;gap:8px;font-size:12px}
.ui-k-rail-show__options>span{opacity:.75}
.ui-k-rail-show__options div{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));border:1px solid color-mix(in srgb,currentColor 30%,transparent)}
.ui-k-rail-show__options a{display:grid;place-items:center;min-height:44px;color:inherit;text-decoration:none;font-weight:600;border-right:1px solid color-mix(in srgb,currentColor 18%,transparent)}
.ui-k-rail-show__options a:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
.ui-k-rail-show__buy{display:inline-flex;align-items:center;justify-content:space-between;gap:12px;min-height:50px;padding:6px 6px 6px 20px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:999px;background:none;color:inherit;font:inherit;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;cursor:pointer}
.ui-k-rail-show__buy>span:last-child{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:currentColor}
.ui-k-rail-show__buy svg{width:18px;height:18px;color:#1d2124}
.ui-k-rail-show--light .ui-k-rail-show__buy svg{color:#fff}
.ui-k-rail-show--stand .ui-k-rail-show__bar,.ui-k-rail-show--stand .ui-k-rail-show__hook{display:none}
.ui-k-rail-show--stand .ui-k-rail-show__stage{padding-top:0}
.ui-k-rail-show--stand .ui-k-rail-show__pieces{align-items:flex-end}
.ui-k-rail-show--stand .ui-k-rail-show__piece{transform-origin:50% 100%}
.ui-k-rail-show--stand .ui-k-rail-show__piece[data-on=true]{transform:scale(1.06)}
.ui-k-rail-show--stand .ui-k-rail-show__piece img{max-height:520px}
.ui-k-rail-show--stand .ui-k-rail-show__stage::after{content:"";position:absolute;left:4%;right:4%;bottom:-12px;height:28px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.32),transparent)}
@media (max-width:820px){
  .ui-k-rail-show{grid-template-columns:1fr}
  .ui-k-rail-show__pieces{justify-content:flex-start;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px}
  .ui-k-rail-show__piece{flex:0 0 46%;margin:0;scroll-snap-align:center}
}
@media (prefers-reduced-motion:reduce){
  .ui-k-stage,.ui-k-stage__slide,.ui-k-stage__top,.ui-k-stage__bottom,.ui-k-stage__product,.ui-k-rail-show__piece{transition:opacity .3s ease}
  .ui-k-stage__top,.ui-k-stage__bottom{transform:none}
  .ui-k-stage__product,.ui-k-stage__slide[data-on=true] .ui-k-stage__product{transform:translate(-50%,-50%)}
  .ui-k-stage__decor,.ui-k-stage[data-playing=true] .ui-k-stage__steps button[aria-current=true] i{animation:none}
}
:root[data-ui-motion=off] .ui-k-stage__decor{animation:none}
`;
function RichStyles() {
  return <style href="pagosya-ui-rich" precedence="default">{RICH_CSS}</style>;
}
const kx = (...names: unknown[]) => names.filter((name): name is string => typeof name === 'string' && name.length > 0).join(' ');
const arrowIcon = (direction: 'left' | 'right') => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{direction === 'right' ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M19 12H5M11 6l-6 6 6 6" />}</svg>;

/** Magic UI Marquee: any row (photos, products, words) that runs on its own; repeat copies fill the width. Pauses on hover. */
export function MarqueeRow({ children, reverse = false, pauseOnHover = true, vertical = false, repeat = 4, speed = 40, gap = 24, className }: {
  children: ReactNode; reverse?: boolean; pauseOnHover?: boolean; vertical?: boolean; repeat?: number; speed?: number; gap?: number; className?: string;
}) {
  return <div className={kx('ui-k-marquee', vertical && 'ui-k-marquee--v', pauseOnHover && 'ui-k-marquee--pause', className)} style={{ '--k-dur': `${clamp(speed, 8, 160, 40)}s`, '--k-gap': `${clamp(gap, 0, 120, 24)}px` } as CSSProperties}>
    <RichStyles />
    {Array.from({ length: clamp(repeat, 2, 8, 4) }, (_, index) => <div key={index} className={kx('ui-k-marquee__track', reverse && 'ui-k-marquee__track--rev')} aria-hidden={index > 0 || undefined}>{children}</div>)}
  </div>;
}

/** Magic UI NumberTicker: a number that counts up when it comes into view. Only numbers from the store's data, never invented. */
export function NumberTicker({ value, decimals = 0, prefix = '', suffix = '', className }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const moving = useUiMotion();
  const target = useMotionValue(0);
  const spring = useSpring(target, { damping: 60, stiffness: 100 });
  const inView = useInView(ref, { once: true });
  const places = clamp(decimals, 0, 4, 0);
  const text = (n: number) => `${prefix}${new Intl.NumberFormat('es-BO', { minimumFractionDigits: places, maximumFractionDigits: places }).format(n)}${suffix}`;
  useEffect(() => { if (moving && inView) target.set(value); }, [moving, inView, value, target]);
  useEffect(() => {
    if (!moving) return;
    if (ref.current) ref.current.textContent = text(0);
    return spring.on('change', latest => { if (ref.current) ref.current.textContent = text(Number(latest.toFixed(places))); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, spring, places, prefix, suffix]);
  return <span ref={ref} className={kx('ui-k-ticker', className)}><RichStyles />{text(value)}</span>;
}

/** Magic UI WordRotate: one word of a headline that changes every few seconds (Frescas · Crujientes · Tuyas). */
export function WordRotate({ words, interval = 2500, className }: { words: string[]; interval?: number; className?: string }) {
  const list = words.filter(Boolean).slice(0, 8);
  const [index, setIndex] = useState(0);
  const moving = useUiMotion();
  useEffect(() => {
    if (!moving || list.length < 2) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % list.length), clamp(interval, 1200, 8000, 2500));
    return () => clearInterval(timer);
  }, [moving, list.length, interval]);
  return <span className={kx('ui-k-rotate', className)}>
    <RichStyles /><span className="ui-k-sr">{list.join(', ')}</span>
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={index} aria-hidden="true" className="ui-k-rotate__word" initial={{ opacity: 0, y: '-0.6em' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '0.6em' }} transition={{ duration: 0.25, ease: 'easeOut' }}>{list[index] ?? ''}</motion.span>
    </AnimatePresence>
  </span>;
}

/** Magic UI BlurFade: an entrance from a soft blur as the block comes into view. Below the first screen only. */
export function BlurFade({ children, delay = 0, direction = 'up', className }: { children: ReactNode; delay?: number; direction?: 'up' | 'down' | 'left' | 'right'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const moving = useUiMotion();
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const offset = direction === 'down' || direction === 'right' ? -12 : 12;
  const hidden = direction === 'left' || direction === 'right' ? { opacity: 0, x: offset, filter: 'blur(6px)' } : { opacity: 0, y: offset, filter: 'blur(6px)' };
  const shown = { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' };
  return <motion.div ref={ref} className={className} initial={false} animate={moving && !inView ? hidden : shown} transition={{ delay: 0.04 + clamp(delay, 0, 2, 0), duration: 0.45, ease: 'easeOut' }}>{children}</motion.div>;
}

/** Magic UI AnimatedShinyText: a light that sweeps across a short label now and then. */
export function ShinyText({ children, width = 100, className }: { children: ReactNode; width?: number; className?: string }) {
  return <span className={kx('ui-k-shiny', className)} style={{ '--k-shiny': `${clamp(width, 40, 320, 100)}px` } as CSSProperties}><RichStyles />{children}</span>;
}

/** Magic UI AuroraText: one word filled with a slow-moving gradient of the brand's colours. One per page. */
export function AuroraText({ children, colors, speed = 1, className }: { children: ReactNode; colors?: string[]; speed?: number; className?: string }) {
  const list = colors?.length ? colors.slice(0, 5) : ['var(--es-accent, #e66540)', 'var(--es-deep, #542a62)', 'var(--es-ink, #222)'];
  return <span className={kx('ui-k-aurora', className)}>
    <RichStyles /><span className="ui-k-sr">{children}</span>
    <span aria-hidden="true" className="ui-k-aurora__fill" style={{ backgroundImage: `linear-gradient(135deg, ${list.join(', ')}, ${list[0]})`, animationDuration: `${10 / clamp(speed, 0.2, 4, 1)}s` }}>{children}</span>
  </span>;
}

/** Magic UI ScrollProgress: a thin bar in the accent colour across the top that fills as the page is read. */
export function ScrollProgress({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  return <><RichStyles /><motion.div aria-hidden="true" className={kx('ui-k-progress', className)} style={{ scaleX: scrollYProgress }} /></>;
}

const wrapNumber = (min: number, max: number, value: number) => { const range = max - min; return ((((value - min) % range) + range) % range) + min; };
/** Magic UI ScrollVelocity: a row (words or photos) that runs on its own and speeds up, or turns, with the visitor's scroll. */
export function VelocityRow({ children, speed = 5, direction = 1, gap = 32, className }: { children: ReactNode; speed?: number; direction?: 1 | -1; gap?: number; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(3);
  const moving = useUiMotion();
  const baseX = useMotionValue(0);
  const unit = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, (value: number) => (value < 0 ? -1 : 1) * Math.min(5, (Math.abs(value) / 1000) * 5));
  const heading = useRef(direction >= 0 ? 1 : -1);
  const visible = useRef(true);
  useEffect(() => {
    const container = containerRef.current, block = blockRef.current;
    if (!container || !block) return;
    const update = () => {
      const width = block.scrollWidth || 0;
      unit.set(width);
      const next = width > 0 ? Math.max(3, Math.ceil((container.offsetWidth || 0) / width) + 2) : 3;
      setCopies(current => current === next ? current : next);
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(container); resize.observe(block);
    const seen = new IntersectionObserver(entries => { visible.current = entries.some(entry => entry.isIntersecting); });
    seen.observe(container);
    return () => { resize.disconnect(); seen.disconnect(); };
  }, [children, unit]);
  const x = useTransform([baseX, unit], (latest: number[]) => `${-wrapNumber(0, Number(latest[1]) || 1, Number(latest[0]) || 0)}px`);
  useAnimationFrame((_, delta) => {
    if (!moving || !visible.current || document.visibilityState !== 'visible') return;
    const width = unit.get();
    if (width <= 0) return;
    const push = factor.get();
    if (Math.abs(push) > 0.1) heading.current = (direction >= 0 ? 1 : -1) * (push >= 0 ? 1 : -1);
    baseX.set(baseX.get() + heading.current * ((width * clamp(speed, 1, 20, 5)) / 100) * (1 + Math.min(5, Math.abs(push))) * (delta / 1000));
  });
  return <div ref={containerRef} className={kx('ui-k-velocity', className)} style={{ '--k-gap': `${clamp(gap, 0, 120, 32)}px` } as CSSProperties}>
    <RichStyles />
    <motion.div className="ui-k-velocity__track" style={{ x }}>
      {Array.from({ length: copies }, (_, index) => <div key={index} ref={index === 0 ? blockRef : undefined} aria-hidden={index > 0 || undefined} className="ui-k-velocity__block">{children}</div>)}
    </motion.div>
  </div>;
}

/** Magic UI MagicCard: a card whose border and surface light up in the accent colour where the pointer is. */
export function SpotlightCard({ children, size = 220, className }: { children: ReactNode; size?: number; className?: string }) {
  const reach = clamp(size, 80, 600, 220);
  const mouseX = useMotionValue(-reach), mouseY = useMotionValue(-reach);
  const surface = useMotionTemplate`linear-gradient(var(--k-card-bg) 0 0) padding-box, radial-gradient(${reach}px circle at ${mouseX}px ${mouseY}px, var(--es-accent, #e66540), color-mix(in srgb, currentColor 14%, transparent) 100%) border-box`;
  const glow = useMotionTemplate`radial-gradient(${reach}px circle at ${mouseX}px ${mouseY}px, color-mix(in srgb, var(--es-accent, #e66540) 18%, transparent), transparent 100%)`;
  return <motion.div className={kx('ui-k-spot', className)} style={{ background: surface }}
    onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); mouseX.set(event.clientX - rect.left); mouseY.set(event.clientY - rect.top); }}
    onPointerLeave={() => { mouseX.set(-reach); mouseY.set(-reach); }}>
    <RichStyles /><motion.div aria-hidden="true" className="ui-k-spot__glow" style={{ background: glow }} /><div className="ui-k-spot__body">{children}</div>
  </motion.div>;
}

const svgText = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char);
/** Magic UI VideoText: one or two huge words cut out of the store's video (or a photo). The words stay readable for screen readers. */
export function VideoText({ text, src, image, fontSize = '18vw', className }: { text: string; src?: string; image?: Img; fontSize?: string; className?: string }) {
  const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><text x='50%' y='50%' font-size='${svgText(fontSize)}' font-weight='900' text-anchor='middle' dominant-baseline='middle' font-family='Arial Black, Helvetica, sans-serif'>${svgText(text)}</text></svg>`)}")`;
  return <div className={kx('ui-k-videotext', className)}>
    <RichStyles />
    <div className="ui-k-videotext__mask" style={{ maskImage: mask, WebkitMaskImage: mask }} aria-hidden="true">
      {src ? <video src={src} autoPlay muted loop playsInline preload="metadata" /> : image?.src ? <img src={image.src} alt="" /> : null}
    </div>
    <span className="ui-k-sr">{text}</span>
  </div>;
}

/** Magic UI MorphingText: a few short words that melt into one another, one at a time. With motion off, the first word stays. */
export function MorphingText({ texts, className }: { texts: string[]; className?: string }) {
  const list = texts.filter(Boolean).slice(0, 6);
  const first = useRef<HTMLSpanElement>(null), second = useRef<HTMLSpanElement>(null);
  const filterId = `ui-k-th-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = useUiMotion();
  useEffect(() => {
    if (!moving || list.length < 2) return;
    let frame = 0, index = 0, morph = 0, cooldown = 0.5, last = performance.now();
    const paint = (fraction: number) => {
      const a = first.current, b = second.current;
      if (!a || !b) return;
      b.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`; b.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
      const rest = 1 - fraction;
      a.style.filter = `blur(${Math.min(8 / rest - 8, 100)}px)`; a.style.opacity = `${Math.pow(rest, 0.4) * 100}%`;
      a.textContent = list[index % list.length] ?? ''; b.textContent = list[(index + 1) % list.length] ?? '';
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = (now - last) / 1000; last = now;
      cooldown -= dt;
      if (cooldown <= 0) {
        morph -= cooldown; cooldown = 0;
        let fraction = morph / 1.5;
        if (fraction > 1) { cooldown = 0.5; fraction = 1; }
        paint(fraction);
        if (fraction === 1) index++;
      } else {
        morph = 0;
        const a = first.current, b = second.current;
        if (a && b) { b.style.filter = 'none'; b.style.opacity = '100%'; a.style.filter = 'none'; a.style.opacity = '0%'; }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, list.join('|')]);
  return <div className={kx('ui-k-morph', className)} style={moving ? { filter: `url(#${filterId}) blur(0.6px)` } : undefined}>
    <RichStyles /><span className="ui-k-sr">{list.join(', ')}</span>
    <span ref={first} className="ui-k-morph__a" aria-hidden="true">{list[0] ?? ''}</span>
    <span ref={second} className="ui-k-morph__b" aria-hidden="true" />
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs><filter id={filterId}><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 255 -140" /></filter></defs></svg>
  </div>;
}

/** Magic UI ShimmerButton, as a link: the main call to action with a light that travels round its edge. One per screen. */
export function ShimmerLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} className={kx('ui-k-shimmer', className)}>
    <RichStyles /><span className="ui-k-shimmer__spark" aria-hidden="true"><span className="ui-k-shimmer__beam" /></span>
    <span className="ui-k-shimmer__label">{children}</span><span className="ui-k-shimmer__bg" aria-hidden="true" />
  </a>;
}

/** Magic UI InteractiveHoverButton, as a link: on hover the accent fills the button and an arrow slides in. */
export function HoverButton({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} className={kx('ui-k-hoverbtn', className)}>
    <RichStyles />
    <span className="ui-k-hoverbtn__rest"><span className="ui-k-hoverbtn__dot" aria-hidden="true" /><span className="ui-k-hoverbtn__label">{children}</span></span>
    <span className="ui-k-hoverbtn__hover" aria-hidden="true"><span>{children}</span>{arrowIcon('right')}</span>
  </a>;
}

/** Magic UI BentoGrid: a grid of cards of different sizes (normal, wide, tall, big), each with an optional photo and link. */
export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={kx('ui-k-bento', className)}><RichStyles />{children}</div>;
}
export function BentoCard({ title, text, image, href, cta = 'Ver más', size = 'normal', className }: {
  title: ReactNode; text?: ReactNode; image?: Img; href?: string; cta?: string; size?: 'normal' | 'wide' | 'tall' | 'big'; className?: string;
}) {
  return <article className={kx('ui-k-bento__card', `ui-k-bento__card--${size}`, image?.src && 'ui-k-bento__card--photo', className)}>
    <Picture image={image} />
    <div className="ui-k-bento__copy"><h3 className="ui-k-bento__title">{title}</h3>{text ? <p className="ui-k-bento__text">{text}</p> : null}{href ? <a className="ui-k-bento__cta" href={href}>{cta}{arrowIcon('right')}</a> : null}</div>
  </article>;
}

/** A headline whose words (or letters) rise, fade or come out of a blur one after another when it comes into view. */
export function KineticHeadline({ text, as: Tag = 'h2', by = 'word', effect = 'rise', className }: {
  text: string; as?: 'h1' | 'h2' | 'h3' | 'p'; by?: 'word' | 'char'; effect?: 'rise' | 'blur' | 'fade'; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const moving = useUiMotion();
  const inView = useInView(ref, { once: true });
  const pieces = by === 'char' ? Array.from(text) : text.split(/(\s+)/).filter(Boolean);
  return <Tag aria-label={text} className={kx('ui-k-kinetic', effect !== 'rise' && `ui-k-kinetic--${effect}`, moving && inView && 'is-in', className)}>
    <RichStyles />
    {/* A space stays plain text (owner 2026-11-13): a boxed space starting a wrapped line indented it (« HABLEN POR TI»). */}
    <span ref={ref}>{pieces.map((piece, index) => /^\s+$/.test(piece) ? ' ' : <span key={index} aria-hidden="true" className="ui-k-kinetic__w" style={{ '--i': index } as CSSProperties}>{piece}</span>)}</span>
  </Tag>;
}

/** Full-width slides of the store's photos (or products) with arrows and dots; plays every few seconds, pauses on hover and focus. */
export function Carousel({ slides, autoplay = 6000, aspect = '16/9', label = 'Galería', className }: {
  slides: Array<{ image: Img; title?: ReactNode; text?: ReactNode; href?: string; cta?: string }>; autoplay?: number | false; aspect?: string; label?: string; className?: string;
}) {
  const list = slides.filter(slide => slide.image?.src).slice(0, 8);
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const moving = useUiMotion();
  const go = useCallback((index: number) => {
    const node = track.current; if (!node || !list.length) return;
    const next = (index + list.length) % list.length;
    node.scrollTo({ left: node.clientWidth * next, behavior: moving ? 'smooth' : 'auto' });
  }, [list.length, moving]);
  useEffect(() => {
    const node = track.current; if (!node) return;
    const onScroll = () => setCurrent(Math.round(node.scrollLeft / Math.max(1, node.clientWidth)));
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!moving || paused || autoplay === false || list.length < 2) return;
    const timer = setInterval(() => go(current + 1), clamp(autoplay, 3000, 12000, 6000));
    return () => clearInterval(timer);
  }, [moving, paused, autoplay, current, go, list.length]);
  return <div className={kx('ui-k-carousel', className)} role="region" aria-roledescription="carrusel" aria-label={label} style={{ '--k-aspect': aspect } as CSSProperties}
    onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <RichStyles />
    <div ref={track} className="ui-k-carousel__track">
      {list.map((slide, index) => <div key={index} className={kx('ui-k-carousel__slide', (slide.title || slide.text) && 'ui-k-carousel__slide--copy')} role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${list.length}`}>
        <Picture image={slide.image} eager={index === 0} />
        {slide.title || slide.text ? <div className="ui-k-carousel__copy">{slide.title ? <p className="ui-k-carousel__title">{slide.title}</p> : null}{slide.text ? <p>{slide.text}</p> : null}{slide.href ? <a href={slide.href}>{slide.cta ?? 'Ver más'}</a> : null}</div> : null}
      </div>)}
    </div>
    {list.length > 1 ? <>
      <div className="ui-k-carousel__arrows"><button type="button" className="ui-k-arrow" aria-label="Anterior" onClick={() => go(current - 1)}>{arrowIcon('left')}</button><button type="button" className="ui-k-arrow" aria-label="Siguiente" onClick={() => go(current + 1)}>{arrowIcon('right')}</button></div>
      <div className="ui-k-dots">{list.map((_, index) => <button key={index} type="button" className="ui-k-dot" aria-label={`Ir a ${index + 1}`} aria-current={index === current} onClick={() => go(index)} />)}</div>
    </> : null}
  </div>;
}

/** A horizontal row of peeking cards on native scroll-snap, with arrows on a computer. Each child is one card. */
export function SnapRail({ children, label = 'Más', itemWidth, gap = 16, className }: { children: ReactNode; label?: string; itemWidth?: string; gap?: number; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const step = (direction: 1 | -1) => { const node = track.current; if (node) node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: 'smooth' }); };
  return <div className={kx('ui-k-rail', className)} style={{ '--k-gap': `${clamp(gap, 0, 64, 16)}px`, ...(itemWidth ? { '--k-item': itemWidth } : {}) } as CSSProperties}>
    <RichStyles />
    <div className="ui-k-rail__arrows"><button type="button" className="ui-k-arrow" aria-label="Anterior" onClick={() => step(-1)}>{arrowIcon('left')}</button><button type="button" className="ui-k-arrow" aria-label="Siguiente" onClick={() => step(1)}>{arrowIcon('right')}</button></div>
    <div ref={track} className="ui-k-rail__track" role="region" aria-label={label} tabIndex={0}>{Children.map(children, child => <div className="ui-k-rail__item">{child}</div>)}</div>
  </div>;
}

/** A pinned story: on a computer the photo stays fixed on one side and changes as each step scrolls by on the other; on a phone
 *  every step shows its own photo. 2 to 5 steps (how it is made, why, how to use it). */
export function StickyScene({ steps, label, className }: { steps: Array<{ title: ReactNode; text?: ReactNode; image?: Img }>; label?: string; className?: string }) {
  const list = steps.slice(0, 5);
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const seen = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step) || 0);
    }, { rootMargin: '-45% 0px -45% 0px' });
    refs.current.forEach(node => { if (node) seen.observe(node); });
    return () => seen.disconnect();
  }, [list.length]);
  return <div className={kx('ui-k-scene', className)} aria-label={label}>
    <RichStyles />
    <div className="ui-k-scene__media" aria-hidden="true">{list.map((step, index) => step.image?.src ? <img key={index} src={step.image.src} alt="" loading="lazy" data-on={index === active} /> : null)}</div>
    <div>{list.map((step, index) => <div key={index} ref={node => { refs.current[index] = node; }} data-step={index} data-on={index === active} className="ui-k-scene__step">
      {step.image?.src ? <div className="ui-k-scene__inline"><Picture image={step.image} /></div> : null}
      <h3>{step.title}</h3>{step.text ? <p>{step.text}</p> : null}
    </div>)}</div>
  </div>;
}

/** A section that turns the visitor's vertical scroll into a sideways ride through its children (photos, cards, products).
 *  With motion off, or on a phone, it is an ordinary sideways scroll row. */
export function HorizontalScroll({ children, label = 'Recorrido', gap = 24, className }: { children: ReactNode; label?: string; gap?: number; className?: string }) {
  const section = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const moving = useUiMotion();
  const [distance, setDistance] = useState(0);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const measure = () => { const node = track.current; setWide(window.innerWidth >= 900); setDistance(node ? Math.max(0, node.scrollWidth - window.innerWidth) : 0); };
    measure(); window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [children]);
  const pinned = moving && wide && distance > 0;
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  return <section ref={section} className={kx('ui-k-hscroll', className)} aria-label={label} style={{ '--k-gap': `${clamp(gap, 0, 96, 24)}px`, ...(pinned ? { height: `calc(100vh + ${distance}px)` } : {}) } as CSSProperties}>
    <RichStyles />
    {pinned
      ? <div className="ui-k-hscroll__pin"><motion.div ref={track} className="ui-k-hscroll__track" style={{ x }}>{children}</motion.div></div>
      : <div ref={track} className="ui-k-hscroll__track" style={{ overflowX: 'auto', paddingBottom: 12 }}>{children}</div>}
  </section>;
}

/** A photo card whose title panel slides up to show a caption on hover or focus (always open on a phone). */
export function HoverReveal({ image, title, caption, href, aspect = '4/5', className }: { image: Img; title: ReactNode; caption?: ReactNode; href?: string; aspect?: string; className?: string }) {
  const body = <><RichStyles /><Picture image={image} /><span className="ui-k-reveal-card__panel"><span className="ui-k-reveal-card__title">{title}</span>{caption ? <span className="ui-k-reveal-card__caption">{caption}</span> : null}</span></>;
  const style = { '--k-aspect': aspect } as CSSProperties;
  return href ? <a href={href} className={kx('ui-k-reveal-card', className)} style={style}>{body}</a> : <div className={kx('ui-k-reveal-card', className)} style={style} tabIndex={0}>{body}</div>;
}

/** A photo in a shaped frame: rounded, arch, pill, circle, cut corner or tilted. Medium by default (at most 75% of the screen tall). */
export function MediaFrame({ image, shape = 'rounded', aspect = '4/5', className }: { image: Img; shape?: 'rounded' | 'arch' | 'pill' | 'circle' | 'cut' | 'tilt'; aspect?: string; className?: string }) {
  if (!image?.src) return null;
  return <figure className={kx('ui-k-frame', `ui-k-frame--${shape}`, className)} style={{ '--k-aspect': aspect, margin: 0 } as CSSProperties}><RichStyles /><Picture image={image} /></figure>;
}

/** Tabs: a few short labels that switch the content below (by use, by size, by moment of the day). Keyboard friendly. */
export function Tabs({ tabs, label = 'Opciones', className }: { tabs: Array<{ label: string; content: ReactNode }>; label?: string; className?: string }) {
  const list = tabs.slice(0, 6);
  const [current, setCurrent] = useState(0);
  const base = useId().replace(/[^a-zA-Z0-9]/g, '');
  const move = (index: number) => { const next = (index + list.length) % list.length; setCurrent(next); document.getElementById(`${base}-tab-${next}`)?.focus(); };
  return <div className={kx('ui-k-tabs', className)}>
    <RichStyles />
    <div className="ui-k-tabs__list" role="tablist" aria-label={label}>{list.map((tab, index) => <button key={index} id={`${base}-tab-${index}`} type="button" role="tab" className="ui-k-tabs__tab" aria-selected={index === current} aria-controls={`${base}-panel-${index}`} tabIndex={index === current ? 0 : -1}
      onClick={() => setCurrent(index)} onKeyDown={event => { if (event.key === 'ArrowRight') move(current + 1); else if (event.key === 'ArrowLeft') move(current - 1); }}>{tab.label}</button>)}</div>
    {list.map((tab, index) => <div key={index} id={`${base}-panel-${index}`} role="tabpanel" aria-labelledby={`${base}-tab-${index}`} hidden={index !== current}>{tab.content}</div>)}
  </div>;
}

/** A photo that is uncovered like a curtain (from below or from the side) when it comes into view. */
export function RevealImage({ image, direction = 'up', aspect = '4/5', className }: { image: Img; direction?: 'up' | 'left'; aspect?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const moving = useUiMotion();
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  if (!image?.src) return null;
  return <div ref={ref} className={kx('ui-k-wipe', direction === 'left' && 'ui-k-wipe--left', moving && (inView ? 'is-in' : 'is-armed'), className)} style={{ aspectRatio: aspect, maxHeight: '75vh' }}><RichStyles /><Picture image={image} /></div>;
}

/** One or two huge words filled with a photo of the store (a still version of VideoText). */
export function ImageText({ text, image, as: Tag = 'p', className }: { text: string; image: Img; as?: 'h1' | 'h2' | 'p'; className?: string }) {
  return <Tag className={kx('ui-k-imgtext', className)} style={image?.src ? { backgroundImage: `url("${image.src}")` } : undefined}><RichStyles />{text}</Tag>;
}

/* ------------------------------------------------------------------ store header */

/* Owner 2026-11-12 («one of them did not even have a menu»), after Amboras's NavShell: a store's header is built on this skeleton.
 * The kit owns the structure, the phone menu (focus, Escape, scroll lock), the search/account/cart controls with their count, the
 * merchant's store menu mounts (commerce-src/header/store-menu.js) and words that never break; the store owns brand, links and
 * looks (className props, Tailwind). Look defaults sit in :where() so any class the store passes wins. */
const NAV_CSS = `
:where(.ui-nav){position:sticky;top:0;z-index:50;background:var(--es-paper,#fff);color:var(--es-ink,#111)}
.ui-nav__bar{display:grid;align-items:center;gap:8px 24px;min-height:64px;padding:8px clamp(16px,4vw,48px)}
.ui-nav[data-structure=bar] .ui-nav__bar{grid-template-columns:auto minmax(0,1fr) auto}
.ui-nav[data-structure=split] .ui-nav__bar{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}
.ui-nav[data-structure=centered] .ui-nav__bar{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-areas:". brand actions" "links links links"}
.ui-nav[data-structure=centered] .ui-nav__brand{grid-area:brand}.ui-nav[data-structure=centered] .ui-nav__actions{grid-area:actions}
.ui-nav[data-structure=centered] .ui-nav__links{grid-area:links;justify-content:center}
.ui-nav[data-structure=drawer] .ui-nav__bar{grid-template-columns:auto minmax(0,1fr) auto}
.ui-nav__brand{display:inline-flex;align-items:center;min-width:0;min-height:44px;color:inherit;text-decoration:none;white-space:nowrap}
.ui-nav[data-structure=split] .ui-nav__brand{justify-self:center}
.ui-nav__links{display:flex;align-items:center;gap:0 24px;min-width:0;overflow:hidden}
.ui-nav__own{display:contents}
.ui-nav__links a,.ui-nav__links button{display:inline-flex;align-items:center;min-height:44px;white-space:nowrap;color:inherit}
.ui-nav__right{display:flex;align-items:center;justify-content:flex-end;gap:0 24px;min-width:0}
.ui-nav__actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex:none}
.ui-nav__action{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:44px;padding:0 8px;border:0;background:none;color:inherit;font:inherit;white-space:nowrap;cursor:pointer;text-decoration:none}
.ui-nav__action svg{display:block;width:20px;height:20px;flex:none}
:where(.ui-nav__badge){min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--es-accent,#111);color:var(--es-paper,#fff);font-size:11px;font-weight:700;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
.ui-nav[data-actions=icons] .ui-nav__badge{position:absolute;top:2px;right:0}
.ui-nav[data-actions=icons] .ui-nav__word,.ui-nav[data-actions=labels] .ui-nav__icon{display:none}
:where(.ui-nav[data-actions=pill] [data-nav-action=bag]){padding:0 16px;border-radius:999px;background:var(--es-accent,#111);color:var(--es-paper,#fff)}
.ui-nav[data-actions=pill] [data-nav-action=search] .ui-nav__word,.ui-nav[data-actions=pill] [data-nav-action=account] .ui-nav__word{display:none}
.ui-nav__toggles{display:none;align-items:center}
.ui-nav[data-structure=drawer] .ui-nav__toggles{display:inline-flex}
.ui-nav__toggle{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:0;background:none;color:inherit;cursor:pointer}
.ui-nav__bars,.ui-nav__bars::before,.ui-nav__bars::after{display:block;width:20px;height:2px;background:currentColor;content:""}
.ui-nav__bars{position:relative}.ui-nav__bars::before{position:absolute;top:-6px}.ui-nav__bars::after{position:absolute;top:6px}
.ui-nav__sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.ui-nav__panel-wrap{position:fixed;inset:0;z-index:1000;display:flex;background:rgb(0 0 0 / .35)}
.ui-nav__panel-wrap[hidden]{display:none}
:where(.ui-nav__panel){display:flex;flex-direction:column;gap:4px;width:min(380px,88vw);height:100%;overflow:auto;padding:16px 24px 32px;background:var(--es-paper,#fff);color:var(--es-ink,#111)}
.ui-nav__close{align-self:flex-end;width:44px;height:44px;border:0;background:none;color:inherit;font-size:26px;line-height:1;cursor:pointer}
.ui-nav__panel a{display:flex;align-items:center;min-height:48px;color:inherit;text-decoration:none}
:where(.ui-nav__panel-links a){font-family:var(--es-heading,inherit);font-size:24px}
:where(.ui-nav__panel-tools){margin-top:16px;padding-top:12px;border-top:1px solid color-mix(in srgb,currentColor 15%,transparent)}
@media (max-width:767px){
  .ui-nav .ui-nav__bar{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:none}
  .ui-nav .ui-nav__links{display:none!important}
  .ui-nav .ui-nav__toggles{display:inline-flex}
  .ui-nav .ui-nav__brand{justify-self:start;grid-area:auto}
  .ui-nav .ui-nav__actions{grid-area:auto}
  .ui-nav [data-nav-action=account]{display:none}
  .ui-nav .ui-nav__word{display:none}.ui-nav .ui-nav__icon{display:block}
  .ui-nav .ui-nav__badge{position:absolute;top:2px;right:0}
  .ui-nav[data-actions=pill] [data-nav-action=bag]{padding:0 8px;background:none;color:inherit}
}
/* Floating header (owner 2026-11-15, Zippa/Halcy): over the first section, transparent, solid once scrolled. */
.ui-nav[data-over]{margin-bottom:calc(-1 * var(--ui-nav-h,72px));background:transparent;transition:background-color .25s,color .25s,box-shadow .25s}
.ui-nav[data-over][data-tone=light]{color:#fff}
.ui-nav[data-over][data-scrolled]{background:var(--es-paper,#fff);color:var(--es-ink,#111);box-shadow:0 1px 0 color-mix(in srgb,currentColor 12%,transparent)}
/* Pill links (Halcy): each link its own rounded pill; the highlighted one in the accent. */
.ui-nav[data-links=pills] .ui-nav__links{gap:6px}
.ui-nav[data-links=pills] .ui-nav__links a{min-height:40px;padding:0 16px;border-radius:999px;background:var(--es-paper,#fff);color:var(--es-ink,#111);box-shadow:0 1px 2px #0002}
.ui-nav[data-links=pills] .ui-nav__links a[data-highlight]{background:var(--es-accent,#111);color:var(--es-paper,#fff)}
@media (prefers-reduced-motion:reduce){.ui-nav[data-over]{transition:none}}
/* The merchant's store menu (store-menu.js) replaces the store's own links and toggle where it is on. */
.ui-nav__store-toggle:empty,.ui-nav__store-links:empty{display:none}
.ui-nav[data-store-menu=panel] .ui-nav__toggles{display:inline-flex}
/* The store menu's button is one more item in the row (live 2026-11-14, a split header: the icons wrapped onto a second line under the
   logo). On a computer the bar and split rows get a column for it; phones keep their own three-column row. */
@media (min-width:768px){
  .ui-nav[data-store-menu=panel][data-structure=bar] .ui-nav__bar{grid-template-columns:auto auto minmax(0,1fr) auto}
  .ui-nav[data-store-menu=panel][data-structure=split] .ui-nav__bar{grid-template-columns:auto minmax(0,1fr) auto minmax(0,1fr)}
}
`;
function NavStyles() {
  return <style href="pagosya-ui-nav" precedence="default">{NAV_CSS}</style>;
}
const navIcon = (path: ReactNode) => <svg className="ui-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
const NAV_ICONS = {
  search: navIcon(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>),
  account: navIcon(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20.5c.6-3.8 3.2-5.8 7-5.8s6.4 2 7 5.8" /></>),
  bag: navIcon(<><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>),
};
/** The cart drawn as what the store sells (owner 2026-11-06 «si es una joyería que el carrito sea un anillo»; 2026-11-14 «the icons
 *  are the same up top, like little shirt, search button and create profile»): the same glyphs as the Esencial header's GOODS_ICONS. */
const NAV_GOODS: Record<string, ReactNode> = {
  gem: navIcon(<><path d="M10.5 3 8 9l4 13 4-13-2.5-6" /><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z" /><path d="M2 9h20" /></>),
  watch: navIcon(<><path d="M12 10v2.2l1.6 1" /><path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05" /><path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05" /><circle cx="12" cy="12" r="6" /></>),
  sofa: navIcon(<><path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" /><path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" /><path d="M4 18v2" /><path d="M20 18v2" /><path d="M12 4v9" /></>),
  lamp: navIcon(<><path d="M12 12v6" /><path d="M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23Z" /><path d="M8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" /></>),
  coffee: navIcon(<><path d="M10 2v2" /><path d="M14 2v2" /><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" /><path d="M6 2v2" /></>),
  croissant: navIcon(<><path d="M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487" /><path d="M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132" /><path d="M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42" /><path d="M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14" /><path d="M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676" /></>),
  cake: navIcon(<><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" /><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" /><path d="M2 21h20" /><path d="M7 8v3" /><path d="M12 8v3" /><path d="M17 8v3" /><path d="M7 4h.01" /><path d="M12 4h.01" /><path d="M17 4h.01" /></>),
  cookie: navIcon(<><path d="M11 17h.01" /><path d="M11.496 2c.324-.016.558.292.529.615a4 4 0 004.235 4.368.713.713 0 01.758.757 4 4 0 004.366 4.237c.323-.03.63.204.614.527a10 10 0 01-2.915 6.566A1 1 0 114.93 4.918 10 10 0 0111.496 2" /><path d="M12 12h.01" /><path d="M16 16h.01" /><path d="M16 3h.01" /><path d="M21 4h.01" /><path d="M21 8h.01" /><path d="M7 14h.01" /><path d="M9 8h.01" /></>),
  beef: navIcon(<><path d="M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3" /><path d="m18.5 6 1.754 3.5a6.48 6.48 0 0 1-1.854 8.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5" /><circle cx="12.5" cy="8.5" r="2.5" /></>),
  icecream: navIcon(<><path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11" /><path d="M17 7A5 5 0 0 0 7 7" /><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4" /></>),
  wine: navIcon(<><path d="M8 22h8" /><path d="M7 10h10" /><path d="M12 15v7" /><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z" /></>),
  utensils: navIcon(<><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></>),
  shirt: navIcon(<><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></>),
  sparkles: navIcon(<><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" /></>),
  flask: navIcon(<><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" /><path d="M6.453 15h11.094" /><path d="M8.5 2h7" /></>),
  flame: navIcon(<><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" /></>),
  paw: navIcon(<><circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="20" cy="16" r="2" /><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" /></>),
  book: navIcon(<><path d="M12 5v16" /><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" /></>),
  flower: navIcon(<><path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1" /><circle cx="12" cy="8" r="2" /><path d="M12 10v12" /><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z" /><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z" /></>),
  sprout: navIcon(<><path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3" /><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4" /><path d="M5 21h14" /></>),
  dumbbell: navIcon(<><path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" /><path d="m2.5 21.5 1.4-1.4" /><path d="m20.1 3.9 1.4-1.4" /><path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" /><path d="m9.6 14.4 4.8-4.8" /></>),
  droplet: navIcon(<><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" /></>),
  baby: navIcon(<><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" /><path d="M15 12h.01" /><path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" /><path d="M9 12h.01" /></>),
  gift: navIcon(<><path d="M12 7v14" /><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" /><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5" /><rect x="3" y="7" width="18" height="4" rx="1" /></>),
  apple: navIcon(<><path d="M12 6.528V3a1 1 0 0 1 1-1h0" /><path d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21" /></>),
  soda: navIcon(<><path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8" /><path d="M5 8h14" /><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" /><path d="m12 8 1-6h2" /></>),
  palette: navIcon(<><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></>),
};
export type NavShellLink = { label: ReactNode; href: string };
/** The store header. structure: bar (logo · links · actions), centered (logo centred, links in a row below), split (links ·
 *  centred logo · actions), drawer (logo, menu button and actions only; every link lives in the menu, on a computer too).
 *  actions: icons (icons with the cart count on the bag), labels (Buscar · Mi cuenta · Bolsa 2), pill (icons and a filled bag pill).
 *  cart: what the store sells, so the bag is drawn as a shirt, a ring, a cup… (NAV_GOODS).
 *  Below 768 px every structure is menu button · logo · search and bag. Pass looks with className, barClassName, brandClassName,
 *  linksClassName, actionsClassName, badgeClassName, panelClassName and toggleClassName. */
export function NavShell({ brand, links = [], structure = 'bar', actions = 'icons', cart, labels, over = false, tone = 'dark', linkStyle = 'plain', highlight, className, barClassName, brandClassName, linksClassName, actionsClassName, badgeClassName, panelClassName, toggleClassName }: {
  brand: ReactNode; links?: NavShellLink[]; structure?: 'bar' | 'centered' | 'split' | 'drawer'; actions?: 'icons' | 'labels' | 'pill';
  /** What the store sells (gem, shirt, coffee, paw…): the bag is drawn as it; unknown or empty keeps the bag. */
  cart?: string;
  labels?: { search?: string; account?: string; bag?: string };
  /** Owner 2026-11-15 (Zippa, Halcy): the header floats over the first section, transparent, and turns solid once the page scrolls. */
  over?: boolean;
  /** Text and icon colour while it floats: light on a dark photo, dark on a light one. */
  tone?: 'light' | 'dark';
  /** Links as plain words or as rounded pills (Halcy); `highlight` is the href of the one link drawn as the accent pill. */
  linkStyle?: 'plain' | 'pills'; highlight?: string;
  className?: string; barClassName?: string; brandClassName?: string;
  linksClassName?: string; actionsClassName?: string; badgeClassName?: string; panelClassName?: string; toggleClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('a[href],button')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); toggleRef.current?.focus({ preventScroll: true }); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href],button'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { root.style.overflow = before; document.removeEventListener('keydown', onKey); };
  }, [open]);
  const words = { search: labels?.search || 'Buscar', account: labels?.account || 'Mi cuenta', bag: labels?.bag || 'Bolsa' };
  const join = (...names: Array<string | undefined>) => names.filter(Boolean).join(' ');
  const row = (items: NavShellLink[], side?: 'left' | 'right') => <nav className={join('ui-nav__links', linksClassName)} data-nav-links data-side={side} aria-label={side === 'right' ? 'Más secciones' : 'Principal'}>
    <span className="ui-nav__own" data-store-menu-replaces>{items.map(link => <a key={link.href} href={link.href} data-highlight={highlight && link.href === highlight ? '' : undefined}>{link.label}</a>)}</span>
    {side === 'right' ? null : <span className="ui-nav__store-links" data-pagosya-store-menu="links" />}
  </nav>;
  const half = Math.ceil(links.length / 2);
  const brandNode = <a href="index.html" className={join('ui-nav__brand', brandClassName)} data-nav-logo>{brand}</a>;
  const actionNodes = <div className={join('ui-nav__actions', actionsClassName)} data-nav-actions>
    <a href="buscar.html" className="ui-nav__action" data-nav-action="search" aria-label={words.search}>{NAV_ICONS.search}<span className="ui-nav__word">{words.search}</span></a>
    <a href="acceso-ingresar.html" className="ui-nav__action" data-nav-action="account" data-pagosya-account="login" aria-label={words.account}>{NAV_ICONS.account}<span className="ui-nav__word">{words.account}</span></a>
    <button type="button" className="ui-nav__action" data-nav-action="bag" data-cart-open aria-label={`Abrir ${words.bag.toLowerCase()}`}>{(cart && NAV_GOODS[cart]) || NAV_ICONS.bag}<span className="ui-nav__word">{words.bag}</span><span className={join('ui-nav__badge', badgeClassName)} data-cart-count>0</span></button>
  </div>;
  const toggles = <span className="ui-nav__toggles">
    <span className="ui-nav__store-toggle" data-pagosya-store-menu="toggle" />
    <button ref={toggleRef} type="button" className={join('ui-nav__toggle', toggleClassName)} data-nav-toggle data-store-menu-replaces aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(true)}><span className="ui-nav__bars" aria-hidden="true" /><span className="ui-nav__sr">Menú</span></button>
  </span>;
  // A floating header measures itself (the page starts under it) and turns solid once the page scrolls or the menu opens.
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!over) return;
    const header = headerRef.current;
    const measure = () => header?.style.setProperty('--ui-nav-h', `${header.offsetHeight}px`);
    const onScroll = () => setScrolled(window.scrollY > 40);
    measure(); onScroll();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (header && observer) observer.observe(header);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { observer?.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, [over]);
  return <header ref={headerRef} className={join('ui-nav', className)} data-nav-shell data-structure={structure} data-actions={actions}
    data-over={over ? '' : undefined} data-tone={over ? tone : undefined} data-scrolled={over && (scrolled || open) ? '' : undefined} data-links={linkStyle === 'pills' ? 'pills' : undefined}>
    <NavStyles />
    <div className={join('ui-nav__bar', barClassName)}>
      {toggles}
      {structure === 'split' ? <>{row(links.slice(0, half), 'left')}{brandNode}<div className="ui-nav__right">{row(links.slice(half), 'right')}{actionNodes}</div></>
        : structure === 'drawer' ? <>{brandNode}{actionNodes}</>
        : structure === 'centered' ? <>{brandNode}{actionNodes}{row(links)}</>
        : <>{brandNode}{row(links)}{actionNodes}</>}
    </div>
    <div id={panelId} className="ui-nav__panel-wrap" hidden={!open} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={panelRef} className={join('ui-nav__panel', panelClassName)} role="dialog" aria-modal="true" aria-label="Menú" onClick={event => { if ((event.target as HTMLElement).closest('a[href],[data-cart-open]')) setOpen(false); }}>
        <button type="button" className="ui-nav__close" aria-label="Cerrar menú" onClick={() => { setOpen(false); toggleRef.current?.focus({ preventScroll: true }); }}>×</button>
        <nav className="ui-nav__panel-links" aria-label="Menú">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
        <div className="ui-nav__panel-tools"><a href="buscar.html">{words.search}</a><a href="acceso-ingresar.html" data-pagosya-account="login">{words.account}</a></div>
      </div>
    </div>
  </header>;
}

/* ------------------------------------------------------------------ page shells */

/** Product page body: the shared product renderer (gallery, options, stock, add to cart). */
export function ProductDetail() { return <main id="contenido" className="ui-product-page" data-pagosya-product-page />; }
/** Checkout body: the shared, platform-owned checkout. */
export function CheckoutDetail() { return <main id="contenido" className="ui-checkout-page" data-pagosya-checkout-page />; }

/* Owner 2026-11-15 («lets go for it», after Amboras's showcase examples): two showcase pieces a written store can place — the
 * product stage (LIFT protein bars: one product per slide, its own colour world, a poster headline split around the cut-out, floating
 * pieces, counter, facts and the add button) and the hanging rail (ATELIER: products hanging on a rail, the chosen one comes forward with its
 * panel). The mechanics are the platform's (slides, swipe, cart, sizes, reduced motion); the store's design fills them. */

type KitItem = { id: string; name: string; amount: number; currency?: string; description?: string | null; discountPercent?: number | null; discountStartsAt?: string | null; discountEndsAt?: string | null;
  variants?: Array<{ id: string; name: string; amount?: number; options?: Array<{ value: string }> }>; extras?: unknown[] };

/** The store's products as config.js carries them (read after mount: the page is prerendered). */
function useKitItems(): KitItem[] {
  const [items, setItems] = useState<KitItem[]>([]);
  useEffect(() => {
    const read = () => { const list = (window as unknown as { PAGOSYA_CONFIG?: { data?: { items?: unknown } } }).PAGOSYA_CONFIG?.data?.items; if (Array.isArray(list)) setItems(list as KitItem[]); };
    read();
    window.addEventListener('load', read);
    return () => window.removeEventListener('load', read);
  }, []);
  return items;
}
const kitPrice = (item: KitItem) => {
  const now = Date.now();
  const on = item.discountPercent && (!item.discountStartsAt || Date.parse(item.discountStartsAt) <= now) && (!item.discountEndsAt || Date.parse(item.discountEndsAt) > now);
  const amount = on ? Math.round(item.amount * (100 - Number(item.discountPercent)) / 100) : item.amount;
  try { return new Intl.NumberFormat('es-BO', { style: 'currency', currency: item.currency || 'BOB' }).format(amount / 100); } catch { return `Bs ${(amount / 100).toFixed(2)}`; }
};
const kitSimple = (item: KitItem) => !item.variants?.length && !item.extras?.length;
const kitHref = (id: string) => `product.html?id=${encodeURIComponent(id)}`;
/** Light ink on a dark ground and dark ink on a light one, when the design did not choose. */
const inkFor = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141414' : '#ffffff';
};
const pad2 = (n: number) => String(n).padStart(2, '0');
/** A cut-out is never shown larger than it is (live 2026-11-15, Oh Belly: a small can blown up looked soft). */
const atMostNatural = (event: { currentTarget: HTMLImageElement }) => { const img = event.currentTarget; if (img.naturalWidth) img.style.maxWidth = `min(100%, ${img.naturalWidth}px)`; };

/** The buy pill: «Agregar · Bs 25,00» adds a simple product to the cart (the runtime's data-add); a product with options opens its
 *  page («Elegir»). Before the catalogue is read it links to the product. */
function StageBuy({ id, item, className, label = 'Agregar' }: { id?: string; item?: KitItem; className: string; label?: string }) {
  if (!id) return null;
  const arrow = <span aria-hidden="true">{arrowIcon('right')}</span>;
  if (item && kitSimple(item)) return <button type="button" className={className} data-add={item.id} data-quantity="1"><span>{label} · {kitPrice(item)}</span>{arrow}</button>;
  return <a className={className} href={kitHref(id)}><span>{item ? `Elegir · ${kitPrice(item)}` : 'Ver producto'}</span>{arrow}</a>;
}

export type StageSlide = { product?: string; top: string; bottom?: string; image: Img; bg: string; ink?: string; decor?: Img[]; facts?: string[] };

/** A full-screen product stage: one product (or flavour) per slide, each with its own background colour, a two-line poster headline
 *  split around the product's cut-out photo, up to six small floating pieces (ingredients, details), a counter with progress, short
 *  facts and the add button. Plays every few seconds while on screen, pauses on hover or focus, swipes on a phone, and stands still
 *  for visitors who ask for less motion. 2 to 6 slides. */
export function ProductStage({ slides, autoplay = 6500, label = 'Productos', buyLabel = 'Agregar', className }: { slides: StageSlide[]; autoplay?: number | false; label?: string; buyLabel?: string; className?: string }) {
  const list = slides.filter(slide => slide?.image?.src && slide.top).slice(0, 6);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const moving = useUiMotion();
  const items = useKitItems();
  const root = useRef<HTMLElement>(null);
  const start = useRef<number | null>(null);
  const count = list.length;
  const go = useCallback((index: number) => setCurrent(count ? (index + count) % count : 0), [count]);
  useEffect(() => {
    const node = root.current; if (!node) return;
    const seen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    seen.observe(node);
    return () => seen.disconnect();
  }, []);
  const playing = moving && !paused && visible && autoplay !== false && count > 1;
  const ms = clamp(typeof autoplay === 'number' ? autoplay : undefined, 3500, 12000, 6500);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => go(current + 1), ms);
    return () => clearTimeout(timer);
  }, [playing, current, ms, go]);
  if (!count) return null;
  const slide = list[current];
  const item = items.find(entry => entry.id === slide.product);
  const ink = slide.ink || inkFor(slide.bg);
  return <section ref={root} className={kx('ui-k-stage', className)} role="region" aria-roledescription="carrusel" aria-label={label} data-playing={playing}
    style={{ '--k-stage-bg': slide.bg, '--k-stage-ink': ink, '--k-stage-ms': `${ms}ms` } as CSSProperties}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setPaused(true); }} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    onKeyDown={event => { if (event.key === 'ArrowRight') go(current + 1); if (event.key === 'ArrowLeft') go(current - 1); }}
    onPointerDown={event => { start.current = event.clientX; }}
    onPointerUp={event => { if (start.current === null) return; const dx = event.clientX - start.current; start.current = null; if (Math.abs(dx) > 48) go(current + (dx < 0 ? 1 : -1)); }}>
    <RichStyles />
    {list.map((entry, index) => <div key={index} className="ui-k-stage__slide" data-on={index === current} aria-hidden={index !== current} role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${count}`}>
      <h2 className="ui-k-stage__title"><span className="ui-k-stage__top">{entry.top}</span>{entry.bottom ? <span className="ui-k-stage__bottom">{entry.bottom}</span> : null}</h2>
      <div className="ui-k-stage__product"><img src={entry.image.src} alt={entry.image.alt} loading={index === 0 ? 'eager' : 'lazy'} draggable={false} onLoad={atMostNatural} /></div>
      {(entry.decor ?? []).filter(piece => piece?.src).slice(0, 6).map((piece, spot) => <img key={spot} className="ui-k-stage__decor" data-spot={spot} src={piece.src} alt="" aria-hidden="true" loading="lazy" draggable={false} />)}
    </div>)}
    <div className="ui-k-stage__bar">
      <div className="ui-k-stage__count"><span><strong>{pad2(current + 1)}</strong><small> / {pad2(count)}</small></span>
        {count > 1 ? <span className="ui-k-stage__steps">{list.map((_, index) => <button key={index} type="button" aria-label={`Ir a ${index + 1}`} aria-current={index === current} data-done={index < current} onClick={() => go(index)}><i /></button>)}</span> : null}
      </div>
      {slide.facts?.length ? <ul className="ui-k-stage__facts">{slide.facts.slice(0, 4).map((fact, index) => <li key={index}>{fact}</li>)}</ul> : <span />}
      <StageBuy id={slide.product} item={item} className="ui-k-stage__buy" label={buyLabel} />
    </div>
    {count > 1 ? <div className="ui-k-stage__arrows"><button type="button" className="ui-k-arrow" aria-label="Anterior" onClick={() => go(current - 1)}>{arrowIcon('left')}</button><button type="button" className="ui-k-arrow" aria-label="Siguiente" onClick={() => go(current + 1)}>{arrowIcon('right')}</button></div> : null}
  </section>;
}

export type HangingPiece = { product: string; image: Img; note?: string };

/** Products hanging on a rail (clothing, bags, anything that hangs or stands): the chosen one comes forward, the others step back,
 *  and a panel beside it shows its name, price, short description, its real sizes or options and the button. Hover chooses on a
 *  computer; on a phone the pieces scroll sideways and a tap chooses. 2 to 6 pieces, cut-out photos. mount="stand": photos of people
 *  wearing the clothes stand in a lineup on a floor instead of hanging. */
export function HangingRail({ items, label = 'Colección', kicker, buyLabel = 'Agregar', tone = 'dark', mount = 'hang', className }: { items: HangingPiece[]; label?: string; kicker?: string; buyLabel?: string; tone?: 'dark' | 'light'; mount?: 'hang' | 'stand'; className?: string }) {
  const list = items.filter(piece => piece?.product && piece.image?.src).slice(0, 6);
  const [chosen, setChosen] = useState(Math.min(1, Math.max(0, list.length - 1)));
  const catalogue = useKitItems();
  if (!list.length) return null;
  const piece = list[Math.min(chosen, list.length - 1)];
  const item = catalogue.find(entry => entry.id === piece.product);
  const options = [...new Set((item?.variants ?? []).flatMap(variant => variant.options?.length ? [variant.options[0].value] : [variant.name]).filter(Boolean))].slice(0, 8);
  const text = (piece.note || item?.description || '').trim();
  return <section className={kx('ui-k-rail-show', `ui-k-rail-show--${tone}`, mount === 'stand' && 'ui-k-rail-show--stand', className)} aria-label={label}>
    <RichStyles />
    <div className="ui-k-rail-show__stage">
      <span className="ui-k-rail-show__bar" aria-hidden="true" />
      <div className="ui-k-rail-show__pieces" role="list">
        {list.map((entry, index) => <button key={index} type="button" role="listitem" className="ui-k-rail-show__piece" data-on={index === chosen} aria-pressed={index === chosen}
          aria-label={catalogue.find(found => found.id === entry.product)?.name ?? entry.image.alt} onPointerEnter={event => { if (event.pointerType === 'mouse') setChosen(index); }} onFocus={() => setChosen(index)} onClick={() => setChosen(index)}>
          <svg className="ui-k-rail-show__hook" viewBox="0 0 40 30" aria-hidden="true"><path d="M20 2a5 5 0 1 1 5 5c-2 0-5 1-5 4v3L3 27h34L20 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <img src={entry.image.src} alt="" loading="lazy" draggable={false} onLoad={atMostNatural} />
        </button>)}
      </div>
    </div>
    <div className="ui-k-rail-show__panel" aria-live="polite">
      {kicker ? <p className="ui-k-rail-show__kicker">{kicker}</p> : null}
      <div className="ui-k-rail-show__head"><h3>{item?.name ?? piece.image.alt}</h3>{item ? <span>{kitPrice(item)}</span> : null}</div>
      {text ? <p className="ui-k-rail-show__text">{text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text}</p> : null}
      {options.length ? <div className="ui-k-rail-show__options"><span>Elige</span><div>{options.map(option => <a key={option} href={kitHref(piece.product)}>{option}</a>)}</div></div> : null}
      <StageBuy id={piece.product} item={item} className="ui-k-rail-show__buy" label={buyLabel} />
    </div>
  </section>;
}
