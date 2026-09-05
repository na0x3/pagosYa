import { describe, expect, it } from "vitest";
import { storePreviewExternalDestination } from "../src/preview-navigation";

describe("store preview navigation boundary", () => {
  const current = "https://checkout.pagosya.bo/s/perran?preview=1&editor=0#proposal=private";

  it("keeps routes and anchors belonging to the current store inside the preview", () => {
    expect(storePreviewExternalDestination("#catalog", current)).toBeNull();
    expect(storePreviewExternalDestination("/s/perran/p/product_1", current)).toBeNull();
    expect(storePreviewExternalDestination("https://checkout.pagosya.bo/s/perran?page=historia", current)).toBeNull();
  });

  it("hands external, marketplace and other-store destinations to the dashboard", () => {
    expect(storePreviewExternalDestination("https://pagosya.bo", current)).toEqual({
      url: "https://pagosya.bo/",
      protocol: "https:",
    });
    expect(storePreviewExternalDestination("/stores/", current)?.url).toBe("https://checkout.pagosya.bo/stores/");
    expect(storePreviewExternalDestination("/stores/?link=perran", current)?.url).toBe("https://checkout.pagosya.bo/stores/?link=perran");
    expect(storePreviewExternalDestination("/s/another-store", current)?.url).toBe("https://checkout.pagosya.bo/s/another-store");
    expect(storePreviewExternalDestination("mailto:hola@example.com", current)?.protocol).toBe("mailto:");
  });

  it("does not turn malformed or executable schemes into a handoff", () => {
    expect(storePreviewExternalDestination("javascript:alert(1)", current)).toBeNull();
    expect(storePreviewExternalDestination("not a valid url", "not a url")).toBeNull();
  });
});
