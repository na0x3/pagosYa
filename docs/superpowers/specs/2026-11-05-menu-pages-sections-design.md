# Menu pages with template sections — design (2026-11-05)

Owner, 2026-11-05: «make sure if there is dropdown menu it should have pictures in it, and yapi should be able to do if theres a
section called nosotros in the menu that is not in the main page, when user asks cambia nosotros a algo mas bonito he should change
only that, and etc, but following like the same guidelines of the template». Then «continue working alone i will go to sleep».

## 1. Dropdown pictures (done, 47df19a1)

13 template menu looks hid the dropdown's photo tiles on desktop (bar: broadcast, sorbo, calma, grano, muro, cuero, foco, lomo;
card: focal, shrine, claro, hoja, unico). They now lay the tiles out: a centred row of three under the bar's links, three square
rounded tiles under the card's links. Test: packages/store-templates/test/menu-pictures.test.mjs.

## 2. Menu pages carry template sections

Today «Nosotros», «Contacto», «Preguntas frecuentes» and «Envíos» on a template store are a thin platform page
(`<Shell><InfoPage kind=… /></Shell>`): YAPI can rewrite the about text but cannot make the page look like the template.

- **Data.** store-data gains `pageLayouts: Record<'about'|'contact'|'faq'|'shipping', LayoutBlock[]>` (always exported, `{}` by
  default), read by `readMasterState` and written by every refill, its photos bundled like the home's (`MasterFill.pageLayouts`).
- **Page file.** A menu page with sections is rewritten to draw them with the template's own `LibraryHome` inside the Shell; «Nosotros»
  shows only its sections (they tell the story), the other pages show their sections above the platform's InfoPage (form, questions,
  shipping data stay live). A page without sections keeps today's file, unchanged.
- **Edit.** The template quick edit (`templateLayoutEdit`) reads the menu pages too (`paginas`, plus the template's own section
  types as `plantilla`). An op may name `page: about | contact | faq | shipping`. Words, photo, remove and move ops work on that page's
  sections like on the home; `add` on a menu page may add up to 5 sections, one of them a cover (which always goes first), so
  «cambia nosotros a algo más bonito» builds the page from the library, each section written from the store's data and photos the
  way the home's are. Ops of one page never change another page or the home.
- **Template guidelines.** Sections come only from the section library, drawn by the template's CSS, and the prompt prefers the
  section types the template's home already uses. Same caps, photo rules and «nothing invented» rules as the home.

Out of scope: new pages, pages other than the four, Studio inline editing of menu page sections (the reply and the preview show the
change; the merchant asks YAPI for further changes).
