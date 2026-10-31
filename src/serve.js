import { createApp } from "./app/server.js";
import { fetchArticle, searchTitles, suggestTitles } from "./wikipedia.js";
import { fetchSourceText } from "./fetchSource.js";
import { makeBareClient } from "./cli.js";
import { fromRoot } from "./paths.js";

function main() {
  const choice = process.env.AI_CLIENT || "manual";
  const model = process.env.AI_MODEL || "";
  const ai = { choice, model, client: choice === "manual" ? null : makeBareClient(choice, model) };

  const server = createApp({
    goldDir: fromRoot("gold"),
    sourcesDir: fromRoot("sources"),
    publicDir: fromRoot("public"),
    fetchArticle,
    searchTitles: (query) => searchTitles(query),
    suggestTitles: (query) => suggestTitles(query),
    fetchText: fetchSourceText,
    ai,
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Claim verifier is running. Open http://localhost:${port}`);
    console.log(ai.client ? `AI: ${choice} ${model}` : "AI: manual (you paste the AI's reply)");
    console.log("Press Ctrl+C to stop.");
  });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
