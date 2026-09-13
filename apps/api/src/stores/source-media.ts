/** MP4 bytes travel as owned assets, never as model image inputs. */
export const MAX_SOURCE_VIDEO_BYTES = 20_000_000;
export const MAX_SOURCE_VIDEO_BASE64 = 4 * Math.ceil(MAX_SOURCE_VIDEO_BYTES / 3);
export const sourceVideo = (path: string) => /\.mp4$/i.test(path);
