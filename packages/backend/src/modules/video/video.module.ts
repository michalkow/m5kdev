import { BaseModule, type TableMap } from "../base/base.module";
import { VideoService } from "./video.service";

type VideoModuleDeps = never;
type VideoModuleTables = TableMap;
type VideoModuleRepositories = {};
type VideoModuleServices = {
  video: VideoService;
};
type VideoModuleRouters = never;

export class VideoModule extends BaseModule<
  VideoModuleDeps,
  VideoModuleTables,
  VideoModuleRepositories,
  VideoModuleServices,
  VideoModuleRouters
> {
  readonly id = "video";

  override services() {
    return {
      video: new VideoService(),
    };
  }
}
