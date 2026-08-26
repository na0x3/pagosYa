import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { GenerateVisualProposalsDto } from "./generate-visual-proposals.dto";

describe("GenerateVisualProposalsDto", () => {
  it("accepts a safe free-form creative brief", async () => {
    const dto = plainToInstance(GenerateVisualProposalsDto, {
      businessCategory: "Cerámica",
      creativeBrief: "Que se sienta como una galería joven.\nFotos grandes, ritmo sereno y sin apariencia genérica.",
      checkoutMode: "payment",
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects oversized or direction-disguising creative briefs", async () => {
    const oversized = plainToInstance(GenerateVisualProposalsDto, { creativeBrief: "a".repeat(1201) });
    const disguised = plainToInstance(GenerateVisualProposalsDto, { creativeBrief: "Galería\u202Ecodificada" });

    expect(await validate(oversized)).not.toHaveLength(0);
    expect(await validate(disguised)).not.toHaveLength(0);
  });
});
