import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateCollectionDto } from "./create-collection.dto";

describe("CreateCollectionDto", () => {
  it("accepts an ordinary Spanish name", async () => {
    const dto = plainToInstance(CreateCollectionDto, { name: "Verano" });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects a name containing an invisible control or bidi-override character", async () => {
    // Collection names are merchant-authored and rendered on the storefront
    // and dashboard, same concern as CreateCategoryDto.name.
    const dto = plainToInstance(CreateCollectionDto, { name: "Verano‮oculto" });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
