# Plantillas presets on Esencial (2026-10-22)

Owner (2026-10-22, overnight, «no me hagas más preguntas»): remove the current Plantillas and, «con las nuevas referencias»,
create templates for designer brands, food, everyday clothing, technology companies, construction, kids' accessories,
electronics «y etc».

## Decisions (made without the owner, to be reviewed)
- «Eliminar» = hide every current template (`hidden: true`), not delete: stores built from them keep their source; reversible.
- «Nuevas referencias» = the Esencial master and this month's reference work (John Smedley sections, Amboras/Esencial
  looks, fashion cards, menus, filters, journal/manifesto). New templates are **presets of Esencial**, not new source code.
- A preset is a folder with `template.json` `{ extends: "esencial", preset: { palette, fonts, colors?, variants, sections?,
  copy, featureCopy? }, photos: [...own demo photos for hero/story/p1..p4] }`, no components.
- Applying a preset saves an Esencial store (`brief.templateId = "esencial"`), so every Esencial path (refill, chat content
  edits, menus, sections) keeps working; the preset only fixes the look and the starting words.
- Gallery: presets are `curated`; with Plantillas fill on, «Usar» fills the words with YAPI (as applyMaster does) but keeps
  the preset's look; «Ver» shows the preset's demo shop.

## Presets
moda-autor (designer brands), moda-casual (everyday clothing), comida-cafe, comida-sabores (restaurant/delivery),
tecnologia (tech company), electronica (electronics shop), construccion, ninos (kids' accessories), belleza, hogar,
deporte, mascotas. Demo photos are copied from the hidden templates of the same category.
