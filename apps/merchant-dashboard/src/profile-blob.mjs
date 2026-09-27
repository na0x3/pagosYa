// Each person's blob (B1). The API sends `blobSeed`, a stable one-way digest of the dashboard user; the session
// profile's `profileAvatarId` is the variation (1–999). Stored 1–4 values from the animal avatars stay valid.
import { blobDataUri, blobSvg } from "@pagosya/blob-characters";
import { escapeHtml } from "./html.mjs";

export const MAX_VARIATION = 999;
export const PROFILE_BLOB_ALTERNATIVES = 3;

/** Any stored or submitted variation collapses to an integer 1–999, defaulting to 1. */
export function normalizeVariation(value) {
  const id = Number(value);
  return Number.isInteger(id) && id >= 1 && id <= MAX_VARIATION ? id : 1;
}

/** A variation 1–999 that is not in `exclude`. `random` is injectable so tests are deterministic. */
export function randomVariation(exclude = [], random = Math.random) {
  const taken = new Set(exclude);
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = 1 + Math.floor(random() * MAX_VARIATION);
    if (candidate >= 1 && candidate <= MAX_VARIATION && !taken.has(candidate)) return candidate;
  }
  for (let candidate = 1; candidate <= MAX_VARIATION; candidate++) if (!taken.has(candidate)) return candidate;
  return 1;
}

/** The profile editor's choices: the current variation first, then three different ones. */
export function variationChoices(current, random = Math.random) {
  const choices = [normalizeVariation(current)];
  while (choices.length < 1 + PROFILE_BLOB_ALTERNATIVES) choices.push(randomVariation(choices, random));
  return choices;
}

/** The Blobatar seed of one variation of one person. */
export const profileBlobSeed = (blobSeed, variation) => `${blobSeed}:${normalizeVariation(variation)}`;

/**
 * A person's blob, on a plate so it reads on any background.
 * As the profile picture it is a named image (the profile name, or "Mi perfil" when there is none); `decorative`
 * blobs sit beside their own text or inside a labelled button. Until the API has sent `blobSeed`, a neutral
 * placeholder holds the space so nothing jumps and no wrong face flashes.
 */
export function profileBlobHtml({ blobSeed, variation, name = "", decorative = false }) {
  const label = decorative ? "" : String(name ?? "").trim() || "Mi perfil";
  if (!blobSeed) {
    return label
      ? `<span class="blob-avatar-pending" role="img" aria-label="${escapeHtml(label)}"></span>`
      : '<span class="blob-avatar-pending" aria-hidden="true"></span>';
  }
  return blobSvg(profileBlobSeed(blobSeed, variation), { plate: true, title: label || undefined, className: "profile-blob" });
}

/** The same blob as a static `data:` URI (the dice-board runner is a CSS background). */
export function profileBlobUri(blobSeed, variation) {
  return blobDataUri(profileBlobSeed(blobSeed, variation), { plate: true });
}
