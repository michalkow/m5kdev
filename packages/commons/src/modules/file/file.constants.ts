export const fileTypes: Record<string, { mimetypes: string[]; extensions: string[] }> = {
  image: {
    mimetypes: ["image/jpeg", "image/png", "image/jpg", "image/webp"],
    extensions: ["jpg", "jpeg", "png", "webp"],
  },
  video: {
    mimetypes: ["video/mp4", "video/mov", "video/avi", "video/mkv", "video/webm"],
    extensions: ["mp4", "mov", "avi", "mkv"],
  },
  audio: {
    mimetypes: ["audio/mp3", "audio/wav", "audio/m4a", "audio/webm"],
    extensions: ["mp3", "wav", "m4a", "webm"],
  },
} as const;
