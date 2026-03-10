import type { AiModel } from "@m5kdev/commons/modules/ai/ai.constants";
import mustache from "mustache";
import { logger } from "../../utils/logger";

export class Prompt<C extends Record<string, string>> {
  public prompt: string;
  public name?: string;
  public type: "text" | "chat";
  public config?: {
    model?: AiModel;
    temperature?: number;
    supported_languages?: string[];
  };
  public version?: number;
  public labels?: string[];
  public tags?: string[];

  constructor(
    prompt: string,
    settings?: {
      name?: string;
      type?: "text" | "chat";
      config?: {
        model?: AiModel;
        temperature?: number;
        supported_languages?: string[];
      };
      version?: number;
      labels?: string[];
      tags?: string[];
    }
  ) {
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
