import {combineSupportDocumentationParts} from "@m5kdev/backend/modules/support/support.documentation";
await combineSupportDocumentationParts(new URL("../build/",import.meta.url).pathname);
