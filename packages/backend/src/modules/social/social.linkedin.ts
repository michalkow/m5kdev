import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import type { ConnectRow } from "#modules/connect/connect.repository";
import type { FileService } from "#modules/file/file.service";
import type { SocialMediaDescriptor, SocialPostPayload, SocialProvider } from "./social.types";

const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202601";

const IMAGES_URL = `${LINKEDIN_API_BASE}/images?action=initializeUpload`;
const VIDEOS_URL = `${LINKEDIN_API_BASE}/videos?action=initializeUpload`;
const VIDEOS_FINALIZE_URL = `${LINKEDIN_API_BASE}/videos?action=finalizeUpload`;
const DOCUMENTS_URL = `${LINKEDIN_API_BASE}/documents?action=initializeUpload`;
const POSTS_URL = `${LINKEDIN_API_BASE}/posts`;

interface LinkedInMetadata {
  linkedInUrn?: string;
  [key: string]: unknown;
}

interface UploadedAsset {
  assetUrn: string;
  mediaType: "image" | "video" | "document";
  title?: string;
  description?: string;
}

interface ImageInitResponse {
  value: {
    uploadUrlExpiresAt: number;
    uploadUrl: string;
    image: string;
  };
}

interface VideoInitResponse {
  value: {
    uploadUrlsExpireAt: number;
    video: string;
    uploadInstructions: Array<{
      uploadUrl: string;
      lastByte: number;
      firstByte: number;
    }>;
    uploadToken: string;
  };
}

interface DocumentInitResponse {
  value: {
    uploadUrlExpiresAt: number;
    uploadUrl: string;
    document: string;
  };
}

function getApiHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Linkedin-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export function createLinkedInSocialProvider(): SocialProvider {
  return {
    id: "linkedin",
    async post({ deps, context, payload }) {
      const personUrn = resolveAuthorUrn(context.connection);
      const mediaDescriptors = payload.media ?? [];

      let uploadedAssets: UploadedAsset[] = [];
      if (mediaDescriptors.length > 0) {
        uploadedAssets = await uploadMediaAssets({
          accessToken: context.accessToken,
          fileService: deps.fileService,
          mediaDescriptors,
          personUrn,
        });
      }

      const response = await publishPost({
        accessToken: context.accessToken,
        personUrn,
        payload,
        uploadedAssets,
      });

      return {
        shareUrn: response.postUrn,
        rawResponse: response.raw,
      };
    },
  };
}

function resolveAuthorUrn(connection: ConnectRow): string {
  if (connection.metadataJson) {
    try {
      const metadata = connection.metadataJson as LinkedInMetadata;
      if (metadata.linkedInUrn && typeof metadata.linkedInUrn === "string") {
        return metadata.linkedInUrn;
      }
    } catch {
      throw new Error("Failed to parse LinkedIn connection metadata");
    }
  }

  if (connection.providerAccountId) {
    return `urn:li:person:${connection.providerAccountId}`;
  }

  throw new Error("LinkedIn connection is missing a person URN");
}

async function uploadMediaAssets(params: {
  accessToken: string;
  fileService: FileService;
  mediaDescriptors: readonly SocialMediaDescriptor[];
  personUrn: string;
}): Promise<UploadedAsset[]> {
  const results: UploadedAsset[] = [];

  for (const descriptor of params.mediaDescriptors) {
    const download = await params.fileService.downloadS3ToFile(descriptor.s3Path);
    if (download.isErr()) {
      throw download.error;
    }

    const localPath = download.value;
    try {
      const mediaType = determineMediaType(descriptor.mediaType, localPath);

      let assetUrn: string;
      switch (mediaType) {
        case "image":
          assetUrn = await uploadImage({
            accessToken: params.accessToken,
            personUrn: params.personUrn,
            localPath,
          });
          break;
        case "video":
          assetUrn = await uploadVideo({
            accessToken: params.accessToken,
            personUrn: params.personUrn,
            localPath,
          });
          break;
        case "document":
          assetUrn = await uploadDocument({
            accessToken: params.accessToken,
            personUrn: params.personUrn,
            localPath,
          });
          break;
      }

      results.push({
        assetUrn,
        mediaType,
        title: descriptor.title,
        description: descriptor.description,
      });
    } finally {
      await unlink(localPath).catch(() => undefined);
    }
  }

  return results;
}

