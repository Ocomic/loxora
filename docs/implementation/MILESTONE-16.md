# Milestone 16: Xora with a local model

**Status:** Authorized (this document merged in pull request #54, November 2, 2026); delivery 1 (section 11) implemented (pull request #55); delivery 2 implemented.
**Decision Owner:** Ocomic
**Change class:** C2 (RFC-008): a new external runtime started by the app, a new assistant implementation, settings file version 2, new HTTP routes, a changed setup flow. Delivery 3 (cloud proof of concept) is C3 and is covered by the decision owner's acceptance of RFC-011 Amendment 3 section 3.
**Implements:** RFC-011 milestone 3 (Xora), [ADR-008](../adr/ADR-008-xora-model-runtime.md), and RFC-011 Amendment 3, on top of [Milestone 15](./MILESTONE-15.md)

## Authorization

- ADR-008 (Xora's model runtime) and RFC-011 Amendment 3 (Xora introduces her model, fixed choices without the model, switching the model, cloud proof of concept) were accepted by Ocomic on November 2, 2026, by merging pull request #53. Their acceptance authorizes this milestone document.
- The working model is Gemma 4 E2B (`unsloth/gemma-4-E2B-it-GGUF`, `Q4_K_M`), chosen by the decision owner on November 2, 2026 ([FINDINGS.md](../research/xora-model-evaluation/FINDINGS.md)). It is not the final C3 model decision; Loxora does not ship or download a model in this milestone.
- Merging this document authorizes the implementation described here and nothing beyond it. Out of scope stay: the installer, any download, storing API keys, cloud models as the default, Xora reading project content, and new rights for Xora.

## Goal

The decision owner starts `@loxora/app` on Windows with Gemma 4 E2B. Xora introduces herself and her model, the setup runs as in Milestone 14 with buttons and typed answers, and Xora answers free text with the model: the plan description in the setup and messages on the bridge. The person can keep the model, point Xora to another local model, or, in the proof of concept, switch to a cloud model after a consent card. Without a model, everything works in script mode as today.

## Authorized scope

### 1. Settings file version 2 (ADR-008 section 5)

- `packages/cli/src/settings.ts`: `SETTINGS_CONFIG_VERSION` becomes 2. The reader accepts versions 1 and 2; a version 1 file is read as version 2 without a `xora` model entry and written as version 2 on the next write. An unknown version stays "unusable", as today.
- The `xora` entry: `enabled` (boolean), `provider` (`local`, or in delivery 3 `openai` or `anthropic`), `local` (`mode: "managed"` with absolute `runtimePath` and `modelPath` ending in `.gguf`, or `mode: "attached"` with a loopback `url`; both with `modelLabel`, 1 to 60 characters), and `lastStart` (`at`, `result`: `ready`, `timeout`, `exited`, `lowMemory`, or `declined`, and `seconds`). The old `{ state: "not_installed" }` is read as "no model configured".
- Validation refuses any field that could hold a secret: there is no key field, and unknown fields are rejected as today.
- `CLI.md` notes the version change (the CLI still reads only `workspacePath`).

### 2. The runtime manager (ADR-008 sections 1, 3, and 4)

A module `packages/app/src/server/runtime.ts`:

- **Managed:** checks that both files exist, checks free memory against the threshold (section 9), picks a free port on `127.0.0.1`, and starts `runtimePath` with `-m <modelPath> --host 127.0.0.1 --port <port> --jinja -c 8192 --no-mmproj`. Output goes to a log file next to the settings file (`xora-runtime.log`, overwritten on each start), never to the browser.
- **Attached:** the URL must use `http` and a loopback host (`127.0.0.1`, `::1`, `localhost`); anything else is refused before any request. Redirects are not followed.
- **Readiness:** `GET /health` every 500 ms until 200, for at most 60 seconds. The states are `off`, `starting`, `ready`, and `scriptMode` with a reason (`notConfigured`, `lowMemory`, `timeout`, `exited`, `declined`, `failedBefore`).
- **No automatic retry:** if `lastStart.result` is not `ready`, the next start does not start the runtime and Xora asks once "Start Xora again" or "Continue without Xora" (section 5).
- **Stopping:** on exit (Ctrl+C, the window closes, `SIGTERM`), the manager ends the child's process tree (`taskkill /PID <pid> /T /F` on Windows, a signal elsewhere). It never stops a runtime it did not start.
- **Development flag:** `npm run app -- --xora-url http://127.0.0.1:8080` attaches to a running runtime for this session only, without writing the settings file. It is meant for the decision owner's existing `llama-server`.

### 3. The model adapter and `ModelAssistant` (ADR-008 sections 2 and 6)

- `packages/app/src/server/model.ts`: one adapter for `POST /v1/chat/completions` with `tools` (temperature 0.2, at most 300 output tokens, 30 seconds per answer). It returns at most one text and at most one action call; identical repeated calls count once, as in `run.mjs`.
- `packages/app/src/server/xora-prompt.ts`: the system prompt in German and English, taken from prompt version 3 of `run.mjs`, with a `XORA_PROMPT_VERSION` constant. It names the captain, the ship, and the situation, and lists the allowed actions. It never contains project content.
- `ModelAssistant implements Assistant` wraps `ScriptedAssistant`:
  - Fixed choices follow section 4. Everything else the scripted path can answer without the model (the first Mission, the goal text in script mode, Mission Control topics) stays scripted.
  - The model is asked for: the plan description (`describe`), the input bar of the setup when no step expects an answer, Xora's direct chat, and messages that mention `@Xora` on the bridge.
  - **Validation:** an action must be one of those allowed in the situation; `propose_project` needs a name of 1 to 4 words and a purpose of 1 to 300 characters, and its goal must be one of the goal templates (the spaces still come from the template). A reply is cut at 60 words. An invalid action is dropped. A reply without text gets the fixed sentence of the action card.
  - **Fallback:** on a timeout, an error, or a runtime that stopped, the turn is answered by `ScriptedAssistant`, the status becomes `scriptMode` with the reason, and the next turns stay scripted until the person restarts Xora.
- On the bridge Xora's model reply is stored as her chat message as today (ADR-007); the prompt, tool calls, and raw output are not stored. The model gets the last 10 messages of the open thread, nothing else.

### 4. The app records fixed choices (RFC-011 Amendment 3 section 2)

In `POST /api/assistant/message` for a setup answer:

1. `choice` → recorded as today; the model is not asked.
2. `text` → `interpret()` from `shared/conversation.ts` first.
3. Only when `interpret()` returns null and the model is `ready`: one model turn with a single tool `place_answer` whose `value` is an enum of this prompt's buttons plus `unclear`. The server checks the value against `PROMPTS[prompt].choices`. A valid button is answered like a tapped one; `unclear`, an invalid value, or a failure answers `reply: "notUnderstood"`, now with Xora's own question when the model wrote one (at most 60 words), otherwise the fixed text.
4. Prompts that accept any text (`name`, `shortName`, `reviewer`, `folder`, `purpose`, `rename`) never reach the model; `ship` with typed text and a typed path are stored as typed.
5. The sentence next to a recorded answer or a card stays a fixed label.

The response shape of the route does not change; it gains `by: "button" | "keywords" | "model"` so tests and the Windows check can see who placed the answer.

### 5. The setup: Xora introduces herself and her model (RFC-011 Amendment 3 section 1)

- **Start screen:** the Xora line shows the real state from section 2: "Xora is starting (Gemma 4 E2B)", "Xora is online (Gemma 4 E2B)", or "Xora is online in script mode" with the reason in one sentence. The setup does not wait for the model; it starts in script mode and switches when the model is ready.
- **First message:** the text of Amendment 3 section 1 in German and English, with the model label from the settings. Without a model, the script-mode variant says why (no model chosen yet, not enough free memory, the start failed, or Xora is still starting).
- **New prompt `xora`** after `name` (and after `shortName`), step `xora`, buttons `keep` (primary), `change`, `explain`; keywords per language (for example "lassen", "behalten", "passt" / "keep", "fine"; "wechseln", "anderes", "besser" / "change", "switch", "better"; "was", "erklär" / "what", "explain"). `explain` shows the explanation and asks again.
- **Progress bar:** six steps: Name, Xora, Ship, Logbook, Project, Bridge. `SETUP_STEPS` gains `xora`.
- **New prompt `model`** after `change`: buttons `localFile` ("A model file on this computer"), `attached` ("A model program that is already running"), `cloud` ("A cloud model", only when delivery 3 is configured; otherwise shown inactive with "comes in a later version"), and `later`. `localFile` asks for the `llama-server.exe` path and the `.gguf` path: on Windows through the file window of the operating system, opened by the server as the folder window of Milestone 14 is, elsewhere typed. `attached` asks for the address (default `http://127.0.0.1:8080`) and a name for the model. Each choice ends on a confirmation card (`changeModel`) that shows exactly what is written to the settings file.
- **Restart question:** when the last start failed, the first message asks "Start Xora again" or "Continue without Xora" (prompt `restart`) before the name.
- **Ship term "model"** is added to `TERMS` and introduced by the `xora` prompt.
- The answers of this step are settings only; nothing is written to the logbook.

### 6. Xora's details panel on the bridge

- Shows the model label, the provider ("on this computer" or the cloud provider), and the state from section 2.
- Buttons: "Change model" (the same choice as section 5, as cards in Xora's direct chat), "Restart Xora" (starts the runtime again, also after a failed start), and, while a cloud model is active, "Back to the local model".
- Asking Xora in her direct chat (for example "Kannst du ein besseres Modell nehmen?") offers the same choice: the keyword list recognizes it in script mode; with a model, a `propose_model_change` action opens it. Nothing changes before the card is confirmed.

### 7. Routes

| Route | Body | Result |
|---|---|---|
| `GET /api/xora` | | `{ state, reason?, provider, modelLabel, mode?, lastStart, cloudAvailable }` |
| `POST /api/xora/model` | `{ provider: "local", mode: "managed", runtimePath, modelPath, modelLabel }`, `{ provider: "local", mode: "attached", url, modelLabel }`, or in delivery 3 `{ provider: "openai" \| "anthropic" }` | the proposed `changeModel` action with its `id` and exactly what will be written; never writes. 400 for a non-loopback URL, a missing file, or a file that is not `.gguf`; 409 `CloudUnavailable` without the environment variables of section 8 |
| `POST /api/xora/pick` | `{ kind: "runtime" \| "model", title }` | opens the file window (Windows only; 409 `NoPicker` elsewhere, 409 `Picking` while one is open) and returns `{ path }` or `{ cancelled: true }` |
| `POST /api/xora/restart` | `{}` | restarts with the current settings; `{ state }` |
| `POST /api/assistant/confirm` | `{ actionId, confirm }` | gains the action kind `changeModel`: writes the `xora` entry of the settings file and restarts the runtime |

- The routes work in setup mode and ready mode. Writes need the captain (or, in setup mode, the person setting up), same-origin requests, and `127.0.0.1`, as all write routes.
- `GET /api/setup` gains `boot.xora` values `starting`, `ready`, and `scriptMode` with `reason`, and `xora` as in `GET /api/xora`.

### 8. Delivery 3: cloud proof of concept (RFC-011 Amendment 3 section 3)

- **Configuration only by environment** of the window that runs `npm run app`: `LOXORA_XORA_PROVIDER` (`openai` or `anthropic`), `LOXORA_XORA_API_KEY`, and `LOXORA_XORA_CLOUD_MODEL` (the provider's model id, chosen by the decision owner; Loxora names no default). Without all three, `cloudAvailable` is false.
- **Adapters:** `openai` uses the adapter of section 3 with `https://api.openai.com`. `anthropic` gets a small adapter for Anthropic's Messages API (`POST https://api.anthropic.com/v1/messages` with `tools`), because that is the provider's own interface for tool use; it maps text and the single tool call to the same `AssistantTurn`. Both refuse redirects and send the key only in the provider's header.
- **Consent card** (`changeModel` with `provider` set): names the provider and the model id, lists what leaves the computer (Xora's conversation in the setup and in her chats, the setup answers she uses, the ship and captain names), says that the provider may charge for it, and offers "Switch" and "Stay local".
- **While active:** the status line reads "Online · Cloud · Anthropic" (or "OpenAI"); the details panel shows "Back to the local model". The settings file stores `provider` only, never the key or the model id. If the app starts later without the environment variables, Xora goes back to the local model and says so once.
- **Not sent:** no project content, no logbook content beyond the ship and captain names, no file paths.
- **Evaluation:** `run.mjs` gains `--provider openai|anthropic` with `--allow-cloud`; without `--allow-cloud` it keeps refusing any non-local address. The key comes from `LOXORA_XORA_API_KEY`. Results go to `FINDINGS.md` like the local runs.
- **Harness experiment:** not built in this milestone. A follow-up in the research folder may try a coding tool (for example Claude Code or Codex) as a runner for the evaluation cases, after the decision owner has checked the provider's terms for using a personal subscription from another program.

### 9. Measuring on Windows

Before delivery 1 is merged, the decision owner measures on his PC, and the values go into this document:

- the peak memory of `llama-server.exe` with Gemma 4 E2B (Task Manager, "Details" tab, column "Memory (active private working set)") while it answers; the memory threshold is that value plus 1 GB;
- the cold start with Loxora starting the runtime (the app logs the seconds in `lastStart.seconds`).

Until then the threshold is 4 GB of free memory.

### 10. Tests and documentation

- **Fake runtime:** a test helper that serves `/health` (503, then 200) and `/v1/chat/completions` with scripted answers. Tests: managed start with a fake executable (a Node script), attached mode, refusal of non-loopback URLs and redirects, the 60-second timeout (with a short test timeout), process exit, low memory, no automatic retry, stopping the child on exit.
- **Unit tests:** settings version 1 → 2 and the refusals; the validation of model answers (unknown action, too long, invalid goal, several calls); the fixed-choice rule of section 4 with `by`; the new prompts' keywords; label parity.
- **Server tests:** the setup with the fake runtime places a typed answer by the model only when the keywords fail; a model failure falls back to script mode; `changeModel` writes only after confirmation; the bridge direct chat stores the model's reply and no prompt.
- **Playwright** keeps running in script mode. One added test runs the setup against the fake runtime (the model state on the start screen, the `xora` step, keep the model).
- **Delivery 3:** adapter tests against a local fake of each provider's route; no test calls a real provider.
- **Documentation:** `APP.md` (Xora's states, routes, flags, settings), `CLI.md` (settings version 2), RFC-011 (milestone 3 implemented), the RFC and ADR indexes, `open-questions.md`, and `AGENTS.md` (milestone list).

### 11. Delivery

Three pull requests:

1. Settings version 2, the runtime manager, the adapter, `ModelAssistant`, the fixed-choice rule, the start-screen states, the `--xora-url` flag, and their tests. With this delivery the decision owner can attach his running `llama-server` and use Xora in the setup and in her direct chat.
2. The setup changes (first message, `xora`, `model`, and `restart` prompts, six steps, the ship term), the file windows, Xora's details panel, the `changeModel` card, the routes, the Playwright test, and the documentation.
3. The cloud proof of concept and the `run.mjs` cloud option.

## Delivery 2: decisions and deviations

- **Project name (decided by the decision owner on November 2, 2026, during the Windows check of delivery 1):** the captain names the project. After the plan description (or a tapped goal template) Xora asks "What should the project be called?" with her suggestion as a button. With a model the suggestion fits the description; if the model skipped the proposal action, the app asks it once more for the name alone (`namePrompt`, no tools, checked like the action's name). Without a model the suggestion is the template's name. "Change name" on the card stays.
- **Model change on the bridge:** "Change model" in Xora's details panel opens the same choice as a small form that ends on the same card, instead of cards in her direct chat (section 6). Cards in the chat would need a new kind of chat message (ADR-007); the form keeps the chat store unchanged.
- **Asking Xora for another model:** the keyword list decides, with or without a model, and Xora answers with a fixed text that points to the panel. No `propose_model_change` action is given to the model, which keeps the fixed-choice rule of section 4.
- **"Continue without Xora"** writes nothing: the restart question comes again on the next app start. `xora.enabled: false` is still read ("declined") and is cleared by "Restart Xora".
- **Back to the previous model:** if a confirmed model does not get ready, the runtime writes the previous `xora` entry back and starts it again; `GET /api/xora` reports `failedChange` until the next change or restart.
- **Bridge facts:** with a model, Xora's chat prompt says where her model is changed and, while the first Mission is offered, that it waits at the top of her direct chat.
- **From the Windows check A (November 2, 2026):**
  - A plan typed at the project question ("Ein mobile Webgame online RPG mit Soulslike Elementen erstellen.") was placed as "New project", and Xora then asked for the description again. Now a typed answer placed as "new" that has at least three words beyond "new project" words (`carriesDescription`) is taken as the description right away.
  - "Was soll ich jetzt tun?" on the bridge got a general answer from Gemma 4 E2B, which ignored the first-Mission fact in its prompt. While the first Mission is offered, a "what now" question (`asksWhatNow`, keyword list) now gets a fixed reply that points to it, with or without a model, like the model-change question. Other questions still go to the model.
- **Check A with the real model, automated (asked for by the decision owner):** `npm run test:xora:live` runs Check A in the browser against the model that already runs (default `http://127.0.0.1:8080`, or `LOXORA_LIVE_XORA_URL`), with a temporary LOXORA_HOME. It checks what the app decides hard and only records what the model says, and writes screenshots plus `bericht.md` to `output/xora-live/<time>/` (ignored by git). It lives in `packages/app/e2e-live/` with its own Playwright config, so `npm run test:app:e2e` and CI never run it; the fake runtime stays the only model in automatic tests.

## Choices made in this document

These follow from ADR-008 and Amendment 3 but were not decided there. The decision owner can change any of them before merging:

- The model choice in the setup comes **right after the name** (Amendment 3 open question 13).
- **60 seconds** before script mode; **4 GB** free memory until measured.
- The prompt is **prompt version 3** of the evaluation, moved into the app.
- On the bridge Xora sees **the last 10 messages** of the open thread.
- The fake runtime is the only model in automatic tests.
- The development flag is **`--xora-url`** only; a managed runtime is chosen in the setup or the details panel.
- For Anthropic, its **own Messages API**, not a compatible route.

## Explicit non-scope

- The installer, bundling `llama-server` or a model, and any download (RFC-011 milestone 5, C3).
- A model recommendation from a hardware check.
- Storing an API key, a cloud model as the default, paid features.
- Xora reading project content or the logbook beyond the ship and captain names.
- New actions for Xora beyond `place_answer`, `propose_project`, and `propose_model_change`; the first Mission and the goal stay scripted.
- Group chats, voice, and Xora changing the UI.

## Acceptance checks

| Check | Evidence |
|---|---|
| Without a model, setup and bridge behave exactly as in Milestone 15 | existing tests, Playwright |
| A tapped button never reaches the model; a typed answer reaches it only when the keywords fail | server tests (`by`) |
| Name, ship name, and paths are stored as typed | server tests |
| A non-loopback runtime URL and redirects are refused | unit tests |
| The runtime is not restarted automatically after a failure | unit tests |
| Loxora stops the runtime it started, and no other | unit tests with a fake executable |
| The settings file never holds a key; version 1 files still load | unit tests |
| Model answers are validated; invalid actions are dropped | unit tests |
| A model change is written only after the card is confirmed | server tests |
| No prompt or raw model output is stored | server tests |
| The cloud choice appears only with all three environment variables; the consent card names what leaves the machine | server tests (delivery 3) |
| Windows check with Gemma 4 E2B: setup in both languages, the `xora` step, a typed unclear answer, the plan description, Xora's direct chat, stopping the app | recorded in the pull request |

## Windows check (for the decision owner)

After delivery 1 and again after delivery 2. Every step, in order:

**Window 1 (PowerShell) — the model**

1. Open PowerShell and go to the llama.cpp folder: `cd F:\Programme\llama.cpp`
2. If a `llama-server` from an earlier test still runs in another window, stop it there with Ctrl+C and wait until the prompt returns.
3. Start Gemma 4 E2B: `.\llama-server.exe -hf unsloth/gemma-4-E2B-it-GGUF:Q4_K_M --jinja --host 127.0.0.1 --port 8080 -c 8192 --no-mmproj`
4. Wait until the window shows `server is listening on http://127.0.0.1:8080`. Leave this window open.

**Window 2 (PowerShell) — Loxora**

5. Open a second PowerShell window and go to the repository: `cd F:\Programme\Git\loxora`
6. If `npm run app` still runs from earlier, stop it with Ctrl+C.
7. Get the merged code: `git checkout main`, then `git pull`.
8. Install and build: `npm ci`, then `npm run build`.
9. For a fresh setup, move the settings aside: `Rename-Item "$env:APPDATA\Loxora\settings.json" settings-alt.json` (skip this if the file does not exist).
10. Start the app attached to the model: `npm run app -- --xora-url http://127.0.0.1:8080`
11. Open `http://127.0.0.1:4180` in the browser.

**Check**

12. The start screen shows Xora online with the model; the first message names Gemma 4 E2B.
13. Go through the setup in German: tap answers, type one unclear answer (for example "hmm, keine Ahnung"), describe a plan in one or two sentences, and create the project.
14. On the bridge, write to Xora in her direct chat.
15. Switch to English with the DE/EN switch and repeat steps 12 to 14 after restoring a fresh setup (stop the app with Ctrl+C in window 2, repeat step 9, then step 10).
16. Stop the app with Ctrl+C in window 2, then stop `llama-server` with Ctrl+C in window 1.

After delivery 2, also check the managed mode: stop `llama-server` in window 1 first, start the app in window 2 without `--xora-url` (`npm run app`), choose "Choose a different model" → "A model file on this computer", pick `F:\Programme\llama.cpp\llama-server.exe` and the Gemma `.gguf` file (where `-hf` stored it; the path is shown in window 1's log when it loads), confirm the card, and wait until Xora is online. Measure the memory as in section 9 while Xora answers. When you stop the app with Ctrl+C, the Task Manager must no longer list `llama-server.exe`.

## Knowledge, navigation, and documentation effects

- New: this document. RFC-011 and ADR-008 link it.
- On implementation: `APP.md`, `CLI.md`, RFC-011, the indexes, `open-questions.md`, `AGENTS.md`, and `FINDINGS.md` for cloud runs.
