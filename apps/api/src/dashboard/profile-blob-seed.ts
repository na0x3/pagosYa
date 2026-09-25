import { createHash } from "node:crypto";

/** Blob characters (B1): a session profile's `profileAvatarId` is a blob variation from 1 to this. */
export const MAX_PROFILE_VARIATION = 999;

/**
 * The seed of a dashboard user's blob profile pictures. Stable for the user and one-way, so the browser never
 * learns the raw user id from it; the dashboard renders `${blobSeed}:${profileAvatarId}`.
 */
export function profileBlobSeed(merchantUserId: string): string {
  return createHash("sha256").update(`pagosya-blob:v1:${merchantUserId}`).digest("base64url").slice(0, 16);
}
