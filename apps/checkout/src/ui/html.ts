/** Formatting and escaping for HTML built as strings. */

export function formatAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
}

// Payment Link name/description/merchant name are merchant-supplied and rendered via
// innerHTML — escape them so a malicious link can't script-inject into a customer's page.
export function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

// A stray "." or "-" left in the announcement field is still a truthy string,
// but rendering it produces a promo pill with no visible content — require at
// least one letter or digit before showing the banner at all.
export function hasReadableContent(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}
