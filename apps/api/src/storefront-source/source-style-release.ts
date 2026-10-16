import { sideCallDeadlineMs } from './source-side-deadlines';
import { voiceDeadlineMs } from './store-voice-design';

/** How long the style run waits for the picked card's hero before building without it (source-style-proposals.ts). */
export const PICK_HERO_WAIT_MS = 15_000;

/** How long a pick or a new request waits for a stopping style run to let go of the store: the hero wait, then the store-voice
 *  call the run awaits before its release, plus a margin. A fixed 20 s lost picks on the ChatGPT plan (live 2026-10-15). */
export function styleReleaseWaitMs(chatgptPlan: boolean): number {
  return PICK_HERO_WAIT_MS + sideCallDeadlineMs(voiceDeadlineMs(), chatgptPlan) + 15_000;
}
