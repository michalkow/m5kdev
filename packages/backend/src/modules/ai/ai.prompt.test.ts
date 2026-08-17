import type { ZodTypeAny } from "zod";
import type { GeneratePromptParamsFor } from "./ai.prompt";
import type {
  AIServiceGenerateExtractedObjectParams,
  AIServiceGenerateObjectParams,
} from "./ai.service";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

describe("GeneratePromptParamsFor", () => {
  it("distributes over object | extracted and retains both parameter shapes", () => {
    type Schema = ZodTypeAny;
    type UnionParams = GeneratePromptParamsFor<"object" | "extracted", Schema>;
    type Expected =
      | AIServiceGenerateObjectParams<Schema>
      | AIServiceGenerateExtractedObjectParams<Schema>;

    const retainsBothShapes: Equals<UnionParams, Expected> = true;
    const objectParams = { schema: {} as Schema } as AIServiceGenerateObjectParams<Schema>;
    const extractedParams = {
      schema: {} as Schema,
      prompt: "source",
    } as AIServiceGenerateExtractedObjectParams<Schema>;
    const retained: UnionParams[] = [objectParams, extractedParams];

    expect(retainsBothShapes).toBe(true);
    expect(retained).toHaveLength(2);
  });
});
