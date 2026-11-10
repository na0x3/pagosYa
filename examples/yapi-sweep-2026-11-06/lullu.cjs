module.exports = [{ id: 'lullu-shipping', say: 'haz envios y entregas mas bonito', check: s => (s.pageLayouts.shipping ?? []).length >= 3 }];
