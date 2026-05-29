import { describe, expect, it } from "vitest";
import { formatRupiah } from "../src/lib/format";

describe("formatRupiah", () => {
  it("formats Indonesian rupiah with localized separators", () => {
    expect(formatRupiah(0)).toBe("Rp 0");
    expect(formatRupiah(25000)).toBe("Rp 25.000");
  });

  it("guards negative values at zero", () => {
    expect(formatRupiah(-5000)).toBe("Rp 0");
  });
});
