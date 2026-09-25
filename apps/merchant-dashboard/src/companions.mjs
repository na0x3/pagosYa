// Companion characters: the adventure levels and the blob each level unlocks. Kept in one place so a renamed
// or restyled companion changes everywhere at once. Blob characters (B1) replaced the animal PNGs; those files
// stay in the repo until the rollout is verified, then are removed.
import { blobDataUri, blobSvg } from "@pagosya/blob-characters";

// Progression tuning lives here. Change xpRequired values without touching rendering or animation code.
// `look` pins the companion's Blobatar (silhouette, hue in degrees, tone 0–1 pale to ink); `expression` is its
// signature mood. The server's PROGRESS_XP_THRESHOLDS (merchant-session.service.ts) must match xpRequired.
export const ADVENTURE_LEVELS = [
  { id: 1, name: "Perdiz", englishName: "Partridge", xpRequired: 0, character: "Pipa", rarity: "Exploradora", look: { shape: "round", hue: 30, tone: 0.4 }, expression: "happy", description: "Curiosa, veloz y siempre lista para dar el primer paso." },
  { id: 2, name: "Capibara", englishName: "Capybara", xpRequired: 100, character: "Capi", rarity: "Compañero", look: { shape: "boxy", hue: 25, tone: 0.75 }, expression: "sleepy", description: "Convierte el crecimiento constante en un paseo tranquilo." },
  { id: 3, name: "Oso hormiguero", englishName: "Anteater", xpRequired: 250, character: "Turi", rarity: "Rastreador", look: { shape: "droplet", hue: 350, tone: 0.4 }, expression: "thinking", description: "Encuentra oportunidades donde otros solo ven camino." },
  { id: 4, name: "Vizcacha", englishName: "Viscacha", xpRequired: 450, character: "Suri", rarity: "Vigía", look: { shape: "capsule", hue: 45, tone: 0 }, expression: "surprised", description: "Mira lejos y te recuerda cuál es la próxima meta." },
  { id: 5, name: "Loro vaquero", englishName: "Cowboy Parrot", xpRequired: 700, character: "Pico", rarity: "Raro", look: { shape: "sun", hue: 140, tone: 0.4 }, expression: "smug", description: "Cruza la selva con estilo y celebra cada avance." },
  { id: 6, name: "Guacamaya azul", englishName: "Blue Macaw", xpRequired: 1000, character: "Ala", rarity: "Épico", look: { shape: "cloud", hue: 215, tone: 0.4 }, expression: "love", description: "Toma altura para mostrarte todo lo que ya construiste." },
  { id: 7, name: "Lechuza", englishName: "Owl", xpRequired: 1400, character: "Luma", rarity: "Épico", look: { shape: "hexagon", hue: 275, tone: 0.4 }, expression: "wink", description: "La constancia ilumina incluso los caminos más oscuros." },
  { id: 8, name: "Perezoso", englishName: "Sloth", xpRequired: 1900, character: "Moro", rarity: "Legendario", look: { shape: "triangle", hue: 50, tone: 0.999 }, expression: "shy", description: "Crecer con paciencia también merece una gran celebración." },
];

/** A companion's seed: fixed per level, so every merchant meets the same Pipa. */
export const companionSeed = (level) => `pagosya-companion:${level.id}`;

/** A companion's blob as inline SVG. Decorative: the copy around it always names the companion. */
export function companionBlobHtml(level, { expression = level.expression, animate = false, className = "" } = {}) {
  return blobSvg(companionSeed(level), { look: level.look, expression, animate, className });
}

/** The same companion as a static `data:` URI (for CSS backgrounds). */
export function companionBlobUri(level) {
  return blobDataUri(companionSeed(level), { look: level.look, expression: level.expression });
}
