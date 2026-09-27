import './source-face.css';

/**
 * YAPI's face: the waiting animation, shared by the idle canvas and the build
 * stage.
 *
 * The canvas has shown, in turn, stock photography behind a fictional brand, a
 * stack of storefront cards with a game docked in the corner, a wireframe of
 * page blocks, and an ink line drawing. Every one of them drew a window holding
 * a site nobody had built yet. This draws the thing the merchant is about to
 * talk to: an orb that blinks, glances, smirks, breathes and turns all the way
 * round.
 *
 * It carries no controls. A pause button and a voice button both sat under it
 * for a while; the face is ambient, and chrome around something ambient asks the
 * merchant to attend to it. Motion answers to the system's reduced-motion
 * setting instead, which is where a merchant who wants less of it already said
 * so.
 *
 * Geometry and moods live in the stylesheet. This file owns only the clock.
 */

export type FaceMood = 'idle' | 'glance' | 'smirk' | 'breathe' | 'spin' | 'hop' | 'spark';
export type FaceColor = 'amarillo' | 'verde' | 'azul' | 'rosa' | 'morado' | 'naranja';

/**
 * The loop, written as a rhythm rather than a list: quiet beats between the
 * expressive ones, and the full turn saved for last so it stays a surprise.
 */
export const FACE_MOODS: readonly FaceMood[] = ['idle', 'glance', 'idle', 'smirk', 'breathe', 'idle', 'spark', 'idle', 'glance', 'idle', 'smirk', 'spin'];

/**
 * Gestures a caller may trigger in answer to something the merchant did.
 *
 * Two of them also sit in the ambient loop: the shimmer because it is quiet
 * enough to read as life rather than news, the turn because it was already the
 * loop's rare surprise. The hop is the one the clock never plays — a face that
 * celebrates every twenty seconds is not celebrating, it is twitching, so it is
 * spent only on something the merchant actually finished.
 */
export const FACE_REACTIONS: readonly FaceMood[] = ['hop', 'spark', 'spin'];

/** The gesture reserved for earned moments; never on the clock. */
export const FACE_EARNED: readonly FaceMood[] = ['hop'];

/** Long enough for the gesture to land before the ambient rhythm takes over. */
export const FACE_REACTION_MS = 1100;

/** Long enough that each expression is seen, short enough to stay alive. */
export const FACE_BEAT_MS = 2600;

/** Filter ids must be unique per mount: two faces on one page share a document. */
let faceCount = 0;

export function renderFace(options: { color?: FaceColor } = {}): string {
  const grain = `face-grain-${++faceCount}`;
  return `<figure class="yapi-face" data-face data-color="${options.color || 'amarillo'}" data-mood="idle" aria-hidden="true">
    <div class="yapi-face__stage">
      <div class="yapi-face__orb">
        <div class="yapi-face__ball">
          <svg class="yapi-face__grain" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs><filter id="${grain}" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch"/>
              <feColorMatrix type="saturate" values="0"/>
            </filter></defs>
            <rect width="100%" height="100%" filter="url(#${grain})"/>
          </svg>
          <span class="yapi-face__shine"></span>
          <span class="yapi-face__shade"></span>
          <div class="yapi-face__features">
            <span class="yapi-face__eye" data-eye="left"></span>
            <span class="yapi-face__eye" data-eye="right"></span>
            <span class="yapi-face__mouth"></span>
          </div>
        </div>
      </div>
      <span class="yapi-face__ground"></span>
    </div>
  </figure>`;
}

/**
 * Starts the face and returns its teardown. The caller owns that teardown: this
 * runs on a canvas that stays open for as long as the Studio does.
 */
export function mountFace(host: HTMLElement): { react(mood: FaceMood): void; destroy(): void } {
  const figure = host.matches?.('[data-face]') ? host : host.querySelector<HTMLElement>('[data-face]');
  if (!figure) return { react() {}, destroy() {} };
  // A merchant who asked their system for less motion keeps the face and the
  // blink and loses the rest; the moods are decoration here, not information.
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let beat = 0, timer: ReturnType<typeof setInterval> | undefined;
  let reaction: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    if (timer) clearInterval(timer);
    if (reaction) clearTimeout(reaction);
    timer = undefined; reaction = undefined;
  };
  const start = () => {
    stop();
    if (still || document.hidden) return;
    timer = setInterval(() => {
      beat = (beat + 1) % FACE_MOODS.length;
      figure.dataset.mood = FACE_MOODS[beat];
    }, FACE_BEAT_MS);
  };
  // Nothing should animate behind a hidden tab; the canvas outlives the visit.
  const onVisibility = () => start();
  document.addEventListener('visibilitychange', onVisibility);
  start();

  return {
    /**
     * Plays one gesture now, out of turn, then hands the face back to its
     * rhythm. The clock restarts rather than resumes, so a reaction is never
     * cut short by a beat that was already halfway through when it arrived.
     *
     * A merchant who asked for less motion still gets the shimmer — it only
     * moves light — and loses the hop and the turn, which move the body.
     */
    react(mood: FaceMood) {
      if (still && mood !== 'spark') return;
      stop();
      // Re-assigning the same value would not restart a running animation.
      figure.dataset.mood = 'idle';
      void figure.offsetWidth;
      figure.dataset.mood = mood;
      reaction = setTimeout(() => { figure.dataset.mood = 'idle'; start(); }, FACE_REACTION_MS);
    },
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

/**
 * La cara en pequeño: la marca de YAPI.
 *
 * Donde antes había un punto de color —en cada mensaje del chat, en la nota de
 * bienvenida y en la que aparece mientras YAPI trabaja— ahora va la misma cara
 * del lienzo. Es el mismo personaje en todas partes, y cuando está razonando se
 * le nota: parpadea, mira alrededor y respira.
 *
 * No lleva reloj propio; la animación es CSS, así que se puede pintar dentro de
 * una plantilla sin montar nada ni limpiar nada después.
 */
export function renderFaceMark(options: { size?: number; thinking?: boolean; color?: FaceColor } = {}): string {
  return `<span class="yapi-mark${options.thinking ? ' is-thinking' : ''}" data-color="${options.color || 'amarillo'}"${options.size ? ` style="--mark:${options.size}px"` : ''} aria-hidden="true">
    <span class="yapi-mark__ball">
      <i class="yapi-mark__eye"></i><i class="yapi-mark__eye"></i><i class="yapi-mark__mouth"></i>
    </span>
  </span>`;
}
