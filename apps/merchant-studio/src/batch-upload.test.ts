import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, batchStatusLabel, validateImageBatch } from "./batch-upload";

const image = (name: string, size = 100, type = "image/jpeg") => ({
  name,
  size,
  type,
  lastModified: 1,
});

describe("validateImageBatch", () => {
  it("places three images into three slots from one selection", () => {
    const result = validateImageBatch([image("one.jpg"), image("two.jpg"), image("three.jpg")]);

    expect(result.accepted).toHaveLength(3);
    expect(result.accepted.map((entry) => entry.slot)).toEqual([0, 1, 2]);
    expect(result.rejected).toEqual([]);
  });

  it("does not collapse files that share a name", () => {
    const result = validateImageBatch([image("photo.jpg"), image("photo.jpg"), image("photo.jpg")]);

    expect(result.accepted).toHaveLength(3);
    expect(new Set(result.accepted.map((entry) => entry.id)).size).toBe(3);
  });

  it("rejects unsupported, oversized, and overflow files independently", () => {
    const result = validateImageBatch([
      image("notes.txt", 20, "text/plain"),
      image("huge.png", MAX_IMAGE_BYTES + 1, "image/png"),
      image("one.png", 20, "image/png"),
      image("two.png", 20, "image/png"),
      image("three.png", 20, "image/png"),
      image("four.png", 20, "image/png"),
    ]);

    expect(result.accepted).toHaveLength(3);
    expect(result.rejected.map((entry) => entry.reason)).toEqual(["not-image", "too-large", "batch-full"]);
  });
});

describe("batchStatusLabel", () => {
  it("reports progress and a deterministic completed count", () => {
    expect(batchStatusLabel(1, 3)).toBe("Cargando 1 de 3");
    expect(batchStatusLabel(3, 3)).toBe("3 de 3 imágenes listas");
  });
});
