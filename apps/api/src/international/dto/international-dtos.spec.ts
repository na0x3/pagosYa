import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { InternationalActionDto } from "./international-action.dto";
import { InternationalMethodsDto } from "./international-methods.dto";

describe("InternationalMethodsDto", () => {
  it("accepts a two-letter uppercase country code", async () => {
    const dto = plainToInstance(InternationalMethodsDto, { country: "BR" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a lowercase country code", async () => {
    const dto = plainToInstance(InternationalMethodsDto, { country: "br" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a three-letter country code", async () => {
    const dto = plainToInstance(InternationalMethodsDto, { country: "BRA" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a missing country", async () => {
    const dto = plainToInstance(InternationalMethodsDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("InternationalActionDto", () => {
  it("accepts a reason with at least 8 characters", async () => {
    const dto = plainToInstance(InternationalActionDto, { reason: "KYC ok!!" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a reason shorter than 8 characters", async () => {
    const dto = plainToInstance(InternationalActionDto, { reason: "short" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a reason longer than 500 characters", async () => {
    const dto = plainToInstance(InternationalActionDto, { reason: "a".repeat(501) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
