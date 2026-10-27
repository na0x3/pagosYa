import type { MasterFill, MasterVariants } from './source-master';

/** The first video among the merchant's attachments (owner 2026-10-25, Gramiyaa: «el video del aceite cayendo en la portada»). */
export const firstVideo = (urls: readonly string[]) => urls.find(url => /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(url));

/** A store with a video gets it as the cover: the full-width hero (never a collage of photos), the photo as its poster. */
export function withHeroVideo(fill: MasterFill, video: string | undefined): MasterFill {
  return video ? { ...fill, heroVideo: video, variants: { ...(fill.variants ?? {}), hero: 'full' } as unknown as Partial<MasterVariants> } : fill;
}
