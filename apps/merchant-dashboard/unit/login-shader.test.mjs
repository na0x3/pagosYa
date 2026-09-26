import assert from "node:assert/strict";
import test from "node:test";
import { LOGIN_GRADIENT, meshGradientUniforms, loginShaderSpeed } from "../src/login-shader.mjs";

test("the login gradient is mostly deep navy with one light-blue glow and film grain", () => {
  assert.equal(LOGIN_GRADIENT.colors.length, 4);
  // Three dark blues and a single light one, so the light reads as a glow instead of bright streaks.
  const lightness = LOGIN_GRADIENT.colors.map((color) => Number(/(\d+)%\)$/.exec(color)[1]));
  assert.equal(lightness.filter((value) => value < 30).length, 3);
  assert.equal(lightness.filter((value) => value >= 60).length, 1);
  const uniforms = meshGradientUniforms(LOGIN_GRADIENT, (color) => [color.length, 0, 0, 1]);
  assert.equal(uniforms.u_colorsCount, 4);
  assert.ok(uniforms.u_grainOverlay > 0);
  assert.equal(uniforms.u_fit, 0);
});

test("the gradient moves slowly, and stands still for people who reduce motion", () => {
  assert.equal(loginShaderSpeed(false), LOGIN_GRADIENT.speed);
  assert.ok(LOGIN_GRADIENT.speed > 0 && LOGIN_GRADIENT.speed < 1);
  assert.equal(loginShaderSpeed(true), 0);
});
