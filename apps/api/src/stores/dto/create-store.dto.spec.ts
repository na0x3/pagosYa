import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateStoreDto } from "./create-store.dto";

describe("CreateStoreDto storefront layout", () => {
  it("accepts every known content section once in a merchant-defined order", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["gallery", "products", "hero", "about", "links"],
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", caption: "Nuestro taller" }],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects duplicated/missing sections and invisible caption controls", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["gallery", "products", "products", "about", "links"],
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", caption: "texto\u202Eoculto" }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
