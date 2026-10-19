import { ManualClient, AnthropicClient } from "./clients.js";

export function getFlag(name, fallback) {
  const position = process.argv.indexOf(`--${name}`);
  return position > -1 ? process.argv[position + 1] : fallback;
}

export function makeClient() {
  const useApi = getFlag("client", "manual") === "anthropic";
  return useApi ? new AnthropicClient(getFlag("model")) : new ManualClient();
}