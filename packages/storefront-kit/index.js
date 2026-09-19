'use strict';
const { readFileSync } = require('node:fs');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

/** Directory holding the files copied into every generated storefront. */
const kitDir = join(__dirname, 'kit');

/** Absolute path of a kit file, e.g. kitPath('commerce.js') or kitPath('icons', 'cart.svg'). */
const kitPath = (...segments) => join(kitDir, ...segments);

/** Reads a kit file as UTF-8 text. */
const readKitFile = (...segments) => readFile(kitPath(...segments), 'utf8');

/** Synchronous variant for tests and startup code. */
const readKitFileSync = (...segments) => readFileSync(kitPath(...segments), 'utf8');

module.exports = { kitDir, kitPath, readKitFile, readKitFileSync };
