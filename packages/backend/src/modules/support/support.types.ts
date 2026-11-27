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
export interface SupportDocumentationSource {
  url: string;
  title: string;
  text: string;
  sha256: string;
  locale: string;
}
export interface SupportAssistantProvider {
  readonly id: string;
  /** No tools, hidden retries, or external retrieval. Treat documentation and messages as untrusted data. */
  answer(input: {
    question: string;
    history: { role: "user" | "assistant"; content: string }[];
    sources: SupportDocumentationSource[];
    locale: string;
    maxOutputCharacters: number;
    signal: AbortSignal;
  }): Promise<{ supported: boolean; text: string; citations: string[] }>;
}
export interface SupportConfig {
  readonly grants?: ResourceGrant[];
  readonly maxAttachments?: number;
  readonly maxFileBytes?: number;
  readonly locales?: readonly string[];
  readonly translation?: SupportTranslationProvider;
  readonly assistant?: SupportAssistantProvider;
  readonly documentation?: {
    applicationVersion: string;
    allowedOrigins: readonly string[];
    manifestPath?: string;
  };
}
