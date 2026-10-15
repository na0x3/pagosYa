// Spec 2026-10-14 store voice: the store card in Mi tienda says how many facts YAPI assumed are waiting for the merchant.
export function assumedFactsBadge(count) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  if (!n) return '';
  return `<span class="store-card-status" data-status="assumed">${n === 1 ? '1 dato por confirmar' : `${n} datos por confirmar`}</span>`;
}
