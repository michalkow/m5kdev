import mustache from "mustache";
import type { ZodTypeAny } from "zod";

import { logger } from "../../utils/logger";
import type {
  AIServiceGenerateExtractedObjectParams,
  AIServiceGenerateObjectParams,
  AIServiceGenerateTextParams,
} from "./ai.service";

export type PromptSettings = {
  name?: string;
  type?: "text" | "chat";
  config?: {
    model?: string;
    temperature?: number;
    supported_languages?: string[];
  };
  version?: number;
  labels?: string[];
  tags?: string[];
};
export class Prompt<C extends Record<string, string>> {
  public prompt: string;
  public name?: PromptSettings["name"];
  public type: PromptSettings["type"];
  public config?: PromptSettings["config"];
  public version?: PromptSettings["version"];
  public labels?: PromptSettings["labels"];
  public tags?: PromptSettings["tags"];

  constructor(prompt: string, settings?: PromptSettings) {
    this.prompt = prompt;
    this.name = settings?.name;
    this.type = settings?.type ?? "text";
    this.config = settings?.config;
    this.version = settings?.version;
    this.labels = settings?.labels;
    this.tags = settings?.tags;
  }

  compile(context: C): string {
    const result = mustache.render(this.prompt.trim(), context);
    logger.debug(`[PROMPT]: ${result.trim()}`);
    return result.trim();
  }
}

type GeneratePromptKind = "text" | "object" | "extracted";

export type GeneratePromptParamsFor<
  K extends GeneratePromptKind,
  S extends ZodTypeAny = ZodTypeAny,
> = K extends "text"
  ? AIServiceGenerateTextParams
  : K extends "object"
    ? AIServiceGenerateObjectParams<S>
    : AIServiceGenerateExtractedObjectParams<S>;

export function createGeneratePromptParams<K extends "text", T>(
  processor: (context: T) => GeneratePromptParamsFor<K>
): (context: T, override?: Partial<GeneratePromptParamsFor<K>>) => GeneratePromptParamsFor<K>;
export function createGeneratePromptParams<
  K extends "object" | "extracted",
  T,
  S extends ZodTypeAny,
>(
  processor: (context: T) => GeneratePromptParamsFor<K, S>
): (context: T, override?: Partial<GeneratePromptParamsFor<K, S>>) => GeneratePromptParamsFor<K, S>;
export function createGeneratePromptParams<K extends GeneratePromptKind, T, S extends ZodTypeAny>(
  processor: (context: T) => GeneratePromptParamsFor<K, S>
): (
  context: T,
  override?: Partial<GeneratePromptParamsFor<K, S>>
) => GeneratePromptParamsFor<K, S> {
  return (context, override) => {
    const params = processor(context);
    return {
      ...params,
      ...override,
    };
  };
}
