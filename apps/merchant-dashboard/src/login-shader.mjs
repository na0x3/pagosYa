/** The login page's animated mesh gradient: the component the owner chose (@paper-design/shaders-react's
 * MeshGradient) rendered with the framework-free @paper-design/shaders, since this dashboard has no React. */

export const LOGIN_GRADIENT = {
  colors: ["hsl(216, 90%, 27%)", "hsl(243, 68%, 36%)", "hsl(205, 91%, 64%)", "hsl(211, 61%, 57%)"],
  distortion: 0.8, swirl: 0.1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0,
  // Calmer than the component's default of 1: it sits beside a form.
  speed: 0.35,
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
    u_distortion: params.distortion, u_swirl: params.swirl, u_grainMixer: 0, u_grainOverlay: 0,
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
