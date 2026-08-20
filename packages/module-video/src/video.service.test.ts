import { existsSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { VideoService } from "./video.service";

/** Default sample used when `VIDEO_TEST_INPUT` is unset (local dev). */
const DEFAULT_TEST_VIDEO = "/Users/michalkow/Downloads/aAy99eE_460svav1.mp4";

const testVideoPath = process.env.VIDEO_TEST_INPUT ?? DEFAULT_TEST_VIDEO;
const hasTestVideo = existsSync(testVideoPath);

describe("VideoService", () => {
  const videoService = new VideoService();

  (hasTestVideo ? it : it.skip)(
    "cuts a short segment and writes a non-empty mp4 (requires ffmpeg)",
    async () => {
      const result = await videoService.cut(testVideoPath, 0, 1);

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }

      const outputPath = result.value;
      expect(path.isAbsolute(outputPath)).toBe(true);
      expect(existsSync(outputPath)).toBe(true);

      const { size } = statSync(outputPath);
      expect(size).toBeGreaterThan(0);

      unlinkSync(outputPath);
    },
    60_000
  );
});
