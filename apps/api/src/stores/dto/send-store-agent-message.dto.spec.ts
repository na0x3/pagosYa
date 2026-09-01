import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SendStoreAgentMessageDto } from "./send-store-agent-message.dto";

describe("SendStoreAgentMessageDto", () => {
  it("accepts a targeted storefront instruction", async () => {
    const dto = plainToInstance(SendStoreAgentMessageDto, {
      instruction: "Mantén el catálogo, pero haz la apertura más cálida.",
      proposalId: "proposal_1",
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects unsafe or oversized instructions", async () => {
    const disguised = plainToInstance(SendStoreAgentMessageDto, { instruction: "Apertura\u202Eoculta" });
    const oversized = plainToInstance(SendStoreAgentMessageDto, { instruction: "a".repeat(1201) });
    expect(await validate(disguised)).not.toHaveLength(0);
    expect(await validate(oversized)).not.toHaveLength(0);
  });
});
