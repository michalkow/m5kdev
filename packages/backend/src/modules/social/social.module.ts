import { defineBackendModule } from "../../app";
import { SocialService } from "./social.service";
import type { SocialProvider } from "./social.types";

export type CreateSocialBackendModuleOptions = {
  id?: string;
  connectModuleId?: string;
  fileModuleId?: string;
  providers: SocialProvider[];
};

export function createSocialBackendModule(options: CreateSocialBackendModuleOptions) {
  const id = options.id ?? "social";
  const connectModuleId = options.connectModuleId ?? "connect";
  const fileModuleId = options.fileModuleId ?? "file";

  return defineBackendModule({
    id,
    dependsOn: [connectModuleId, fileModuleId],
    services: ({ deps }) => ({
      social: new SocialService(
        {
          connect: deps[connectModuleId].repositories.connect,
        },
        {
          connect: deps[connectModuleId].services.connect,
          file: deps[fileModuleId].services.file,
        },
        options.providers
      ),
    }),
  });
}
