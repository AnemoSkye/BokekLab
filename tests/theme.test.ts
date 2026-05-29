import { describe, expect, it } from "vitest";
import { resolveThemeMode, shouldUseRapidSpots } from "../src/lib/theme";

describe("theme mode resolution", () => {
  it("uses brand mode for the entry desk", () => {
    expect(resolveThemeMode(0, 25000)).toBe("brand");
  });

  it("uses Sultan mode only in the Home flow", () => {
    expect(resolveThemeMode(0, 250000, false, "sultan")).toBe("sultan");
    expect(resolveThemeMode(1, 250000, false, "sultan")).toBe("saved");
  });

  it("uses saved mode for Recipes by default", () => {
    expect(resolveThemeMode(1, 0)).toBe("saved");
    expect(shouldUseRapidSpots(1, 0)).toBe(false);
    expect(resolveThemeMode(1, 1000)).toBe("saved");
  });

  it("switches to campaign mode and rapid spots on funded recipe focus", () => {
    expect(resolveThemeMode(1, 1000, true)).toBe("campaign");
    expect(shouldUseRapidSpots(1, 1000, true)).toBe(true);
  });
});
