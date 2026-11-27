import type { Mastra } from "@mastra/core";
import type { AIService } from "../ai/ai.service";
import type { SupportConfig } from "./support.types";
import { createSupportAnswerPrompt } from "./support-answer.prompt";
import { createSupportDetectionPrompt } from "./support-detection.prompt";
import { createSupportTranslationPrompt } from "./support-translation.prompt";
export interface SupportModels {
  translation?: { model: string; languages: readonly string[] };
  assistant?: { model: string };
}
/** Adapts the existing AI service; Support owns all retries and usage reservations. */
export function createSupportProviders(
  ai: Pick<AIService<Mastra>, "generateObject">,
  models: SupportModels
): Pick<SupportConfig, "translation" | "assistant"> {
  const translation = models.translation;
  const assistant = models.assistant;
  return {
    ...(translation
      ? {
          translation: {
            id: translation.model,
            languages: translation.languages,
            translate: async (input) => {
              const result = await ai.generateObject(
                createSupportTranslationPrompt(input, translation.model)
              );
              if (result.isErr()) throw result.error;
              return result.value;
            },
            detect: async (input) => {
              const result = await ai.generateObject(
                createSupportDetectionPrompt(
                  { ...input, languages: translation.languages },
                  translation.model
                )
              );
              if (result.isErr()) throw result.error;
              return result.value;
            },
          },
        }
      : {}),
    ...(assistant
      ? {
          assistant: {
            id: assistant.model,
            answer: async (input) => {
              const result = await ai.generateObject(
                createSupportAnswerPrompt(input, assistant.model)
              );
              if (result.isErr()) throw result.error;
              return result.value;
            },
          },
        }
      : {}),
  };
}
