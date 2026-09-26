import assert from "node:assert/strict";
import test from "node:test";
import { LOGIN_GRADIENT, meshGradientUniforms, loginShaderSpeed } from "../src/login-shader.mjs";

test("the login gradient uses the four blues and the component's settings", () => {
  assert.deepEqual(LOGIN_GRADIENT.colors, ["hsl(216, 90%, 27%)", "hsl(243, 68%, 36%)", "hsl(205, 91%, 64%)", "hsl(211, 61%, 57%)"]);
  const uniforms = meshGradientUniforms(LOGIN_GRADIENT, (color) => [color.length, 0, 0, 1]);
  assert.equal(uniforms.u_colorsCount, 4);
  assert.equal(uniforms.u_colors.length, 4);
  assert.equal(uniforms.u_distortion, 0.8);
  assert.equal(uniforms.u_swirl, 0.1);
  assert.equal(uniforms.u_scale, 1);
  assert.equal(uniforms.u_fit, 0);
});

test("the gradient moves slowly, and stands still for people who reduce motion", () => {
  assert.equal(loginShaderSpeed(false), LOGIN_GRADIENT.speed);
  assert.ok(LOGIN_GRADIENT.speed > 0 && LOGIN_GRADIENT.speed < 1);
  assert.equal(loginShaderSpeed(true), 0);
});
