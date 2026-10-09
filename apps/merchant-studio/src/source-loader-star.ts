import './source-loader-star.css';

const STAR_SVG = '<svg viewBox="0 0 100 100"><path d="M50 9 62 36 91 39 69 58 76 87 50 72 24 87 31 58 9 39 38 36Z" fill="#f8cf2a" stroke="#f8cf2a" stroke-width="14" stroke-linejoin="round"/><rect x="38.5" y="43" width="8" height="15" rx="4" fill="#1c1a17"/><rect x="53.5" y="43" width="8" height="15" rx="4" fill="#1c1a17"/></svg>';

/** The same star at step size, marking the step YAPI is on while it generates. */
export const STEP_STAR = `<span class="build-star" aria-hidden="true">${STAR_SVG}</span>`;

/** The pagosYa star, bouncing while a preview is prepared. */
export const LOADER_STAR = '<span class="tpl-loader-star" aria-hidden="true"><svg viewBox="0 0 100 100"><path d="M50 9 62 36 91 39 69 58 76 87 50 72 24 87 31 58 9 39 38 36Z" fill="#f8cf2a" stroke="#f8cf2a" stroke-width="14" stroke-linejoin="round"/><rect x="38.5" y="43" width="8" height="15" rx="4" fill="#1c1a17"/><rect x="53.5" y="43" width="8" height="15" rx="4" fill="#1c1a17"/></svg></span><span class="tpl-loader-shadow" aria-hidden="true"></span>';
