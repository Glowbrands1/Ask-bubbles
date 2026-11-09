import { describe, expect, it } from "vitest";

import { held } from "./held-promise";

describe("held (CHAT_PARALLEL_LOADS)", () => {
  it("a rejection still reaches the later await", async () => {
    const started = held(Promise.reject(new Error("load failed")));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(started).rejects.toThrow("load failed");
  });

  it("a value comes back unchanged", async () => {
    await expect(held(Promise.resolve("block"))).resolves.toBe("block");
  });
});