function determineMediaType(
  explicitType: SocialMediaDescriptor["mediaType"],
  localPath: string
): "image" | "video" | "document" {
  if (explicitType) {
    return explicitType;
  }

  const extension = localPath.split(".").pop()?.toLowerCase();
  if (!extension) {
    throw new Error("Unable to determine media type from file extension");
  }

  const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
  const videoExtensions = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm"]);
  const documentExtensions = new Set(["pdf", "ppt", "pptx", "doc", "docx"]);

  if (imageExtensions.has(extension)) {
    return "image";
  }
  if (videoExtensions.has(extension)) {
    return "video";
  }
  if (documentExtensions.has(extension)) {
    return "document";
  }

  throw new Error(`Unsupported media extension: ${extension}`);
}

async function uploadImage(params: {
  accessToken: string;
  personUrn: string;
  localPath: string;
}): Promise<string> {
  const initResponse = await fetch(IMAGES_URL, {
    method: "POST",
    headers: getApiHeaders(params.accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: params.personUrn,
      },
    }),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text().catch(() => "");
    throw new Error(
      `LinkedIn image upload initialization failed: ${initResponse.status} ${errorText}`
    );
  }

  const initJson = (await initResponse.json()) as ImageInitResponse;
  const { uploadUrl, image } = initJson.value;

  if (!uploadUrl || !image) {
    throw new Error("LinkedIn image initialization response missing required fields");
  }

  await uploadBinaryToLinkedIn({
    uploadUrl,
    localPath: params.localPath,
    mimeType: inferImageMime(params.localPath),
  });

  return image;
}

