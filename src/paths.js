import { fileURLToPath } from "node:url";
import path from "node:path";

const thisFile = fileURLToPath(import.meta.url);

export const ROOT = path.resolve(path.dirname(thisFile), "..");

export function fromRoot(...pieces) {
  return path.join(ROOT, ...pieces);
}
