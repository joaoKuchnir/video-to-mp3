import { describe, expect, it } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("uses the default prefix", () => {
    expect(newId()).toMatch(/^dl-\d+-\d+$/);
  });

  it("respects a custom prefix", () => {
    expect(newId("toast")).toMatch(/^toast-\d+-\d+$/);
  });

  it("produces unique values across rapid calls", () => {
    const ids = Array.from({ length: 100 }, () => newId());
    expect(new Set(ids).size).toBe(100);
  });
});
