/** A legitimate DNA motif drawing: line art in currentColor, a labelled light part and a local gradient. */
export const LAMP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>Lámpara</title>'
  + '<defs><radialGradient id="glow"><stop offset="0" stop-color="currentColor" stop-opacity=".45"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>'
  + '<circle data-part="light" cx="32" cy="34" r="16" fill="url(#glow)" stroke="none"/><path d="M20 26h24L38 8H26z"/><path d="M32 26v24"/><path d="M22 54h20"/>'
  + '<g data-part="light"><path d="M24 34l-4 6"/><path d="M32 34v8"/><path d="M40 34l4 6"/></g></svg>';
