// America/La_Paz is UTC-4 all year; formatting by hand keeps output identical in every browser and in node --test.
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;

const percent = (bps) => String(bps / 100).replace(".", ",");
const when = (days) => (days === 0 ? "el mismo día" : days === 1 ? "al día siguiente" : `a los ${days} días`);
const dayCount = (days) => (days === 1 ? "1 día" : `${days} días`);

export function settlementPolicySentence(policy) {
  const reserve = policy.reserveBps > 0 ? `; guardamos el ${percent(policy.reserveBps)}% por ${dayCount(policy.reserveDays)} como reserva de protección` : "";
  return `Nivel ${policy.level}: tus ventas están disponibles ${when(policy.delayDays)}${reserve}.`;
}

export function nextLevelSentence(nextLevel) {
  if (!nextLevel) return "";
  const reserve = nextLevel.reserveBps > 0 ? `con ${percent(nextLevel.reserveBps)}% de reserva` : "sin reserva";
  return `En el nivel ${nextLevel.level} (${nextLevel.name}) recibes tu dinero ${when(nextLevel.delayDays)} y ${reserve}.`;
}

function laPaz(date) {
  const iso = new Date(date.getTime() - LA_PAZ_OFFSET_MS).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function releaseDateLabel(day) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

export function nextPayoutLabel(iso, now = new Date()) {
  if (!iso) return "";
  const at = laPaz(new Date(iso));
  return at.day === laPaz(now).day ? `Próximo pago: hoy ${at.time}` : `Próximo pago: ${releaseDateLabel(at.day)} ${at.time}`;
}
