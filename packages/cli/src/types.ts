export type AppPlatform = "web" | "expo" | "both" | "landing";
export type DocumentationHosting = "landing" | "server" | "standalone";

/** Deployment environments beside the default Development and Production. */
export const OPTIONAL_ENVIRONMENTS = ["staging", "canary"] as const;
export type OptionalEnvironment = (typeof OPTIONAL_ENVIRONMENTS)[number];

export interface PromptValues {
  targetDirectory?: string;
  appName?: string;
  appDescription?: string;
  platform?: AppPlatform;
  docsHosting?: DocumentationHosting;
  testHarness?: boolean;
  /** Optional Backend Module feature ids (billing, workflows, …). `--yes` defaults to none. */
  modules?: string[];
  /** Optional Deployment environments (staging, canary). `--yes` defaults to none. */
  environments?: OptionalEnvironment[];
}

export interface CreateCommandOptions extends PromptValues {
  yes: boolean;
  force: boolean;
  skipInstall: boolean;
  skipGit: boolean;
}

export interface TemplateContext {
  appName: string;
  appDescription: string;
  appSlug: string;
  packageScope: string;
  betterAuthSecret: string;
}

export type TemplateFeatureKind = "platform" | "harness" | "module" | "environment" | "hosting";

export interface TemplateFeatureConfig {
  paths: readonly string[];
  kind?: TemplateFeatureKind;
  experimental?: boolean;
  label?: string;
}

export interface TemplateFeatureManifest {
  schemaVersion: number;
  features: Record<string, TemplateFeatureConfig>;
  requiredPaths: readonly string[];
  sync: {
    defaultPolicy: TemplateFilePolicy;
    rules: readonly { pattern: string; policy: TemplateFilePolicy }[];
    renames?: readonly { from: string; to: string }[];
  };
}

export type TemplateFilePolicy = "merge" | "ensure" | "ignore";

export interface RenderedTemplateFile {
  content: Buffer;
  kind: "text" | "binary";
  relativePath: string;
}
