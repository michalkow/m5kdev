import { type BackendAppMetadata, createBackendApp } from "@m5kdev/backend/app";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import type { AppConfigInput } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { loadExperience } from "@m5kdev/frontend/modules/app/experience";
import type { Pool } from "pg";
import type { ReferenceService } from "../server/reference.service";

declare const experience: PublicExperience;
const selected: AppConfigInput = { experience };
// @ts-expect-error descriptor authoring cannot carry a competing name or URL.
const mixed: AppConfigInput = {
  experience,
  appName: "Other",
  appUrl: "https://other.example.test",
  serverUrl: "https://other.example.test",
};
function checkContext(service: ReferenceService) {
  // @ts-expect-error an Organization operation requires its authenticated Actor context.
  return service.publish(undefined, {});
}
void selected;
void mixed;
void loadExperience;
void checkContext;

function legacyMetadataConsumer(pool: Pool) {
  const metadata: BackendAppMetadata = {
    name: "Legacy",
    urls: { web: "https://web.example.test", api: "https://api.example.test" },
  };
  return createBackendApp({ db: { client: pool }, app: metadata });
}
void legacyMetadataConsumer;

import type { AuthenticatedActor } from "@m5kdev/backend/base/base.actor";
// Existing literal caller context remains open while optional Experience is checked at runtime.
import type { FileService } from "@m5kdev/backend/modules/file/file.service";

declare const files: FileService;
declare const oldFileActor: AuthenticatedActor;
void files.getDownloadUrl(
  { fileId: "legacy-file" },
  { actor: oldFileActor, user: { id: "legacy-user" } }
);
