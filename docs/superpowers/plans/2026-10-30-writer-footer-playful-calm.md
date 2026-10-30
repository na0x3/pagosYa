# Home writer: own footer, playful motion, calm brands stay calm (2026-10-30)

Owner feedback on the four example stores (Remolino 2scg4aek, Oh Belly tlg2udmx, Cuadrízate ryqpc5kg, BOXY dvgx25dl):
«they are good, the only one i really dislike is boxy, and that the footer always is the same» and «stores that should be
animated are plain still like oh belly and gummies stores, soda stores, games».
Answers: BOXY = too shouty + not the calm BOXY approved before + photos/colours; footer = **YAPI writes each footer**;
motion = **fun brands always animated, with motion you see without scrolling**.

## Causes found

- Footer: Esencial rolls 5 footer variants, but 3 of 4 stores got `columns`, and `bigname` is `columns` plus the name.
- Motion: every kit motion part the writer may use is scroll-driven (fade-in, ticker, grow). Oh Belly «animated» had a
  plain text-on-colour cover; nothing moves while the page rests. Fun brands are animated only 75% of the time (bold mood).
- BOXY: brand colours navy #1b1d33 on #ebe6e2 were thrown away because the variety brief said «avoid the last stores'
  papers and fonts» → terracotta + teal + Syne. A calm brand drew `manifiesto`: all-caps 10rem headlines at -0.07em.

## Changes

1. **Calm stays calm** (home-directions.ts, stage task, writer checks)
   - `manifiesto` and `bandas` only for bold brands; calm brands draw from editorial / producto / lookbook / historia.
   - The brand's own colours (store-data `look.colors`) are given to the writer as «keep these»; the recent-papers
     avoid list is only sent when the brand has no colours. set_tokens refuses tokens where neither accent nor deep is
     close to a brand colour (when the brand has colours).
   - Headings (h1/h2) written all in capitals are blocked; capitals only for the small labels.
2. **YAPI writes the footer** (new tool `write_footer`, file `components/footer.tsx`)
   - The platform points the Shell at it (`<StoreFooter />` from './footer'); the header stays locked.
   - Blocking checks: a `<footer>`, the info pages nav (`data-pagosya-pages`), the email signup
     (`data-pagosya-subscribe-block` + `data-pagosya-subscribe-inline`), the © line with the store name.
   - A footer idea per store (6 ideas) never one of the last 3 stores', saved in home-direction.json.
   - finish needs the footer written.
3. **Playful motion** (kit ui.tsx + writer)
   - `isPlayfulBusiness(text)`: sweets/gummies/candy, sodas/drinks with fizz, ice cream, toys, games, kids, party.
   - Playful stores are always animated and get the ambient parts: `<Float>` (bobbing), `<Sticker>` (spinning badge),
     `<Wiggle>` (wobble on hover), `<BounceText>` (letters bounce in). All honour reduced motion / motion off.
   - Check: a playful home must use at least 2 ambient parts and 1 scroll part.

## Verification
- Unit specs for directions, tools, checks; kit build; Studio rebuild (it embeds the kit).
- Live: rebuild BOXY + Oh Belly + one gummies store with the writer and look at them.
