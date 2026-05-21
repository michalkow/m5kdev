import mustache from "mustache";
import { logger } from "../../utils/logger";

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
