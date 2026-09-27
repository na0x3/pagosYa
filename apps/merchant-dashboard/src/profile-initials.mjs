/** A profile's picture: the first letter of each of its first two words, upper-cased. */
export function profileInitials(name) {
  const letters = String(name ?? "").split(/\s+/).map((word) => word.match(/\p{L}/u)?.[0]).filter(Boolean).slice(0, 2);
  return letters.length ? letters.join("").toLocaleUpperCase("es") : "?";
}
