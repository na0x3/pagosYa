import { ComplaintOutcome } from "@prisma/client";

export type ComplaintEmailKind = "RECEIVED" | "EXTENDED" | "ANSWERED" | "MERCHANT_ASKED";

export type BuyerEmailFacts = {
  number: string;
  buyerName: string;
  dueAt: Date;
  trackingUrl: string;
  extensionReason?: string | null;
  outcome?: ComplaintOutcome | null;
  answer?: string | null;
};

const OUTCOME_LABEL: Record<ComplaintOutcome, string> = {
  UPHELD: "a tu favor",
  PARTIALLY_UPHELD: "parcialmente a tu favor",
  NOT_UPHELD: "no a tu favor",
};

export function laPazDateLabel(at: Date): string {
  return new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(at);
}

/** ⚖ Lawyer to confirm the wording. */
export const SECOND_INSTANCE_NOTICE = (number: string) =>
  `Si no estás de acuerdo con esta respuesta, puedes presentar tu reclamo en segunda instancia ante la Autoridad de Supervisión del Sistema Financiero (ASFI), indicando el número de reclamo ${number}. Más información en www.asfi.gob.bo.`;

export function buyerEmail(kind: "RECEIVED" | "EXTENDED" | "ANSWERED", c: BuyerEmailFacts): { subject: string; body: string } {
  const hello = `Hola ${c.buyerName},`;
  const track = `Puedes ver tu reclamo y agregar información aquí:\n${c.trackingUrl}`;
  if (kind === "RECEIVED") {
    return {
      subject: `Recibimos tu reclamo ${c.number}`,
      body: `${hello}\n\nRegistramos tu reclamo con el número ${c.number}. Te responderemos por escrito a más tardar el ${laPazDateLabel(c.dueAt)}.\n\n${track}\n\npagosYa`,
    };
  }
  if (kind === "EXTENDED") {
    return {
      subject: `Tu reclamo ${c.number}: nueva fecha de respuesta`,
      body: `${hello}\n\nNecesitamos más tiempo para responder tu reclamo ${c.number}. Motivo: ${c.extensionReason ?? ""}\n\nTe responderemos a más tardar el ${laPazDateLabel(c.dueAt)}.\n\n${track}\n\npagosYa`,
    };
  }
  return {
    subject: `Respuesta a tu reclamo ${c.number}`,
    body: `${hello}\n\nEsta es nuestra respuesta a tu reclamo ${c.number}.\n\nResultado: ${c.outcome ? OUTCOME_LABEL[c.outcome] : ""}\n\n${c.answer ?? ""}\n\n${track}\n\n${SECOND_INSTANCE_NOTICE(c.number)}`,
  };
}

export function merchantAskedEmail(f: { number: string; question: string; merchantDueAt: Date; dashboardUrl: string }): { subject: string; body: string } {
  return {
    subject: `Reclamo ${f.number}: necesitamos tu respuesta`,
    body: `Un comprador presentó el reclamo ${f.number} sobre un pago a tu comercio. pagosYa lo está revisando y necesita tu versión.\n\nNuestra consulta: ${f.question}\n\nResponde desde tu panel a más tardar el ${laPazDateLabel(f.merchantDueAt)}:\n${f.dashboardUrl}\n\nNo respondas al comprador directamente; pagosYa le enviará la respuesta final.`,
  };
}

export function opsDigestEmail(items: Array<{ number: string; dueAt: Date; overdue: boolean; merchantName: string | null }>): { subject: string; body: string } {
  const sorted = [...items].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const overdue = items.filter((item) => item.overdue).length;
  const lines = sorted.map((item) => `${item.overdue ? "VENCIDO  " : "Vence    "}${item.number}  ${laPazDateLabel(item.dueAt)}  ${item.merchantName ?? "sin comercio"}`);
  return {
    subject: `Reclamos: ${overdue} vencidos, ${items.length - overdue} vencen pronto`,
    body: `Reclamos sin responder que vencen hasta mañana hábil:\n\n${lines.join("\n")}\n`,
  };
}
