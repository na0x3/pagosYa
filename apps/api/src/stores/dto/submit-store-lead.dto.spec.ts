import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SubmitStoreLeadDto } from "./submit-store-lead.dto";

describe("SubmitStoreLeadDto", () => {
  it("accepts an empty cart for a general storefront contact message", async () => {
    const dto = plainToInstance(SubmitStoreLeadDto, {
      name: "Ana",
      email: "ana@gmail.com",
      message: "¿Abren los sábados?",
      items: [],
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("still validates nested product enquiries", async () => {
    const dto = plainToInstance(SubmitStoreLeadDto, {
      email: "ana@gmail.com",
      items: [{ paymentLinkId: "product_1", quantity: 0 }],
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "items" && error.children?.length)).toBe(true);
  });
});
