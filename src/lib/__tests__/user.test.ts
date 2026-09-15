import { describe, it, expect } from "vitest";
import { possessive } from "../user";

describe("possessive", () => {
  it("appends 's' to a name not already ending in an s-sound", () => {
    expect(possessive("Philipp")).toBe("Philipps");
    expect(possessive("Jochen")).toBe("Jochens");
  });

  it("appends only an apostrophe to a name ending in s/ß/x/z", () => {
    expect(possessive("Klaus")).toBe("Klaus'");
    expect(possessive("Felix")).toBe("Felix'");
    expect(possessive("Fritz")).toBe("Fritz'");
    expect(possessive("Moritz")).toBe("Moritz'");
  });

  it("trims surrounding whitespace before forming the possessive", () => {
    expect(possessive("  Anna  ")).toBe("Annas");
  });
});
