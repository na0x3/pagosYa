import { validate } from "class-validator";
import { IsSafeText } from "./safe-text.decorator";

class MerchantCopy {
  @IsSafeText()
  value!: string;
}

async function errorsFor(value: string) {
  const copy = new MerchantCopy();
  copy.value = value;
  return validate(copy);
}

describe("IsSafeText", () => {
  it("accepts ordinary Spanish copy, punctuation, emoji, and line breaks", async () => {
    await expect(errorsFor("¡Hecho en Bolivia! 🇧🇴\nVisítanos hoy.")).resolves.toHaveLength(0);
  });

  it.each(["precio\u0000oculto", "usuario\u202Etexto", "enlace\u2066falso"]) (
    "rejects invisible control or text-direction characters in %p",
    async (value) => {
      expect(await errorsFor(value)).not.toHaveLength(0);
    },
  );
});
