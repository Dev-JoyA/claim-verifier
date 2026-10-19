import fs from "node:fs";
import { fromRoot } from "./paths.js";

export function loadGold(folder = fromRoot("gold")) {
  const fileNames = fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".json") && !name.toLowerCase().startsWith("template"))
    .sort();

  return fileNames.map((fileName) => {
    const text = fs.readFileSync(`${folder}/${fileName}`, "utf8");
    try {
      return { file: fileName, ...JSON.parse(text) };
    } catch (error) {
      throw new Error(`${fileName} is not valid JSON: ${error.message}`);
    }
  });
}

export function readSource(item) {
  if (!item.source_file) return "";
  const sourcePath = fromRoot(item.source_file);
  return fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";
}
