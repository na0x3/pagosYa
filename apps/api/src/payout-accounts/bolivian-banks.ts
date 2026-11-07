/** Banks a payout account can be in. Ops confirm this list before launch; add a bank here when a merchant needs it. */
export const BOLIVIAN_BANKS: ReadonlyArray<{ code: string; name: string }> = [
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

export function bankName(code: string): string | null {
  return BOLIVIAN_BANKS.find((bank) => bank.code === code)?.name ?? null;
}
