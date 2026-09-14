# Choosing between Savia PDP candidates A and B

## Choice: **Candidate A**

B's desktop is a bit tighter, but A is the better premium PDP overall. Its product image has more presence, its layout is closer to the Grain & Glass reference (big image, thumbnails underneath, a calm column on the right), and its mobile flow works much better. B's vertical thumbnail strip is fine at 1440 but wrecks the image at 390.

## Evidence

**Desktop, first screen (0–900px)**
- **A:** The image is about 632×632 with four thumbnails below it. The bottle is large, the soft window-shadow photo has room, and the right column clearly goes: SAVIA label → title → price → description → Color → Capacidad → quantity → "Añadir al pedido" (at about y 753) → "Retiro en tienda" (about y 846). The key buying info is all visible without scrolling. Stacking Color and Capacidad keeps the scan to one straight line down.
- **B:** The image is about 494×617, portrait, with a thumbnail strip on the left. The portrait crop suits the bottle, and the buy button sits higher (about y 674). But Color and Capacidad share one row with only about 40px between the groups, so they read as one run of chips. The image column also ends about 60px before the buy column, which makes the page look top-heavy on the right.

**Desktop, lower content:** Identical in both. The "Una pausa que se vuelve costumbre" section with the orange-juice photo is calm and on-brand. There are no colorful boxes, which is what the user wants.

**Mobile (390)**
- **A:** The image uses the full content width (about 298px) with thumbnails in a row below. That's the normal mobile pattern: image first, then title, price and options. The option chips are large and clearly selected (Coral, 750 ml).
- **B:** The strip takes about 50px, shrinking the image to about 244×244. The image becomes a small tile, which undercuts a brand that sells on its photos. B reaches the options sooner, but that doesn't make up for the weaker image.

**Shared strengths:** Both are restrained and read as an original brand, not a copy of the reference. Deep green, warm off-white, a clean grotesk for headings, hairline chips, and one strong dark-green button. Selected states are clear and the same everywhere.

## Top 3 fixes (for A)

1. **The "Saltar al contenido" skip link shows on top of the page in all four screenshots.**
   - In A desktop it sits over the breadcrumb and cuts off "Todos los productos".
   - In A mobile it covers the image's left arrow.
   - In B it covers the SAVIA logo.

   It should be visually hidden and only appear on keyboard focus. If the screenshot tool focused it, take the screenshots again without focus. As it stands, this is the most visible flaw on both pages.

2. **Line up the left edges and mobile margins.**
   - On desktop, the logo starts at about x 72, the breadcrumb and product area at about 124, and the divider and lower section at about 100. Three different edges look unfinished; use one container edge for everything.
   - On mobile, the product area has about 43px side margins, but the header, lower section and footer use about 20px. Use 20px for the product area too, or make the gallery full-bleed.
   - Consider a slightly taller mobile image (4:5) so the bottle fills the first screen.
   - The mobile carousel arrows and "3/4" counter crowd the bottom of the image. Smaller controls or dots would help.

3. **Simplify the buy area below the button.**
   - "Retiro en tienda" is the only grey filled block on the page. It's heavier than the option chips and pulls attention from the button, exactly the "arbitrary box" the user rejects. Make it a hairline row like the chips, with a short label (e.g. "Entrega") and a proper chevron instead of the "↓" character.
   - "Subtotal Bs 109,00" is pushed to the far right, away from the quantity picker. Move it next to the quantity or into the button ("Añadir al pedido · Bs 109,00").
   - The Detalles/Envíos tabs hold only two short bullets. Tabs around so little content look empty; show the details directly or add real catalog content.

## Caveats

- These are static JPEG screenshots only. I can't judge hover, focus, swiping, sticky buy bars or loading. I made no claims about behavior.
- The skip link may be caused by the screenshot tool rather than the CSS. Either way, check it.
- The Grain & Glass reference shows star ratings, review counts and health claims. Don't copy those onto Savia; only the layout and polish are worth borrowing.
- Small detail: "Mi pedido ( 0 )" has spaces inside the parentheses in both versions, which reads like a formatting bug.
- If you want to keep something from B: its portrait image crop suits the bottle on desktop and could be tried inside A's layout. Keep A's thumbnails below the image on mobile.