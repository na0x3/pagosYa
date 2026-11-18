module.exports = [
  { id: 'photo-same', say: 'cambia la foto de la portada por la foto del plan semanal', check: (s, before) => s.revision === before.revision || s.layout[0]?.photo !== before.layout[0]?.photo },
  { id: 'photo-swap', say: 'cambia la foto de la portada por la foto de las croquetas', check: (s, before) => s.layout[0]?.photo !== before.layout[0]?.photo },
];
