// Browse catalogue live check (spec 2026-11-06): the merchant asks for the Nike shop page.
const fs = require('node:fs');
module.exports = [
  { id: 'browse-nike', say: 'pon el catálogo como Nike', check: () => true, expectReply: /Nike|filtros/i },
];
