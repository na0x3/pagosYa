/** The login page's animated mesh gradient (@paper-design/shaders' MeshGradient, framework-free since this dashboard
 * has no React). The owner found the component's four mid-blues streaky, so it is tuned toward a deep navy field with
 * one light-blue glow and film grain. */

export const LOGIN_GRADIENT = {
  colors: ["hsl(222, 70%, 7%)", "hsl(216, 78%, 14%)", "hsl(210, 70%, 24%)", "hsl(198, 85%, 72%)"],
  distortion: 0.55, swirl: 0.06, offsetX: 0.35, offsetY: 0.3, scale: 1.25, rotation: 0,
  grainOverlay: 0.28,
  // A slow drift: it sits behind a form.
  speed: 0.18,
};

/** @param {boolean} reducedMotion */
export const loginShaderSpeed = (reducedMotion) => (reducedMotion ? 0 : LOGIN_GRADIENT.speed);

/**
 * The same uniforms MeshGradient passes, for a pattern that fills its box (fit "none").
 * @param {typeof LOGIN_GRADIENT} params @param {(color: string) => number[]} toColor
 */
export function meshGradientUniforms(params, toColor) {
  return {
    u_colors: params.colors.map(toColor), u_colorsCount: params.colors.length,
    u_distortion: params.distortion, u_swirl: params.swirl, u_grainMixer: 0, u_grainOverlay: params.grainOverlay ?? 0,
    u_fit: 0, u_scale: params.scale, u_rotation: params.rotation, u_offsetX: params.offsetX, u_offsetY: params.offsetY,
    u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0,
  };
}

/** Mounts the gradient in `host`; returns a disposer. Without WebGL the CSS fallback gradient stays visible.
 * @param {HTMLElement} host */
export async function mountLoginShader(host) {
  try {
    const { ShaderMount, meshGradientFragmentShader, getShaderColorFromString } = await import("@paper-design/shaders");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mount = new ShaderMount(host, meshGradientFragmentShader, meshGradientUniforms(LOGIN_GRADIENT, getShaderColorFromString), undefined, loginShaderSpeed(reduce.matches));
    const onMotion = () => mount.setSpeed(loginShaderSpeed(reduce.matches));
    reduce.addEventListener("change", onMotion);
    host.classList.add("is-rendering");
    return () => { reduce.removeEventListener("change", onMotion); mount.dispose(); host.classList.remove("is-rendering"); };
  } catch {
    return () => {};
  }
}
