import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateStoreDto } from "./create-store.dto";

describe("CreateStoreDto storefront layout", () => {
  it("accepts every known content section once in a merchant-defined order", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["gallery", "products", "hero", "about", "links"],
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", caption: "Nuestro taller", boxColor: "#f4ead7" }],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects unsafe editorial card colors", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      editorialGallery: [{
        imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp",
        caption: "Nuestro taller",
        boxColor: "red; background-image: url(https://invalid.test)",
      }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("rejects duplicated/missing sections and invisible caption controls", async () => {
    const dto = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      contentOrder: ["gallery", "products", "products", "about", "links"],
      editorialGallery: [{ imageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp", caption: "texto\u202Eoculto" }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it("accepts safe announcement appearance values and rejects CSS injection", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      announcementSize: "large",
      announcementColor: "#f5d90a",
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      announcementSize: "enormous",
      announcementColor: "red; background:url(https://invalid.test)",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts only uploaded-file paths for promotion imagery", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      promotionImageUrl: "/v1/uploads/123e4567-e89b-12d3-a456-426614174000.webp",
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      promotionImageUrl: "https://tracking.invalid/promo.webp",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts a safe external lead destination and rejects non-http protocols", async () => {
    const valid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      checkoutMode: "external",
      leadCaptureUrl: "https://taller.example/contacto",
    });
    const invalid = plainToInstance(CreateStoreDto, {
      name: "Taller Norte",
      checkoutMode: "external",
      leadCaptureUrl: "javascript:alert(1)",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts only booleans for the cart recommendation preference", async () => {
    const valid = plainToInstance(CreateStoreDto, { name: "Taller Norte", cartRecommendationsEnabled: false });
    const invalid = plainToInstance(CreateStoreDto, { name: "Taller Norte", cartRecommendationsEnabled: "no" });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it("accepts only booleans for customer stock visibility", async () => {
    const valid = plainToInstance(CreateStoreDto, { name: "Taller Norte", showLowStockToCustomers: true });
    const invalid = plainToInstance(CreateStoreDto, { name: "Taller Norte", showLowStockToCustomers: "yes" });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
