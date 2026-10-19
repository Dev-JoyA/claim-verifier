import fs from "node:fs";
import readline from "node:readline/promises";
import { fromRoot } from "./paths.js";

export class ManualClient {
  constructor(folder = fromRoot("results", "manual")) {
    this.dir = folder;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async complete(prompt, key) {
    const promptFile = `${this.dir}/${key}.prompt.txt`;
    const replyFile = `${this.dir}/${key}.reply.json`;

    if (!fs.existsSync(replyFile)) {
      fs.writeFileSync(promptFile, prompt, "utf8");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await rl.question(
        `\nPrompt saved: ${promptFile}\n` +
          `Paste it into a NEW chat, save the reply as:\n${replyFile}\n` +
          "Then press Enter..."
      );
      rl.close();
    }
    return fs.readFileSync(replyFile, "utf8");
  }
}

export class AnthropicClient {
  constructor(model) {
    this.model = model;
    this.key = process.env.ANTHROPIC_API_KEY;
    if (!this.key) throw new Error("Set ANTHROPIC_API_KEY first.");
  }

  async complete(prompt) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.content[0].text;
  }
}
