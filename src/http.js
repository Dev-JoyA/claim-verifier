export const USER_AGENT =
  process.env.WIKI_USER_AGENT ??
  "claim-verifier/0.1 (Outreachy applicant prototype; set WIKI_USER_AGENT with your contact email)";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
