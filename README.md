# Claim Verifier

Claim Verifier is a local web app that checks whether the sources cited in a Wikipedia article really support the sentences they are attached to. It finds every cited sentence in an article, reads the cited sources, asks an AI to judge each claim against them, and lets a person review, correct or replace the AI's rating. The app always keeps human ratings and AI ratings separate, so the human ratings can be used as a trustworthy answer key.

It is a prototype built in connection with the Wikimedia and Wiki Education work on claim-source verification, which rests on Wikipedia's principle of verifiability: a reader should be able to open the cited source and confirm what the article says.

## Contents

- [What the app can do](#what-the-app-can-do)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Choosing an AI](#choosing-an-ai)
- [Using the app step by step](#using-the-app-step-by-step)
- [How ratings work](#how-ratings-work)
- [Human ratings and AI ratings](#human-ratings-and-ai-ratings)
- [Data on disk](#data-on-disk)
- [Command-line tools](#command-line-tools)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Known limitations](#known-limitations)
- [Security and privacy](#security-and-privacy)
- [Design decisions and lessons](#design-decisions-and-lessons)
- [Possible next steps](#possible-next-steps)
- [AI disclosure](#ai-disclosure)
- [Licence](#licence)

## What the app can do

### Open any Wikipedia article

- Type an article title. As you type, the app suggests matching titles. If the exact title does not exist, it opens the closest search match and tells you so.
- Or enter an exact revision number to reopen an older version of an article.
- Every article page shows links that open the revision you are working on, and the latest version, in a new tab.
- The app shows how many claims the article has, how many are verified, how many AI suggestions still need a human review, and how many are unverified.

### Find and number the claims

- A claim is a sentence that carries at least one footnote and is at least 25 characters long.
- Claims are numbered by the app, in reading order, starting at 1. The number has nothing to do with the footnote numbers in the article, so a claim ending in footnote [9] might be claim 7.
- A quotation is never cut in half. A sentence such as: He said, "It is fine. It really is." stays one claim.
- If a sentence has no full stop before its footnote and a capital letter follows, the app starts a new claim there. For example, "...on SiriusXM[8] The show was celebrated..." becomes two claims.

### Handle claims with several sources

- Every distinct footnote in a sentence is one source of that claim. A sentence ending in [4][5] is one claim with two sources.
- Each source is shown with its footnote as written in the article ("Source 2, footnote [5]"), a link to the page, a link to the archived copy when the citation has one, and a link to the footnote in the article. All links open in a new tab.
- The AI sees all of a claim's sources together and judges whether they support the claim as a whole. A claim can be supported by one source or by several together.
- When the same footnote is cited by several claims, its text is read once and reused.

### Read the sources

For each source the app tries, in this order:

1. text it has already saved for this claim,
2. a copy saved for the same web address when another claim used it,
3. the original web page,
4. the archived copy of the page, if the citation lists one.

If a source still cannot be read, a box shows the exact reason for each unreadable source and lets you:

- paste the source text yourself,
- continue without the unreadable sources (offered only when at least one source was read),
- ask the app to try reading them again,
- save the claim as "source unavailable",
- or skip the claim.

Text you paste is reused by any later claim that cites the same source. Pages that give almost no readable text (usually paywalls, login pages or pages built with JavaScript) and PDFs count as unreadable and go through the same box. The AI is told which sources could not be read and is not allowed to guess what they say.

### Ask an AI to verify claims

- Verify one claim with its own Verify button.
- Verify several at once by typing claim numbers such as 1-5, 8, 12-14.
- Verify a number of random unverified claims, or all unverified claims. Batches of more than 10 claims ask for confirmation first.
- The button changes to "Verifying..." with a running timer. Claims waiting in a batch show "Queued". If you click a Verify button while something is already running, a short message appears directly above that button.
- You can use Google Gemini, Anthropic Claude, a model running on your own computer through Ollama, or no connected AI at all (the app shows the prompt and you paste the reply from any chat).
- When a hosted AI service is busy, the app waits and tries again after 3, 8 and 20 seconds before showing an error.

### See the result where the claim is

- The rating, the evidence quotations, the AI's reasoning and any warnings appear inside the claim's own card, not at the top of the page. When a single claim finishes, the page scrolls to its result.
- Evidence quotations say which source they came from. Warnings say, for example, that Source 2 could not be read and the rating uses only the other sources.
- Each result shows how long the sources and the AI took, so you can see what is slow.
- If an attempt fails, the error appears inside that claim with Try again and Dismiss buttons. It clears itself after 45 seconds and as soon as the claim is verified.

### Review as a human

- Accept AI rating: you agree with the AI's suggestion.
- Rate it myself: opens an empty form (rating, reasoning, evidence quotations) so your rating is your own. A button can copy the AI's answer into the form if you want to start from it.
- Decide between them: when a human rating and an AI rating differ, you choose to keep the human rating, use the AI's rating, or choose a different one. You must write a reason, which is saved with the claim.
- Details: shows the paragraph with the claim highlighted, the sources, both ratings side by side, the decision and the full history of who did what and when.

Each claim carries one of three tags:

| Tag | Meaning |
|---|---|
| Unverified | No rating has been saved. |
| AI suggestion - needs review | An AI rated it and no human has reviewed it yet. |
| Verified | A person rated it, or a person accepted the AI's rating. |

Verified means a person has reviewed a rating. It does not mean the claim is true. A line under the sentence says who rated it ("human", or "AI rating, accepted by a human"), and verified claims show their rating as a coloured badge.

### Summarise and compare

- The Summary by rating tab lists every rating (fully supported, mostly supported, partially supported, not supported, contradicted, source unavailable), then AI suggestions that need review, then unverified claims. Each row lists the claim numbers with their source links and who rated them.
- Copy for Wikipedia produces a ready-to-paste wikitext table. Download CSV saves the same information as a spreadsheet.
- The Human vs AI tab counts the claims rated by both a person and an AI, and how many agree, differ by one step, or disagree. It lists every difference with its recorded decision. The app cannot tell which rating is correct because it has no answer key. It shows where a person should read the source again, and for important claims a second person should decide.

### Keep everything on your own computer

Ratings, source texts and history are saved as plain files on your computer. Reloading the page and loading the same article shows your saved work. Ratings belong to one article revision, so they stay attached to the exact text you reviewed even if the article changes later.

## Getting started

Requirements: Node.js 22.9 or newer. The app has no runtime dependencies; installing packages only adds the code formatter.

Open a terminal in the project folder and run:

    npm install
    Copy-Item .env.example .env
    npm test
    npm run serve

On macOS or Linux use cp .env.example .env instead of Copy-Item. Then open http://localhost:3000 in your browser. Stop the app with Ctrl+C. If you change the code, stop the app and start it again, then refresh the page with Ctrl+F5.

## Configuration

Settings live in a file named .env in the project folder. It is listed in .gitignore and must never be committed or shared, because it can hold your AI keys. The file .env.example is a blank template.

| Setting | Meaning |
|---|---|
| AI_CLIENT | manual, gemini, anthropic or ollama. The default is manual. |
| AI_MODEL | The model name for that service. Not used by manual. |
| GEMINI_API_KEY | Needed when AI_CLIENT is gemini. |
| ANTHROPIC_API_KEY | Needed when AI_CLIENT is anthropic. |
| WIKI_USER_AGENT | A short name and contact address that identifies your copy of the program to Wikipedia, as Wikipedia asks of programs. For example: claim-verifier/0.1 (you@example.com) |
| PORT | Optional. The default is 3000. |

## Choosing an AI

| Choice | What you need | Notes |
|---|---|---|
| manual | Nothing | The page shows the prompt for each claim. You paste it into any AI chat and paste the reply back. Free, but slower. |
| gemini | A key from Google AI Studio and a model name from there | Check the provider's current free-tier limits and terms. |
| anthropic | A Claude API key and a model name | Paid use. Check the provider's current pricing. |
| ollama | Ollama installed, a model downloaded, and Ollama running | Runs on your own computer. Quality depends on the model, and small models make more mistakes. |

Example .env for Gemini:

    AI_CLIENT=gemini
    AI_MODEL=your-model-name
    GEMINI_API_KEY=your-key
    WIKI_USER_AGENT="claim-verifier/0.1 (you@example.com)"

The Gemini connection has been used against the real service. The Claude and Ollama connections have only been tested with simulated servers, so try them with your own key or model before relying on them.

## Using the app step by step

1. Start the app and open http://localhost:3000. The top of the page shows which AI is connected.
2. Type an article title and press Load article. Check the revision number in the heading.
3. Read the list of claims. Each shows its sentence, its sources and its tag.
4. Press Verify on a claim, or type a range such as 1-5, 8 and press Verify these.
5. If a source cannot be read, use the box that appears (paste text, continue without it, try again, or save as source unavailable).
6. Read the result inside the claim. Open the evidence and reasoning, and open the source links to check them yourself.
7. Accept the AI's rating, rate the claim yourself, or decide between a human and an AI rating, with a reason.
8. Use the Summary by rating tab to see all claims grouped by rating, and copy the wikitext table or download the CSV.
9. Use the Human vs AI tab to see where people and AI disagree.

## How ratings work

### What each rating means

| Rating | Meaning |
|---|---|
| Fully supported | The sources explicitly state everything the claim says. |
| Mostly supported | The sources state the core of the claim, with minor differences in wording or scope. |
| Partially supported | The sources support only part of the claim. |
| Not supported | The relevant content is not in the sources. |
| Contradicted | The sources say something different. |
| Source unavailable | The needed text could not be read. |

The rules given to the AI are in rubric.json. They tell it to read the paragraph and the sources, to state what the claim is meant to say, to split the claim into sub-claims, to count a paraphrase as support, to judge only what the sources say and not whether the claim is true in general, to quote exactly, and never to guess when a source could not be read.

### How the AI's answer becomes a rating

The AI does not choose the final label. It splits the claim into sub-claims. Each sub-claim has a weight (core or peripheral), a match type (explicit, paraphrase, inferred, absent or contradicted), an exact quotation and the number of the source it came from. The app then:

1. Checks that every quotation really appears in the source the AI named. A quotation that does not is thrown out, the sub-claim becomes absent, and a warning is recorded. This catches invented quotations without requiring the claim's wording to match the source word for word.
2. Computes the label with fixed rules:

| Situation | Label |
|---|---|
| No core sub-claims, or none supported or inferred | Not supported |
| Any core sub-claim contradicted | Contradicted |
| All core supported and all side details supported | Fully supported |
| All core supported, some side detail not supported | Mostly supported |
| All core supported, a side detail contradicted | Partially supported |
| All core at least inferred, and at least half supported | Mostly supported |
| Anything else | Partially supported |
| No source could be read | Source unavailable |

If an AI reply is not valid JSON, the app asks once more (for connected AI services) before reporting an error. The thresholds are in the aggregate function in src/verifier.js.

## Human ratings and AI ratings

The two kinds of rating are stored in different fields and are never mixed.

- A rating entered by a person (with Rate it myself or a decision) is saved as the human rating.
- A rating produced by an AI is saved as the AI rating. Accepting it records that a person reviewed it; it does not turn it into a human rating.
- The command-line scoring tool compares the AI with human ratings only.
- If you want an answer key, use the human ratings. If a human and an AI rating differ, the written decision explains which one was kept and why.

One person's ratings are not a reliable answer key on their own. Where it matters, a second person should rate a sample and the two should be compared.

## Data on disk

Everything is plain files.

- gold/claim-NNN.json: one file per claim, numbered automatically and never reused. Main fields: article_title, mw_rev_id (the revision), sentence, context (the paragraph), sources (one entry per source with its address, archive address and citation text), my_rating, my_reasoning and my_evidence (the human rating), ai (rating, reasoning, sub-claims, warnings, client, model and timings), review (none, pending or accepted), decision (what a human decided when ratings differed, with the reason), and history (every action, who did it and when).
- sources/claim-NNN.txt: all of a claim's sources joined, each starting with its source number and address.
- sources/claim-NNN.sN.txt: the text of one source.
- sources/_shared/: one copy of each source text by web address, so a source cited again is not downloaded again.

The sources folder holds copyrighted text and is never committed. Claims are matched to saved files by article, revision and sentence, so a sentence repeated word for word in one article shares one record.

## Command-line tools

The app uses the same code as these tools. They work on the same files.

| Command | What it does |
|---|---|
| npm run serve | Starts the app. |
| npm run import -- --title "Article" --set name --limit 5 | Creates claim files from an article without the interface. Other options: --oldid, --random, --pick random --seed 7, --max-refs 2, --no-fetch. |
| npm run check | Rates claims that have no human rating, using the configured AI, and prints each label and reasoning. |
| npm run evaluate | Compares the AI with the human ratings: exact and one-step agreement, with the AI's reasoning where it disagrees. |
| npm run prompts | Writes every prompt to a file, for the manual route. |
| npm run validate | Checks claim files for mistakes. |
| npm run new -- --set name | Creates one empty claim file. |
| npm run unused | Lists files that nothing uses. |
| npm test | Runs the automated tests. |
| npm run format | Formats the code with Prettier. |

## Project layout

    src/            core logic: article reading, claim extraction, source reading,
                    the verifier, AI connections and the command-line tools
    src/app/        the local server, the claim store and the verification pipeline
    public/         the page, its styles and the browser scripts
    test/           automated tests
    scripts/        helper scripts
    gold/           claim files (the data)
    sources/        saved source texts (not committed)
    rubric.json     the rules and rating labels given to the AI

## Testing

npm test runs the automated tests in the test folder. They cover claim and footnote extraction, sentence splitting, source reading and the archived-copy fallback, reuse of shared sources, the verifier and its rating rules, quotation checking, the AI connections (using simulated servers, including retries when a service is busy), the saved data, and the local server's requests and responses.

The interface itself is not covered by the automated tests in this repository. It is checked by hand, by loading real articles and using each feature.

## Known limitations

- Only paragraph text is read. Sentences in tables, lists and infoboxes are not found.
- Sentence splitting follows rules and will make mistakes on unusual text.
- Some sites refuse automated downloads, need a login, or build their pages with JavaScript, and PDFs are not read. A page that opens in your browser can still be unreadable to the program. Those sources go through the paste box.
- The AI's judgement can be wrong. The quotation check prevents invented evidence, but not a wrong reading of real evidence.
- Different AI models give different answers, and the same model can change its answer between runs.
- It is a single-user local tool with no accounts and no shared storage.
- Ratings from one person are not a reliable answer key by themselves.

## Security and privacy

- Keep .env private. Anyone who can reach the app can spend your AI quota.
- The app listens on 127.0.0.1 only and refuses requests addressed to any other host name. It has no login, so do not expose it on a network.
- The app downloads whatever web address a footnote contains. That is acceptable on your own computer. If it were ever hosted for others, it would first need a login, separate storage for each user, request limits, and protection against fetching addresses inside the host's own network.
- Source texts are copyrighted. Do not publish the sources folder.
- When you use a hosted AI service, the claim, its paragraph and the source texts are sent to that service. Check its terms first.

## Design decisions and lessons

- The AI chooses evidence, not the label. Computing the label with fixed rules makes ratings consistent and easy to inspect.
- Every quotation is checked against the source. An AI that invents a quotation is caught automatically.
- Human and AI ratings are stored apart, with a history of who did what, so human data can be separated from AI output.
- The app cannot decide which of two disagreeing ratings is right. Using another AI as judge would be circular, so a person writes a reason instead.
- A link that opens in a browser may not open for a program. The app therefore keeps one copy of each source, tries the archived copy, shows the exact reason a source failed, and always allows pasting the text.
- Counting claims and sources by the app's own rules, not by footnote numbers, keeps claims distinct even when a footnote is reused.
- Errors belong next to the thing that failed, and should clear themselves, so people do not have to scroll to find them.

## Possible next steps

- Read PDFs and the contents of tables and lists.
- Ask a second person to rate a sample and report how often two people agree.
- Connect the data to the Wiki Education Dashboard's claim records.
- A Wikipedia user script that opens the rating dialog from the article page. This would need a hosted back end with login and request limits, and should follow the maintainers' advice.
- Support other language editions of Wikipedia.

## AI disclosure

This project was built with substantial help from an AI assistant, Claude by Anthropic. I ran the code on my own computer, tried it on real Wikipedia articles, reported the bugs I found, and decided what the tool should do and how it should behave.

Inside the app, ratings made by a person are saved as human ratings, and ratings produced by an AI are saved separately as AI ratings. An accepted AI rating is never counted as a human rating. Any written evaluations of individual claims are covered by their own disclosure.

## Licence

MIT.
