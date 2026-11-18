import { describe, expect, it } from "vitest";
import { clientFileProblem, complaintDateLabel, validateComplaintDraft } from "./complaints-form";

const ok = { buyerName: "Ana", buyerEmail: "ana@example.com", buyerPhone: "", reference: "pi_abc123", storeName: "", category: "NOT_DELIVERED", request: "REFUND", description: "Pagué y el pedido nunca llegó a mi casa." };

describe("complaint form", () => {
  it("accepts a complete draft", () => {
    expect(validateComplaintDraft(ok)).toEqual({});
  });
  it("asks for a reference or a store name", () => {
    expect(validateComplaintDraft({ ...ok, reference: " ", storeName: "" })).toEqual({ reference: "Escribe la referencia de tu pago o el nombre de la tienda." });
  });
  it("checks email, description length and required choices", () => {
    const errors = validateComplaintDraft({ ...ok, buyerEmail: "ana@", description: "corto", category: "", request: "" });
    expect(Object.keys(errors).sort()).toEqual(["buyerEmail", "category", "description", "request"]);
  });
  it("refuses more than 3 files, files over 5 MB and other types before upload", () => {
    const jpg = { name: "a.jpg", size: 10, type: "image/jpeg" };
    expect(clientFileProblem([jpg, jpg, jpg, jpg])).toBe("Puedes adjuntar hasta 3 archivos.");
    expect(clientFileProblem([{ ...jpg, size: 5_000_001 }])).toBe("Cada archivo puede pesar hasta 5 MB.");
    expect(clientFileProblem([{ name: "a.gif", size: 10, type: "image/gif" }])).toBe("Solo se aceptan fotos JPG o PNG y archivos PDF.");
    expect(clientFileProblem([jpg, { name: "b.pdf", size: 10, type: "application/pdf" }])).toBeNull();
  });
  it("shows dates in La Paz", () => {
    expect(complaintDateLabel("2026-10-16T03:59:59.999Z")).toContain("15 de octubre de 2026");
  });
});
