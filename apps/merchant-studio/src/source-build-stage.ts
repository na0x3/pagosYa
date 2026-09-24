import './source-build-progress.css';
import { escapeHtml as escape } from './studio-ui';
import { renderBuildProgress, type BuildProgress } from './source-build-progress';
import { renderFace, mountFace } from './source-face';

/**
 * The waiting room for a generation, which routinely runs 60-120 seconds.
 *
 * It shows the same face as the idle canvas above the step YAPI is actually on
 * and the time spent. The face is quiet here — no voice button — because the
 * status line is already talking. It used to show a wireframe of blocks lighting
 * up and offer a small game; the blocks implied a preview nobody had built yet,
 * and the game was clutter beside a merchant waiting on their own store.
 *
 * The animation is decorative, so it is not announced; the status line and the
 * step list carry the real information.
 */

export type BuildStageState = { status: string; progress: BuildProgress | null };

/**
 * Elapsed seconds to a fraction that always moves forward and never claims to
 * be finished. A generation has no honest total, so the bar reports confidence,
 * not completion: time gives a smooth asymptote and each finished step raises
 * the floor beneath it.
 */
export function buildStageRatio(elapsedSeconds: number, completedSteps: number): number {
  const fromTime = 1 - Math.exp(-Math.max(0, elapsedSeconds) / 70);
  const fromSteps = 1 - Math.pow(0.78, Math.max(0, completedSteps));
  return Math.min(0.95, Math.max(fromTime, fromSteps));
}

export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function renderBuildStage(state: BuildStageState): string {
  return `<div class="yapi-stage" data-build-stage>
    <div class="yapi-stage__scene">${renderFace()}</div>
    <p class="yapi-stage__status" data-stage-status role="status">${escape(state.status)}</p>
    <div class="yapi-stage__meter"><span data-stage-meter style="width:0%"></span></div>
    <p class="yapi-stage__meta"><span data-stage-elapsed>0:00</span><button type="button" class="yapi-stage__link" data-stage-steps aria-expanded="false" hidden>Ver pasos</button></p>
    <div class="yapi-stage__steps" data-stage-steps-list hidden></div>
  </div>`;
}

/**
 * Attaches behaviour to a rendered stage and returns its teardown. The caller
 * re-renders rarely but polls often, so `update` mutates in place: replacing the
 * markup would restart the animation and the drawing would jump back to the
 * first scene.
 */
export function mountBuildStage(host: HTMLElement): { update(state: BuildStageState): void; destroy(): void } {
  const stage = host.querySelector<HTMLElement>('[data-build-stage]');
  if (!stage) return { update() {}, destroy() {} };
  const statusEl = stage.querySelector<HTMLElement>('[data-stage-status]');
  const meterEl = stage.querySelector<HTMLElement>('[data-stage-meter]');
  const elapsedEl = stage.querySelector<HTMLElement>('[data-stage-elapsed]');
  const stepsButton = stage.querySelector<HTMLButtonElement>('[data-stage-steps]');
  const stepsList = stage.querySelector<HTMLElement>('[data-stage-steps-list]');
  const face = mountFace(stage);

  let current: BuildStageState = { status: '', progress: null };
  let startedAt = Date.now();
  let stepsOpen = false;
  // Remembered so the hop fires on the edge into a finished build, not on every
  // poll that arrives afterwards.
  let wasRunning = false;
  let doneSteps = 0;

  stepsButton?.addEventListener('click', () => {
    stepsOpen = !stepsOpen;
    stepsButton.setAttribute('aria-expanded', String(stepsOpen));
    stepsButton.textContent = stepsOpen ? 'Ocultar pasos' : 'Ver pasos';
    if (stepsList) stepsList.hidden = !stepsOpen;
  });


  const tick = window.setInterval(() => paint(), 1000);

  function paint() {
    const progress = current.progress;
    const steps = progress?.steps?.filter(step => step && typeof step.label === 'string') || [];
    const completed = steps.filter(step => step.status === 'completed').length;
    const elapsed = (Date.now() - (progress?.startedAt || startedAt)) / 1000;
    const ratio = buildStageRatio(elapsed, completed);
    if (elapsedEl) elapsedEl.textContent = formatElapsed(elapsed);
    if (meterEl) meterEl.style.width = `${(ratio * 100).toFixed(1)}%`;
    if (stepsList && stepsOpen) stepsList.innerHTML = progress ? renderBuildProgress(progress, true) : '';
    if (stepsButton) stepsButton.hidden = !steps.length;
  }

  return {
    update(state) {
      current = state;
      if (state.progress?.startedAt) startedAt = state.progress.startedAt;
      const label = state.progress?.status === 'running'
        ? state.progress.steps.at(-1)?.label || state.status
        : state.status;
      if (statusEl && statusEl.textContent !== label) statusEl.textContent = label;

      // The two moments in a build worth a gesture. A step landing gets the
      // shimmer, because progress is news the merchant is waiting on; the build
      // finishing gets the hop, which is spent once and therefore still means
      // something when it arrives.
      const running = state.progress?.status === 'running';
      const completed = (state.progress?.steps || []).filter(step => step.status === 'completed').length;
      if (running && completed > doneSteps) face.react('spark');
      if (wasRunning && !running && state.progress) face.react('hop');
      wasRunning = running;
      doneSteps = completed;

      paint();
    },
    destroy() {
      window.clearInterval(tick);
      face.destroy();
    },
  };
}
