# Claim Verifier

A local tool that checks whether the sources cited in a Wikipedia article really support the sentences they are attached to. A person reads and rates claims, an AI can suggest ratings, and the app keeps the two clearly apart so the human ratings can be used as a trustworthy answer key.


## Why this exists 

- What problem you saw (claims whose citations do not say what the article says).
- How it relates to the Wikimedia claim-source verification work.
- What you wanted the tool to make easier.

## What it does

1. Opens a Wikipedia article (by title or by exact revision) and finds every sentence that has at least one footnote.
2. Numbers those sentences as claims, in reading order, and lists the sources each claim cites.
3. Downloads each source, or its archived copy, and keeps the text on your computer.
4. Asks an AI whether the sources, read together, support the claim, and turns the answer into a rating.
5. Lets a human accept, correct or replace the AI's rating, and records who did what.
6. Shows the results grouped by rating, compares human and AI ratings, and exports a wikitext table or a CSV.

## Screenshots

*(Add your own screenshots here.)*

| Claims | Summary by rating | Human vs AI |
|---|---|---|
| `docs/claims.png` | `docs/summary.png` | `docs/compare.png` |

## Quick start

Requirements: Node.js 22.9 or newer.

```powershell
npm install
Copy-Item .env.example .env
npm test
npm run serve
```

Then open http://localhost:3000. Stop the app with Ctrl+C.

The app listens on `127.0.0.1` only and rejects requests for any other host name. It has no login. Do not expose it on a network (see *Security*).

## Choosing an AI

Set these in `.env` (never commit that file; it is in `.gitignore`).

| Setting | Meaning |
|---|---|
| `AI_CLIENT` | `manual`, `gemini`, `anthropic` or `ollama` |
| `AI_MODEL` | The model name for that service (not used by `manual`) |
| `GEMINI_API_KEY` | Needed for `gemini` |
| `ANTHROPIC_API_KEY` | Needed for `anthropic` |
| `WIKI_USER_AGENT` | A descriptive name and contact address, as Wikipedia asks of programs |
| `PORT` | Optional, default 3000 |

- **manual**: no AI is connected. The page shows the prompt; you paste it into any AI chat and paste the reply back.
- **gemini**, **anthropic**: hosted services. A busy service (HTTP 429, 500, 502, 503, 504 or 529) is retried after 3, 8 and 20 seconds before an error is shown.
- **ollama**: a model running on your own computer at `localhost:11434`.

## Using the app

### Counting claims and sources

- A **claim** is a sentence that carries at least one footnote and is at least 25 characters long. Claims are numbered by the app, in reading order, starting at 1. The number has nothing to do with the footnote numbers.
- The **sources** of a claim are the distinct footnotes in that sentence. A sentence ending in `[4][5]` is one claim with two sources. The footnote label is shown as written in the article, for example `footnote [4]`.
- A quotation is never split in the middle. A sentence that has no full stop before a footnote, such as `...on SiriusXM[8] The show was...`, is split at that footnote when a capital letter follows.
- When one footnote is cited by several claims, its text is read once and reused.

### Verifying

- **Verify** on a claim, or **Verify these** with numbers such as `1-5, 8, 12-14`, or **Verify random unverified**, or **Verify all unverified**.
- The button shows *Verifying…* with a timer. Clicking another Verify button meanwhile shows *Already verifying. Please wait.* above that button.
- The result appears inside the claim's own card, and the page scrolls to it when a single claim finishes.
- A failed attempt shows its error inside the claim, with **Try again** and **Dismiss**. It clears itself after 45 seconds.

### When a source cannot be read

For each source the app tries, in order: the text already saved, a copy saved for the same web address, the original page, then the archived copy. If a source still cannot be read, a box lists it and offers:

- paste the text yourself,
- continue without it (only if at least one source was read),
- try reading again,
- save the claim as *source unavailable*,
- skip.

The AI is told which sources could not be read and must not guess what they say. The result shows a warning naming them.

### Ratings and who made them

| Tag on the claim | Meaning |
|---|---|
| Unverified | No rating saved |
| AI suggestion · needs review | An AI rated it; no human has reviewed it |
| Verified | A human rated it, or a human accepted the AI's rating |

The *Rated by* line says which. **Accept AI rating** marks the AI's rating as reviewed. **Rate it myself** opens an empty form so the human rating is the person's own. **Decide between them** appears when a human and an AI rating differ, and requires a written reason.

An accepted AI rating is **not** a human rating. Only ratings entered by a person are saved as `my_rating`, and the command-line scoring tools use only those.

### Summary and comparison tabs

