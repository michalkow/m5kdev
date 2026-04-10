import { defineBackendModule } from "../../app";
import { VideoService } from "./video.service";

export function createVideoBackendModule(options: { id?: string } = {}) {
  return defineBackendModule({
    id: options.id ?? "video",
    services: () => ({
      video: new VideoService(undefined as never, undefined as never),
    }),
  });
}
