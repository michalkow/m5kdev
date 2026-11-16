import type { Pool } from "pg";
import { type BackendAppMetadata, createBackendApp } from "../app";
/** Existing annotated metadata authoring remains assignable at the public Kernel boundary. */
export function composeLegacyMetadata(pool: Pool) {
  const metadata: BackendAppMetadata = {
    name: "Legacy",
    urls: { web: "https://web.example.test", api: "https://api.example.test" },
  };
  return createBackendApp({ db: { client: pool }, app: metadata });
}
