import type { ResourceGrant } from "../../base/base.grants";
export interface SupportTranslationProvider {
  readonly id: string;
  readonly languages: readonly string[];
  /** One attempt only; honor AbortSignal. Support owns retries, usage reservation and publication. */
  translate(input: {
    text: string;
    sourceLocale: string;
    targetLocale: string;
    maxOutputCharacters: number;
    signal: AbortSignal;
  }): Promise<{ text: string }>;
  detect?(input: { text: string; signal: AbortSignal }): Promise<{ locale: string }>;
}
export interface SupportConfig {
  readonly grants?: ResourceGrant[];
  readonly maxAttachments?: number;
  readonly maxFileBytes?: number;
  readonly locales?: readonly string[];
  readonly translation?: SupportTranslationProvider;
}
