import type { ConnectRow } from "#modules/connect/connect.repository";
import type { FileService } from "#modules/file/file.service";

export type SocialMediaType = "image" | "video" | "document";

export interface SocialMediaDescriptor {
  readonly s3Path: string;
  readonly mediaType?: SocialMediaType;
  readonly title?: string;
  readonly description?: string;
}

export type SocialVisibility = "PUBLIC" | "CONNECTIONS";

export interface SocialPostPayload {
  readonly text: string;
  readonly media?: readonly SocialMediaDescriptor[];
  readonly visibility: SocialVisibility;
}

export interface SocialProviderContext {
  readonly userId: string;
  readonly connection: ConnectRow;
  readonly accessToken: string;
}

export interface SocialProviderDeps {
  readonly fileService: FileService;
}

export interface SocialPostResult {
  readonly shareUrn?: string;
  readonly rawResponse?: unknown;
}

export interface SocialProvider {
  readonly id: string;
  post(options: {
    deps: SocialProviderDeps;
    context: SocialProviderContext;
    payload: SocialPostPayload;
  }): Promise<SocialPostResult>;
}
