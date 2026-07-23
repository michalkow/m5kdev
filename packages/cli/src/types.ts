export type AppPlatform = "web" | "expo" | "both";

export interface PromptValues {
  targetDirectory?: string;
  appName?: string;
  appDescription?: string;
  platform?: AppPlatform;
  testHarness?: boolean;
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

export interface TemplateFeatureManifest {
  schemaVersion: number;
  features: Record<string, { paths: readonly string[] }>;
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
