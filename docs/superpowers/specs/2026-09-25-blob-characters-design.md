# Blob characters — design

Date: 2026-09-25. Status: design approved by the owner in conversation ("o that but also t2"); this written
spec awaits the owner's review.

Owner's request: pagosYa gets an assistant character "not just decoration" — idle on the dashboard, happy on a
successful payment, concerned on a failed one, waiting while a QR payment is pending, alert on a new order,
talking in help and onboarding — "i want users to have those pfp, yapi, to be like that also", and, after
comparing https://blobatar.dev/ with https://avatars.bible-strong.app/, "replace the animals for it".

## 1. Engine choice

| | Blobatar (blobatar.dev) | Bible Strong Avatar Lab |
|---|---|---|
| Style | Blob characters, 10 shapes, 8 hue stops, two capsule eyes | Same style, plus 3D-inspired rotation |
| Behaviour | 14 held expressions (`idle`, `happy`, `sad`, `mad`, `surprised`, `wink`, `sleepy`, `smug`, `unsure`, `scared`, `love`, `shy`, `sick`, `thinking`), idle motion (breathe, bob, blink, glance) in CSS, eyes that follow a target | 23 authored animations (sleeping, listening, thinking, working, excited, laughing, proud, sad…) |
| License | MIT | GNU AGPL v3 |
| Runtime | `blobatar` ~4.4 KB gzipped, no dependencies, offline, deterministic from a string | React-based engine packages from the same project |

**Decision: Blobatar.** The Avatar Lab is AGPL v3, whose network clause would require publishing pagosYa's
source for a modified version served to users. Its good idea — animations composed of expression steps — is
rebuilt here in pagosYa's own code on top of Blobatar's expressions (section 4). No Avatar Lab code or assets are
used.

Packages: `blobatar` (string API `blobatar(name, options)`, `blobatar/expression`, `blobatar/motion.css`,
`blobatar/gaze`). The dashboard and Studio are vanilla JS/TS, so the React adapter is not needed.

## 2. What exists (from the code, 2026-09-25)

- **Companions** (`apps/merchant-dashboard/src/companions.mjs`): 9 illustrated animals tied to XP levels
  (Perdiz, Capibara, Oso hormiguero, Vizcacha, …); the first 4 are "starters", the only ones usable as profile
  avatar and dice-board runner. Art is PNG (`/assets/profile-<id>.png`).
- **Profile avatar**: `MerchantSession.profileAvatarId Int @default(1)`, validated to 1–4 in
  `apps/api/src/dashboard/merchant-session.service.ts` (`updateSessionIdentity`); the profile editor offers the 4
  starters.
- **YAPI's face** (`apps/merchant-studio/src/source-face.ts` + `.css`): a CSS orb with moods `idle`, `glance`,
  `smirk`, `breathe`, `spin`, `hop`, `spark`, used by the idle canvas and the build stage.
- **Payment screens**: pagosYa's hosted payment page in `apps/checkout` shows QR waiting, success and failure.

## 3. The characters

1. **Each user's blob.** Seeded from `merchantUserId` plus the session profile's `profileAvatarId`, so it is
   stable, unique per person and needs no schema change. `profileAvatarId` becomes a variation number:
   validation widens from 1–4 to 1–999, and "Otra variación" in the profile editor picks a new number (free,
   instant). The profile editor shows the current blob plus 3 alternatives to choose from, replacing the 4
   animals. The accessible name is the profile name (`title`), never a description of the image.
2. **The 9 companions become 9 blob characters.** Same levels, XP thresholds, names of the levels and progression;
   each gets a fixed Blobatar look (pinned shape, hue and tone), a character name and a signature expression.
   They appear where the animals did: the levels map, unlock celebrations and the dice board runners. The
   runner is the user's own blob.
3. **YAPI** is one fixed blob in pagosYa's amber (`#ffbd59` family), replacing the orb everywhere YAPI's face
   appears.

Existing PNG companion assets stay in the repo until the rollout is verified, then are removed.

## 4. Moods and animations (pagosYa code on top of Blobatar)

A small shared module renders a blob and plays **animations**: timed sequences of Blobatar expressions plus
optional body motion from a CSS keyframe set (`bounce`, `hop`, `shake`, `celebrate`, `talk`). An animation is
data (`[{ expression, hold, motion }]`), plays once or loops, and always returns to its resting mood.

| Moment | Animation |
|---|---|
| Dashboard, nothing happening | `idle` with Blobatar's breathe/blink/glance |
| New order | `surprised` + `hop`, then back to idle |
| Payment successful | `happy` + `celebrate` (a short burst: squash-and-stretch and a few confetti dots), then `love` or `happy` held briefly |
| Payment failed | `unsure` → `sad`, a small `shake` |
| Waiting for a QR payment | `thinking` looped |
| Help / onboarding | "talking": `idle` ↔ `surprised` alternating with the `talk` bounce while text appears |
| YAPI listening (merchant typing) | eyes follow the composer caret/pointer (`gaze`) |
| YAPI building | `thinking` looped, `working` = `thinking` + gentle `bounce` |
| YAPI done | `happy` → `smug` |
| YAPI failed | `unsure` |

Reduced motion (`prefers-reduced-motion`) and a motion-off preference show the target expression instantly with no
body motion. Characters are decorative (`aria-hidden`) except the profile picture (named by `title`); every mood
change that carries information (payment failed, new order) is also stated in text next to it.

## 5. Sub-projects

| # | Part | Delivers |
|---|---|---|
| B1 | Profile pictures and companions | The shared blob module (render + animation player), user blobs in the profile editor and top bar, "Otra variación", `profileAvatarId` 1–999, the 9 blob companions on the levels map, unlock celebration and dice board. |
| B2 | YAPI and the dashboard assistant | YAPI's blob replaces the orb (idle canvas, build stage, chat) with the YAPI moods; the dashboard assistant blob with idle, new order, payment successful and failed, and talking in help/onboarding. |
| B3 | Payment screens | The waiting / success / failed moods on pagosYa's hosted payment page (`apps/checkout`), in the page's pagosYa-owned area only — never inside the store's own design. |

Order: B1, then B2, then B3.

## 6. Tests and evidence

- Unit: the same seed always renders the same blob; variation numbers outside 1–999 are refused by the API;
  animations run their steps with the right holds and return to rest; reduced motion jumps to the final
  expression.
- Browser (Playwright): the profile editor shows the blob and changes it with "Otra variación" and saves it; the
  levels map and dice board show blob companions; YAPI's blob changes mood through a mocked build (thinking →
  happy, and → unsure on failure); the payment page shows thinking while waiting and happy on success.
- Screenshots at 390 and 1280 of the profile editor, levels map, YAPI idle and building, and the three payment
  states, reviewed before merging.
- No network calls: Blobatar renders in-process.

## 7. Out of scope

The hosted Blobatar HTTP endpoint (never used; everything renders locally), shopper avatars inside stores,
voice or lip-sync, and any use of Bible Strong Avatar Lab code or assets.
