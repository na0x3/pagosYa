# Listing videos and photo/video carousels (sub-project A2) — design

Date: 2026-10-18 · Owner choice: «do the 1» (free parts now; AI photos later, once an image account has balance)

## Goal

A store built from a product link looks fuller from the first message: the listing's own product video comes with its photos, and
the product's photos and video are shown in one carousel instead of a wall or a single image.

## What exists

- `[data-pagosya-carousel]` (kit `content/carousel.js`, trust draw 2026-10-18): one slide at a time, swipe, arrows, dots, slow
  auto-turn. It knows nothing about video: a video slide keeps playing off-screen.
- Builds accept MP4 uploads up to 20 MB as real embedded videos (`MAX_SOURCE_VIDEO_BYTES`).
- Spike pages: AliExpress publishes a JSON-LD `VideoObject` (MP4), Amazon a `"videoUrl"` with a 480p MP4, Alibaba an MP4 on
  `cloud.video.taobao.com`.

## Decisions

1. **Extraction** adds `videos` (MP4 only, at most 2) to the listing: JSON-LD `VideoObject` (`contentUrl`, standalone or as the
   product's `video`), `og:video` / `og:video:secure_url`, Amazon's `"videoUrl"` MP4 (the 480p file, never the HLS playlist),
   Alibaba/Taobao `cloud.video.taobao.com` MP4. Streaming playlists (m3u8) are never used.
2. **Import** goes through the safe fetcher with a new `video` resource kind (`video/mp4`, 20 MB), checked by its bytes, saved to
   the merchant's uploads. A failed video never fails the store; the photos still build it.
3. **The build** gets the videos as product media and a carousel line: with 3+ photos or a video, show the product's photos and
   video in one `[data-pagosya-carousel]` (one `<figure>` per slide; a video slide is `<video muted loop playsinline
   preload="metadata">`, poster = a product photo), never a grid of photos.
4. **The carousel runtime** handles video slides: every slide video is muted and inline; only the current slide's video plays,
   and only while the carousel is on screen; the others pause. Under reduced motion no video autoplays and its controls show.
   The auto-turn waits while a video slide is current.
5. **Reply**: «Traje «X» de Alibaba con 6 fotos y 1 video.»

## Later

AI photos (`product-scenes`, gpt-image-2) switch on when an image account has balance: 2–4 scenes per product-link store, capped.
