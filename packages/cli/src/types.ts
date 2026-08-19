export type AppPlatform = "web" | "expo" | "both";

export interface PromptValues {
  targetDirectory?: string;
  appName?: string;
  appDescription?: string;
  platform?: AppPlatform;
  testHarness?: boolean;
  /** Optional Backend Module feature ids (billing, workflows, …). `--yes` defaults to none. */
  modules?: string[];
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

export type TemplateFeatureKind = "platform" | "harness" | "module";

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
