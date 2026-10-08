// Same list as apps/api/src/payout-accounts/bolivian-banks.ts — the API refuses any other code.
export const BANKS = [
  { code: "BNB", name: "Banco Nacional de Bolivia" },
  { code: "BMSC", name: "Banco Mercantil Santa Cruz" },
  { code: "BCP", name: "Banco de Crédito de Bolivia" },
  { code: "BISA", name: "Banco BISA" },
  { code: "BUN", name: "Banco Unión" },
  { code: "BEC", name: "Banco Económico" },
  { code: "BGA", name: "Banco Ganadero" },
  { code: "BSOL", name: "BancoSol" },
  { code: "FIE", name: "Banco FIE" },
  { code: "FORT", name: "Banco Fortaleza" },
  { code: "PRODEM", name: "Banco Prodem" },
  { code: "ECOF", name: "Banco PYME Ecofuturo" },
  { code: "PCOM", name: "Banco PYME de la Comunidad" },
];

// America/La_Paz is UTC-4 all year; formatting by hand keeps output identical in every browser and in node --test.
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;
const laPaz = (date) => {
  const iso = new Date(date.getTime() - LA_PAZ_OFFSET_MS).toISOString();
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y} ${iso.slice(11, 16)}`;
};

/** The account payouts use (approved), the one ops are reviewing, and a rejection the merchant should still see. */
export function currentAccounts(list) {
  const newest = (status) => list.filter((a) => a.status === status).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  const approved = newest("APPROVED");
  const waiting = newest("PENDING_REVIEW");
  const rejected = newest("REJECTED");
  const lastRejected = rejected && (!approved || Date.parse(rejected.createdAt) > Date.parse(approved.createdAt)) ? rejected : null;
  return { approved, waiting, lastRejected };
}

export function accountStatusLabel(account, now = new Date()) {
  if (account.status === "PENDING_REVIEW") return "En revisión";
  if (account.status === "REJECTED") return `No aprobada: ${account.reviewNote ?? ""}`;
  if (account.status === "APPROVED" && account.payableFrom && Date.parse(account.payableFrom) > now.getTime()) return `Aprobada · desde el ${laPaz(new Date(account.payableFrom))}`;
  if (account.status === "APPROVED") return "Aprobada · recibe desembolsos";
  return "Reemplazada";
}
