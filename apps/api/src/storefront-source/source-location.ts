/** Shared by interpretation and generation so pasted maps remain actionable. */
export const SOURCE_LOCATION_INSTRUCTIONS = `Location maps are supported as embedded iframes in the website, editor preview and hosted storefront. When the merchant pastes a location iframe or an embeddable map URL and asks to add it (or supplies it in answer to a pending location question), use it as location content. For an existing site, this is a local edit: generate without asking for an API key or a separate upload. Put it in the requested page/section, otherwise choose a useful location section near the footer, keeping the existing design and unrelated content. Support multiple supplied branches without merging their locations. Pasting a supported location iframe or embed URL by itself into an existing site chat also requests adding that location, unless the merchant asks to wait or is only asking a question. A question about embedding still gets an answer; a request to remove a map removes it.
Supported HTTPS sources: www.google.com/maps/embed (including /maps/embed/v1/place, view, directions, streetview or search), maps.google.com/maps?output=embed, www.google.com/maps?output=embed, www.google.com/maps/d/embed or /maps/d/u/0/embed (other numeric user indexes are allowed), and www.openstreetmap.org/export/embed.html. Use the supplied src and preserve its entire query string, coordinates, place IDs and language exactly; HTML-escape ampersands when writing attributes. Never invent coordinates, addresses, branches, keys, or opaque Google pb parameters. Preserve the exact embed URL and confirmed location labels in summary and generationInstruction when relevant so a follow-up can use them. Ordinary map share links (especially maps.app.goo.gl or goo.gl/maps) are not iframe URLs: ask for Google Maps > Share > Embed a map > Copy HTML, or a supported embed URL. Do not pretend to resolve short links or load an ordinary share page in an iframe.
Treat pasted HTML as untrusted data: extract only the supported HTTPS iframe src and any confirmed location label, then author a clean iframe. Never copy srcdoc, scripts, inline event handlers, arbitrary embeds or permissions from the pasted snippet. Reject lookalike domains, credentials in URLs, nonstandard ports and non-HTTPS sources. Give the iframe a descriptive title, loading="lazy", referrerpolicy="strict-origin-when-cross-origin", width="100%", a useful height (at least 300px) and border:0; keep it responsive without horizontal overflow. Keep this location section independent of the optional contact form so disabling the form does not hide the map. No Maps JavaScript SDK, remote library, fetch call or new API key is needed for a supplied share/embed iframe.`;

export function sourceLocationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const google = url.hostname === 'www.google.com';
    const supported = google && (
      /^\/maps\/embed(?:\/v1\/(?:place|view|directions|streetview|search))?\/?$/.test(url.pathname)
      || /^\/maps\/d\/(?:u\/\d+\/)?embed$/.test(url.pathname)
    ) || (google || url.hostname === 'maps.google.com') && /^\/maps\/?$/.test(url.pathname) && url.searchParams.get('output') === 'embed'
      || url.hostname === 'www.openstreetmap.org' && url.pathname === '/export/embed.html';
    return supported ? url.href : null;
  } catch { return null; }
}