- **Summary by rating** lists every rating, then *AI suggestion · needs review* and *Unverified*, with claim numbers and source links. It can copy a wikitext table or download a CSV.
- **Human vs AI** counts claims rated by both, how many agree, differ by one step, or disagree, and lists the disagreements. The app cannot tell which rating is correct; it shows where a person should look again.

## How a rating is decided

The AI is asked to split the claim into sub-claims. Each sub-claim gets a weight (`core` or `peripheral`), a match type (`explicit`, `paraphrase`, `inferred`, `absent`, `contradicted`), an exact quotation, and the number of the source it came from.

1. Every quotation must appear in the source the AI names. A quotation that does not is discarded and the sub-claim becomes `absent`.
2. The label is then computed by fixed rules, not chosen by the AI:

| Situation | Label |
|---|---|
| No core sub-claims, or none supported or inferred | not supported |
| Any core sub-claim contradicted | contradicted |
| All core supported; all side details supported | fully supported |
| All core supported; some side detail not supported | mostly supported |
| All core supported; a side detail contradicted | partially supported |
| All core at least inferred, and at least half supported | mostly supported |
| Anything else | partially supported |
| No source could be read | source unavailable |

The rules for the AI are in `rubric.json`, and the thresholds are in `aggregate()` in `src/verifier.js`.

## Data on disk

Everything is plain files.

- `gold/claim-NNN.json`: one file per claim. Important fields: `article_title`, `mw_rev_id`, `sentence`, `context`, `sources` (one entry per source with its web address, archive address and citation text), `my_rating`, `my_reasoning`, `my_evidence` (the human rating), `ai` (rating, reasoning, sub-claims, warnings, client, model, timings), `review` (`none`, `pending`, `accepted`), `decision` (what a human decided when ratings differed, with the reason), and `history` (every action, who did it, and when).
- `sources/claim-NNN.txt`: all of a claim's sources joined, each starting with `[Source N] address`.
- `sources/claim-NNN.sN.txt`: the text of one source.
- `sources/_shared/`: one copy of each source text by web address, so a source cited again is not downloaded again.

`sources/` holds copyrighted text and is never committed. Ratings are tied to one article revision; loading by title fetches the latest revision, and a revision id reopens an older one.

## Command-line tools

| Command | Purpose |
|---|---|
| `npm run serve` | Start the app |
| `npm run import -- --title "Article" --set name --limit 5` | Create claim files from an article without the interface |
| `npm run check` | Rate claims that have no human rating, using the configured AI |
| `npm run evaluate` | Compare the AI with the human ratings: exact and one-step agreement |
| `npm run prompts` | Write every prompt to a file, for the manual route |
| `npm run validate` | Check claim files for mistakes |
| `npm run new -- --set name` | Create one empty claim file |
| `npm run unused` | List files nothing uses |
| `npm test` | Run the tests |
| `npm run format` | Format the code with Prettier |

## Project layout

```
src/            core logic: extraction, source reading, verifier, AI clients, command-line tools
src/app/        the local server, the claim store, the verification pipeline
public/         the page, styles and browser scripts
test/           automated tests
scripts/        helper scripts
gold/           claim files (the data)
sources/        saved source texts (not committed)
rubric.json     the rules and labels given to the AI
```

## Testing

`npm test` runs the automated tests. They cover claim and footnote extraction, source reading and fallbacks, the verifier and its rating rules, the AI clients (with fake servers), and the local server's requests and responses. *(Describe in your own words how you checked the interface by hand.)*

## Known limitations

- Only paragraph text is read; sentences in tables, lists and infoboxes are not.
- Sentence splitting is rule-based and will make mistakes on unusual text.
- Some sites refuse automated downloads, need a login, or build the page with JavaScript. PDFs are not read. Those sources go through the paste box.
- The AI clients were written from each service's documented interface; check them with your own key and model.
- One person's ratings are not a reliable answer key by themselves. Disagreements should be settled by a second person.
- It is a single-user local tool: no accounts, no shared storage.

## Security and privacy

- Keep `.env` private. Anyone who can reach the app can spend your AI quota.
- The app downloads whatever web address a footnote contains. That is fine on your own computer. If it were ever hosted, it would need login, per-user storage, request limits, and protection against fetching internal network addresses.
- Source texts are copyrighted; do not publish `sources/`.

## Possible next steps

- Read PDFs and tables.
- Ask a second person to rate a sample and report how often two people agree.
- Integrate with the Wiki Education Dashboard's claim records.
- A Wikipedia user script that opens the rating dialog from the article page, hosted where the mentors advise.
- More languages of Wikipedia.

## AI disclosure *(write this in your own words)*

State plainly: which AI tools helped, with what (planning, code, tests, reviewing your written reasoning), what you wrote and decided yourself (your ratings, your reasoning, the rubric), and how you checked the code.

## What I learned *(write this in your own words)*

## Licence

MIT.
