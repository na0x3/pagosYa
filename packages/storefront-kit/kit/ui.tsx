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
import { motion, useScroll, useTransform } from 'motion/react';

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
 * `renderInfoPages`). Never put children in the mount: the runtime owns it. */
export function InfoPage({ kind }: { kind: InfoPageKind }) {
  return <main id="contenido" className="ui-info-page" data-info-page={kind}>
    <style data-pagosya-standard-pages="" dangerouslySetInnerHTML={{ __html: STANDARD_PAGE_CSS }} />
    <Container><Display>{INFO_PAGE_TITLES[kind]}</Display><div data-pagosya-page={kind} /></Container>
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
/** Reserves the inline account slot in Studio and hosted storefronts. The trusted parent renders the form in a sibling iframe;
 * authored code receives only geometry. Static exports retain the secure account-link fallback below. */
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
  return <Tag className="ui-statement ui-words" data-align={align === 'center' ? 'center' : undefined}>
    {words.map((word, index) => <span key={index}>{word}{index < words.length - 1 ? ' ' : ''}</span>)}
  </Tag>;
}
export function TextFillStatement(props: { children: string; align?: 'start' | 'center' }) { return <Statement {...props} />; }
export function Marquee({ items, speed = 38 }: { items: string[]; speed?: number }) {
  const list = items.filter(Boolean).slice(0, 12);
  const run = (hidden: boolean) => <div className="ui-marquee__item" aria-hidden={hidden || undefined}>{list.map((item, i) => <span key={i}>{item}</span>)}</div>;
  return <div className="ui-marquee" style={{ '--ui-marquee-duration': `${Math.min(90, Math.max(12, speed))}s` } as CSSProperties}>
    <div className="ui-marquee__track">{run(false)}{run(true)}</div>
  </div>;
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

/* ------------------------------------------------------------------ page shells */

/** Product page body: the shared product renderer (gallery, options, stock, add to cart). */
export function ProductDetail() { return <main id="contenido" className="ui-product-page" data-pagosya-product-page />; }
/** Checkout body: the shared, platform-owned checkout. */
export function CheckoutDetail() { return <main id="contenido" className="ui-checkout-page" data-pagosya-checkout-page />; }
