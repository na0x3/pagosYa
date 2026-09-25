import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateMerchantSessionDto } from "./update-merchant-session.dto";

const errorsFor = (profileAvatarId: unknown) => validate(plainToInstance(UpdateMerchantSessionDto, { profileName: "Ana", profileAvatarId }));

describe("UpdateMerchantSessionDto", () => {
  it("accepts blob variations 1–999, including the old animal ids 1–4", async () => {
    for (const id of [1, 4, 5, 500, 999]) await expect(errorsFor(id)).resolves.toHaveLength(0);
  });

  it("rejects anything else", async () => {
    for (const id of [0, 1000, 2.5, "7", null]) {
      expect((await errorsFor(id)).map((error) => error.property)).toContain("profileAvatarId");
    }
  });
});
