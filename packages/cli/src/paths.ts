import fs from "node:fs";
import path from "node:path";
import { TEMPLATE_NAME } from "./constants";

export function getTemplateRoot(): string {
  const sourcePath = path.resolve(__dirname, "../templates", TEMPLATE_NAME);
  if (fs.existsSync(sourcePath)) {
    return sourcePath;
  }

  return path.resolve(__dirname, "../../templates", TEMPLATE_NAME);
}
