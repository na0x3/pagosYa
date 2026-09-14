import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import type { AnimationItem } from 'lottie-web';

export function useCreativeMotion() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(!query.matches && (window as any).PAGOSYA_CONFIG?.motion !== 'off');
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return enabled;
}

export function CreativeProvider({ children }: { children: ReactNode }) {
  const enabled = useCreativeMotion();
  return <MotionConfig reducedMotion={enabled ? 'user' : 'always'} transition={enabled ? undefined : { duration: 0 }}>{children}</MotionConfig>;
}

/** Client-only SVG player: never evaluates After Effects expressions or fetches media. */
export function Lottie({ animationData, className, style, loop = true, autoplay = true }: {
  animationData: Record<string, unknown>; className?: string; style?: CSSProperties; loop?: boolean; autoplay?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<AnimationItem | null>(null);
  const enabled = useCreativeMotion();
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const playing = useRef(false);
  playing.current = enabled && autoplay && !paused;
  useEffect(() => {
    let disposed = false;
    setFailed(false);
    const assets = animationData.assets;
    if (Array.isArray(assets) && assets.some(asset => asset && typeof asset === 'object' && 'p' in asset)) {
      setFailed(true); return;
    }
    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (disposed || !container.current) return;
      const animation = lottie.loadAnimation({ container: container.current, renderer: 'svg', loop, autoplay: false, animationData: JSON.parse(JSON.stringify(animationData)) });
      player.current = animation;
      animation.addEventListener('DOMLoaded', () => {
        if (playing.current && !document.hidden) animation.play();
        else animation.goToAndStop(0, true);
      });
      animation.addEventListener('data_failed', () => setFailed(true));
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; player.current?.destroy(); player.current = null; };
  }, [animationData, loop]);
  useEffect(() => {
    const update = () => {
      if (!enabled) player.current?.goToAndStop(0, true);
      else if (playing.current && !document.hidden) player.current?.play();
      else player.current?.pause();
    };
    update(); document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [enabled, autoplay, paused]);
  return <div className={className} style={style} data-creative-lottie data-animation-state={failed ? 'unavailable' : enabled && autoplay && !paused ? 'playing' : 'paused'}>
    <div ref={container} aria-hidden="true" />
    {failed ? <span role="status">Animación no disponible</span> : loop && autoplay && enabled ? <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Reanudar animación' : 'Pausar animación'}</button> : null}
  </div>;
}
