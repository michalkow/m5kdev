import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import type { AppConfigInput } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { loadExperience } from "@m5kdev/frontend/modules/app/experience";
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
