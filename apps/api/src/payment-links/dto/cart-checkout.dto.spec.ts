import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CartItemDto } from "./cart-checkout.dto";

const errors = (extraIds: string[]) => validateSync(plainToInstance(CartItemDto, { paymentLinkId: "box_12", extraIds, quantity: 1 }));

it("accepts a box of 12 whose flavours repeat, and still bounds the list", () => {
  expect(errors([...Array(6).fill("matcha"), ...Array(6).fill("pistacho")])).toEqual([]);
  expect(errors(Array(49).fill("matcha"))).not.toEqual([]);
});
