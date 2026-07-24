import { getSortedRecommendedModelIds } from "@m5kdev/commons/modules/ai/ai.utils";
import { resolveModels, resolveRetryModels } from "./ai.utils";

describe("AI model resolution", () => {
  it("moves failed preferred models behind models without failures", () => {
    const failureCounts = new Map([["custom/failed", 1]]);

    const resolved = resolveModels({
      preferredModels: ["custom/failed", "custom/healthy"],
      failureCounts,
    });

    expect(resolved[0]).toBe("custom/healthy");
    expect(resolved.at(-1)).toBe("custom/failed");
  });

  it("preserves preferred and weighted order when failure counts are equal", () => {
    const recommended = getSortedRecommendedModelIds("chat");
    const resolved = resolveModels({
      preferredModels: ["custom/first", "custom/second"],
      failureCounts: new Map(),
    });

    expect(resolved).toEqual(["custom/first", "custom/second", ...recommended]);
  });

  it("sorts arbitrary preferred model IDs by ascending failure count", () => {
    const recommended = getSortedRecommendedModelIds("chat");
    const failureCounts = new Map<string, number>([
      ["custom/two-failures", 2],
      ["custom/one-failure", 1],
      ...recommended.map((model) => [model, 3] as const),
    ]);

    const resolved = resolveModels({
      preferredModels: ["custom/two-failures", "custom/one-failure"],
      failureCounts,
    });

    expect(resolved.slice(0, 2)).toEqual(["custom/one-failure", "custom/two-failures"]);
  });

  it("does not reorder explicit model selections", () => {
    const failureCounts = new Map([
      ["custom/first", 10],
      ["custom/second", 0],
    ]);

    expect(
      resolveModels({
        models: ["custom/first", "custom/second"],
        failureCounts,
      })
    ).toEqual(["custom/first", "custom/second"]);
    expect(resolveModels({ model: "custom/first", failureCounts })).toEqual(["custom/first"]);
  });

  it("keeps active retry rotation independent from failure sorting", () => {
    expect(resolveRetryModels(["first", "second", "third"])).toEqual(["second", "third", "first"]);
  });
});