async function uploadVideo(params: {
  accessToken: string;
  personUrn: string;
  localPath: string;
}): Promise<string> {
  const fileSizeBytes = await getFileSize(params.localPath);

  const initResponse = await fetch(VIDEOS_URL, {
    method: "POST",
    headers: getApiHeaders(params.accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: params.personUrn,
        fileSizeBytes,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text().catch(() => "");
    throw new Error(
      `LinkedIn video upload initialization failed: ${initResponse.status} ${errorText}`
    );
  }

  const initJson = (await initResponse.json()) as VideoInitResponse;
  const { uploadInstructions, video, uploadToken } = initJson.value;

  if (!uploadInstructions || !video || !uploadToken) {
    throw new Error("LinkedIn video initialization response missing required fields");
  }

  const uploadedPartIds = await uploadVideoMultipart({
    localPath: params.localPath,
    uploadInstructions,
  });

  await finalizeVideoUpload({
    accessToken: params.accessToken,
    video,
    uploadToken,
    uploadedPartIds,
  });

  return video;
}

async function uploadVideoMultipart(params: {
  localPath: string;
  uploadInstructions: VideoInitResponse["value"]["uploadInstructions"];
}): Promise<string[]> {
  const uploadedPartIds: string[] = [];

  for (const instruction of params.uploadInstructions) {
    const chunkStream = createReadStream(params.localPath, {
      start: instruction.firstByte,
      end: instruction.lastByte,
    });

    const uploadResponse = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: chunkStream,
      duplex: "half",
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => "");
      throw new Error(`LinkedIn video part upload failed: ${uploadResponse.status} ${errorText}`);
    }

    const etag = uploadResponse.headers.get("etag");
    if (!etag) {
      throw new Error("LinkedIn video part upload response missing ETag header");
    }

    uploadedPartIds.push(etag.replace(/"/g, ""));
  }

  return uploadedPartIds;
}

async function finalizeVideoUpload(params: {
  accessToken: string;
  video: string;
  uploadToken: string;
  uploadedPartIds: string[];
}): Promise<void> {
  const response = await fetch(VIDEOS_FINALIZE_URL, {
    method: "POST",
    headers: getApiHeaders(params.accessToken),
    body: JSON.stringify({
      finalizeUploadRequest: {
        video: params.video,
        uploadToken: params.uploadToken,
        uploadedPartIds: params.uploadedPartIds,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`LinkedIn video finalize failed: ${response.status} ${errorText}`);
  }
}

async function uploadDocument(params: {
  accessToken: string;
  personUrn: string;
  localPath: string;
}): Promise<string> {
  const initResponse = await fetch(DOCUMENTS_URL, {
    method: "POST",
    headers: getApiHeaders(params.accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: params.personUrn,
      },
    }),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text().catch(() => "");
    throw new Error(
      `LinkedIn document upload initialization failed: ${initResponse.status} ${errorText}`
    );
  }

  const initJson = (await initResponse.json()) as DocumentInitResponse;
  const { uploadUrl, document } = initJson.value;

  if (!uploadUrl || !document) {
    throw new Error("LinkedIn document initialization response missing required fields");
  }

  await uploadBinaryToLinkedIn({
    uploadUrl,
    localPath: params.localPath,
    mimeType: inferDocumentMime(params.localPath),
  });

  return document;
}

async function uploadBinaryToLinkedIn(params: {
  uploadUrl: string;
  localPath: string;
  mimeType: string;
}): Promise<void> {
  const uploadResponse = await fetch(params.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": params.mimeType,
    },
    body: createReadStream(params.localPath),
    duplex: "half",
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "");
    throw new Error(`LinkedIn media upload failed: ${uploadResponse.status} ${errorText}`);
  }
}

async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

function inferImageMime(localPath: string): string {
  const extension = localPath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function inferDocumentMime(localPath: string): string {
  const extension = localPath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

async function publishPost(params: {
  accessToken: string;
  personUrn: string;
  payload: SocialPostPayload;
  uploadedAssets: UploadedAsset[];
}): Promise<{ postUrn?: string; raw: unknown }> {
  const body = buildPostBody(params);

  const response = await fetch(POSTS_URL, {
    method: "POST",
    headers: getApiHeaders(params.accessToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`LinkedIn post failed: ${response.status} ${errorText}`);
  }

  const postUrn = response.headers.get("x-restli-id") ?? undefined;
  const raw = await safeJson(response);

  return { postUrn, raw };
}

/**
 * Escapes special characters in text for LinkedIn's post commentary field.
 * LinkedIn requires certain characters to be backslash-escaped.
 * Preserves mentions (@[Name](urn:li:...)) and hashtag templates ({hashtag|#|tag}).
 * Converts simple hashtags (#tag) to the template format.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
 */
export function escapeLinkedInText(text: string): string {
  // Patterns for LinkedIn elements that should not be escaped
  // MentionElement: @[FallbackText](urn:li:...)
  const mentionPattern = /@\[[^\]]*\]\(urn:li:[^)]+\)/g;
  // HashtagTemplate: {hashtag|#|text} or {hashtag|＃|text} (with optional escaped #)
  const hashtagTemplatePattern = /\{hashtag\|\\?[#＃]\|[^}]+\}/g;
  // Simple hashtag: #word (must start with a letter, not digit-only)
  const simpleHashtagPattern =
    /#([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF][\w\u00C0-\u024F\u1E00-\u1EFF]*)/g;

  // Store matches in array, use index-based placeholders with null character delimiters
  const preserved: string[] = [];

  const createPlaceholder = (content: string): string => {
    const index = preserved.length;
    preserved.push(content);
    return `\x00${index}\x00`;
  };

  // Replace mentions with placeholders (preserve as-is)
  let result = text.replace(mentionPattern, (match) => createPlaceholder(match));

  // Replace hashtag templates with placeholders (preserve as-is)
  result = result.replace(hashtagTemplatePattern, (match) => createPlaceholder(match));

  // Convert simple hashtags to template format with escaped #
  result = result.replace(simpleHashtagPattern, (_match, tag: string) =>
    createPlaceholder(`{hashtag|\\#|${tag}}`)
  );

  // Escape remaining special characters (order matters: backslash first)
  result = result
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/@/g, "\\@")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~");

  // Restore placeholders with preserved/transformed content
  // biome-ignore lint/suspicious/noControlCharactersInRegex: null chars are intentional placeholders
  result = result.replace(/\x00(\d+)\x00/g, (_match, index: string) => preserved[Number(index)]);

  return result;
}

function buildPostBody(params: {
  personUrn: string;
  payload: SocialPostPayload;
  uploadedAssets: UploadedAsset[];
}): Record<string, unknown> {
  const { personUrn, payload, uploadedAssets } = params;

  const basePost = {
    author: personUrn,
    commentary: escapeLinkedInText(payload.text),
    visibility: payload.visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (uploadedAssets.length === 0) {
    return basePost;
  }

  if (uploadedAssets.length > 1) {
    throw new Error("LinkedIn Posts API currently supports only a single media asset per post");
  }

  const asset = uploadedAssets[0];

  const mediaContent: Record<string, unknown> = {
    id: asset.assetUrn,
  };

  if (asset.title) {
    mediaContent.title = asset.title;
  }

  if (asset.description && asset.mediaType === "image") {
    mediaContent.altText = asset.description;
  }

  return {
    ...basePost,
    content: {
      media: mediaContent,
    },
  };
}

async function safeJson(response: globalThis.Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
