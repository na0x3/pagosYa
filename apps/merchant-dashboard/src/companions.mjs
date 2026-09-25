// Companion animals: the adventure levels, the four starters that double as
// profile avatars and dice-board runners, and the avatar markup. Kept in one
// place so a renamed or redrawn animal changes everywhere at once.

// Bump when the profile art is replaced. It evicts copies browsers cached under
// the server's old one-day max-age; the server now revalidates images by ETag.
export const PROFILE_ART_VERSION = 3;
export const STARTER_COUNT = 4;

const profileAsset = (id) => `/assets/profile-${id}.png?v=${PROFILE_ART_VERSION}`;

// Progression tuning lives here. Change xpRequired values without touching map rendering or animation code.
export const ADVENTURE_LEVELS = [
  { id: 1, name: "Perdiz", englishName: "Partridge", xpRequired: 0, character: "Pipa", rarity: "Exploradora", asset: profileAsset(1), alt: "Una perdiz ilustrada", description: "Curiosa, veloz y siempre lista para dar el primer paso.", runnerCopy: "Paso atento" },
  { id: 2, name: "Capibara", englishName: "Capybara", xpRequired: 100, character: "Capi", rarity: "Compañero", asset: profileAsset(2), alt: "Un capibara ilustrado", description: "Convierte el crecimiento constante en un paseo tranquilo.", runnerCopy: "Ritmo sereno" },
  { id: 3, name: "Oso hormiguero", englishName: "Anteater", xpRequired: 250, character: "Turi", rarity: "Rastreador", asset: profileAsset(3), alt: "Un oso hormiguero ilustrado", description: "Encuentra oportunidades donde otros solo ven camino.", runnerCopy: "Ruta curiosa" },
  { id: 4, name: "Vizcacha", englishName: "Viscacha", xpRequired: 450, character: "Suri", rarity: "Vigía", asset: profileAsset(4), alt: "Una vizcacha ilustrada", description: "Mira lejos y te recuerda cuál es la próxima meta.", runnerCopy: "Mirada alerta" },
  { id: 5, name: "Loro vaquero", englishName: "Cowboy Parrot", xpRequired: 700, character: "Pico", rarity: "Raro", asset: "/assets/gamification-1.png", alt: "Un loro colorido con sombrero vaquero", description: "Cruza la selva con estilo y celebra cada avance." },
  { id: 6, name: "Guacamaya azul", englishName: "Blue Macaw", xpRequired: 1000, character: "Ala", rarity: "Épico", asset: "/assets/gamification-2.png", alt: "Una guacamaya azul volando", description: "Toma altura para mostrarte todo lo que ya construiste." },
  { id: 7, name: "Lechuza", englishName: "Owl", xpRequired: 1400, character: "Luma", rarity: "Épico", asset: "/assets/gamification-3.png", alt: "Una lechuza aventurera", description: "La constancia ilumina incluso los caminos más oscuros." },
  { id: 8, name: "Perezoso", englishName: "Sloth", xpRequired: 1900, character: "Moro", rarity: "Legendario", asset: "/assets/gamification-4.png", alt: "Un perezoso en la etapa final", description: "Crecer con paciencia también merece una gran celebración." },
];

// The starters are the only animals a merchant can pick as avatar or runner.
export const GAMIFICATION_RUNNERS = ADVENTURE_LEVELS.slice(0, STARTER_COUNT)
  .map(({ name, asset, runnerCopy }) => ({ name, asset, description: runnerCopy }));

/** Any stored or submitted avatar id collapses to a valid starter, defaulting to the first. */
export function normalizeAvatarId(avatarId) {
  const id = Number(avatarId);
  return Number.isInteger(id) && id >= 1 && id <= STARTER_COUNT ? id : 1;
}

/** Decorative avatar image; the per-id class carries the face crop from dashboard.css. */
export function profileAvatarHtml(avatarId) {
  const id = normalizeAvatarId(avatarId);
  return `<img class="profile-avatar-image profile-avatar-image-${id}" src="${profileAsset(id)}" alt="">`;
}
