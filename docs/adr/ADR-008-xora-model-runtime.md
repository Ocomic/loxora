# ADR-008 — Xora's Model Runtime

**Status:** Proposed
**Date:** November 2, 2026
**Decision Owner:** Ocomic
**Change class:** C2 (a new external runtime started by the app, a new assistant implementation, a new settings file version; see RFC-008). The parts that send data off the machine are C3 and are decided in RFC-011 Amendment 3, not here.

## Context

RFC-011 section 5 puts Xora behind a narrow `Assistant` interface in the app server. Today only `ScriptedAssistant` exists (Milestones 13 to 15). RFC-011 milestone 3 ("Xora") adds a local model and needs an ADR for the bundled runtime first (RFC-011 open question 2).

What is known since the model evaluation (RFC-011 section 10, stage 3, [`FINDINGS.md`](../research/xora-model-evaluation/FINDINGS.md)):

- The decision owner ran all candidates on Windows with llama.cpp's `llama-server` (graphics card build), on `127.0.0.1`, through its OpenAI-compatible chat route with tool calls (`--jinja`).
- On November 2, 2026, the decision owner chose **Gemma 4 E2B** (`unsloth/gemma-4-E2B-it-GGUF`, `Q4_K_M`) as Xora's working candidate. It is not yet the final C3 model decision; the license check stays deferred until there are real users.
- Answers take about a quarter of a second once the model is loaded. The cold start (from launching the server until it answers) was 17.5 seconds for Gemma 4 E2B and about 15 to 18 seconds for the Qwen models.
- Small models are weak at choosing actions for fixed choices, and better at free sentences. The app should record fixed choices itself (RFC-011 Amendment 3, section 2).
- The decision owner wants the person to be able to switch Xora to a larger local model or to a cloud model (RFC-011 Amendment 3). The runtime decision must not block that.

Constraints from AGENTS.md and RFC-011: local-first, nothing leaves the machine by default, models stay replaceable, no new services without a demonstrated need, the settings file holds no secrets, and the whole flow keeps working without a model (script mode).

## Decision

### 1. llama.cpp `llama-server` is the bundled local runtime

- Loxora runs the local model in llama.cpp's `llama-server`, a separate process, not inside the Node.js process.
- llama.cpp is MIT-licensed, so bundling its Windows binaries in an Apache-2.0 installer is possible; the installer adds its license text to `NOTICE` (installer milestone).
- The runtime is the same one the evaluation used, so the measured times and answers carry over.
- Which llama.cpp build is bundled (CPU, Vulkan, or both, chosen by the hardware check) is decided with the installer (RFC-011 milestone 5). Until then the person points Loxora to a `llama-server.exe` they downloaded.

### 2. One protocol: OpenAI-compatible chat completions

- The app server talks to every model through one adapter for the OpenAI-compatible route `POST /v1/chat/completions` with `tools`, the same request shape that `run.mjs` uses today.
- `llama-server`, most other local runtimes (for example Ollama or LM Studio), and several cloud providers offer this route. A provider that does not offer it gets its own small adapter behind the same `Assistant` interface (section 6).
- The adapter sends only what the turn needs: the system prompt, the conversation of the open chat or setup step, and the actions allowed in that situation. It sets a timeout per answer and never follows a redirect.

### 3. Two local modes: managed and attached

| Mode | Who starts the runtime | For whom |
|---|---|---|
| `managed` (default) | The app server starts `llama-server` as a child process and stops it when the app stops. | Everyone; the installer sets it up later. |
| `attached` | The person starts a runtime themselves (llama.cpp, Ollama, LM Studio, ...); Loxora only connects to its address. | The decision owner during development, and people who already run a local model. |

Rules for both modes:

- The address must be on this computer (`127.0.0.1`, `::1`, or `localhost`). Any other address is refused, as `run.mjs` already does. A cloud model is not an "attached" runtime; it is a separate provider (section 6) under RFC-011 Amendment 3.
- In `managed` mode the app server picks a free port on `127.0.0.1`, starts `llama-server` with the model file from the settings (`-m <file>`, `--host 127.0.0.1`, `--port <port>`, `--jinja`, `-c 8192`, `--no-mmproj`), and never passes `-hf`: Loxora never downloads a model by itself (RFC-011 section 11).
- Loxora does not stop or change a runtime it did not start.

### 4. Start, readiness, and failure

- The app server starts the runtime in the background when it starts, so the setup's fixed questions run while the model loads (RFC-011 part B). The start screen shows the real state of Xora: starting, ready, or not available, with the reason.
- Readiness is checked on the runtime's health route (`GET /health`, which `llama-server` answers with 503 while it loads and 200 when ready), every 500 milliseconds.
- **Wait before script mode** (RFC-011 open question 5): 60 seconds, about three times the measured cold start. Until then Xora's picture stays dimmed and the setup continues in script mode; when the model becomes ready, Xora takes over from the next answer. After 60 seconds, or if the process exits, Xora stays in script mode for this session.
- **Memory check before loading:** the app server reads the free memory (`os.freemem()`). If it is below the threshold for the configured model, it does not start the runtime and says so. The threshold for Gemma 4 E2B is measured in the Xora milestone on the decision owner's PC (peak memory of `llama-server` plus a margin) and written into the milestone document.
- **No automatic retry** (RFC-011 section 2): after a failed start, the next start asks once: "Start Xora again" or "Continue without Xora". The result is stored as `xora.lastStart` in the settings file.
- **Stopping:** in `managed` mode the app server stops the child process when it exits (Ctrl+C in the window, or closing the window). On Windows it ends the whole process tree. If a stale runtime from a crashed session still holds the port, the next start picks another free port; it never kills a process it did not start in this session.
- **During a session:** if the runtime stops answering (timeout or process exit), the current answer falls back to script mode with a fixed sentence, and the status line changes to "Online · script mode". The app does not restart the runtime by itself; the person can restart Xora from her details panel.

### 5. Settings

The app settings file (RFC-011 section 3) gets a richer `xora` entry. Because the current validation rejects unknown values, this is **settings `configVersion` 2**. Version 2 reads version 1 files and upgrades them on the next write; an older app that finds version 2 reports the file as unusable and does not change it (Milestone 13 behavior).

```json
{
  "configVersion": 2,
  "xora": {
    "enabled": true,
    "provider": "local",
    "local": {
      "mode": "managed",
      "runtimePath": "F:\\Programme\\llama.cpp\\llama-server.exe",
      "modelPath": "F:\\Programme\\llama.cpp\\models\\gemma-4-E2B-it-Q4_K_M.gguf",
      "modelLabel": "Gemma 4 E2B"
    },
    "lastStart": { "at": "2026-11-02T10:00:00Z", "result": "ready", "seconds": 17.5 }
  }
}
```

- `provider` is `local` or one of the cloud providers that RFC-011 Amendment 3 allows. `enabled: false` means "Continue without Xora".
- For `attached` mode, `local` holds `url` (loopback only) and `modelLabel` instead of the two paths.
- **No secrets in the settings file** (RFC-011 section 3 stays). A cloud API key is never written there; see section 6.
- Paths must be absolute; the model file must exist and end in `.gguf`.

### 6. Assistant implementations

The `Assistant` interface of Milestone 13 stays the only thing the flow depends on.

| Implementation | Uses | When |
|---|---|---|
| `ScriptedAssistant` | fixed texts and the keyword list | no model, the model is still loading or failed, tests |
| `ModelAssistant` | the adapter of section 2 with a local runtime | Xora with a local model (managed or attached) |
| `ModelAssistant` with a cloud provider | the same adapter, or a provider adapter, with a cloud address | only as RFC-011 Amendment 3 allows |

- `ModelAssistant` wraps `ScriptedAssistant`: everything the app can decide itself (fixed choices, see RFC-011 Amendment 3 section 2) is decided by the scripted path first; only free text reaches the model. If the model fails, the scripted answer is used.
- A model answer is validated before it reaches the person: an action must be one allowed in the situation, its fields must pass the same checks as a typed answer, and its text is cut at the length limit. An invalid action is dropped, and the app shows Xora's text or the fixed "not understood" reply.
- **Cloud API keys** are read from the environment variable `LOXORA_XORA_API_KEY` of the window that starts the app, for the proof of concept only. Storing a key permanently (for example in the Windows Credential Manager) needs its own decision before cloud models leave the proof of concept.
- No prompts, tool calls, or raw model output are stored. Xora's shown reply is stored as a chat message as today (ADR-007).

### 7. Changing the model

- The person changes Xora's model in the setup (RFC-011 Amendment 3) or later in Xora's details panel on the bridge, or by asking Xora, who opens that panel. Every change is shown on a confirmation card and written to the settings file only after confirmation.
- A change restarts the managed runtime with the new model file. While it loads, Xora is in script mode, as at the start.
- The model label shown to the person comes from the settings (`modelLabel`), not from the model's own answer, so a model cannot claim to be something else.

### 8. Evaluation stays the gate for a recommended model

- A model is offered as "recommended" only after it ran the evaluation set in `docs/research/xora-model-evaluation/` on the target hardware and its results are recorded in `FINDINGS.md`.
- Any other local model the person chooses is allowed, with the hint that it has not been tested with Loxora.

## Alternatives

### Run the model inside the Node.js process (for example `node-llama-cpp`)

Rejected for now. A crash or out-of-memory error in the model would take down the app server with the logbook writes. Native bindings also tie Loxora to Node.js versions and need a build per platform. A separate process can be stopped, restarted, and replaced independently.

### Ollama as the bundled runtime

Rejected as the bundled runtime, supported through `attached` mode. Ollama installs a background service of its own and keeps its own model store, which is more than Loxora needs and harder to explain and remove. People who already use it can attach it.

### LM Studio

Rejected as the bundled runtime: its desktop app is not open source and cannot be bundled. Supported through `attached` mode.

### ONNX Runtime GenAI or Windows ML

Not chosen now. Fewer of the small open-weights models are available in that format, and the evaluation ran on llama.cpp. It can become another adapter later.

### The model in the browser (WebGPU)

Rejected. It would load the model per browser tab, depend on the browser's graphics support, and make the model's memory use hard to check before loading.

### Download the model on first start (`-hf`)

Rejected. RFC-011 section 11 allows no download after installation without the decision owner's decision, and the installer ships the model.

## Consequences

- One more process on the person's computer, started and stopped by Loxora, listening only on `127.0.0.1`.
- The settings file moves to version 2; older app versions cannot read a version 2 file.
- Script mode stays complete and remains the test stub; end-to-end tests never need a model. A small fake runtime (a local HTTP server that answers like `llama-server`) tests the adapter, the readiness check, and the fallbacks.
- During development the decision owner can keep his own `llama-server` in `F:\Programme\llama.cpp` running and attach to it, or let Loxora start it.

## Implementation (after acceptance)

Implemented by the Xora milestone document (RFC-011 milestone 3), which follows after this ADR and RFC-011 Amendment 3 are accepted. It covers: the adapter, the runtime manager (managed and attached), settings version 2, `ModelAssistant`, the setup changes of Amendment 3, Xora's details panel, tests with a fake runtime, the memory threshold measured on Windows, and the documentation (`APP.md`, `CLI.md` for the settings version).

## Open questions

1. **Memory threshold** for Gemma 4 E2B: measured in the milestone.
2. **Graphics card or CPU build** in the installer, and how the hardware check chooses (installer milestone).
3. **Storing cloud API keys** beyond the proof of concept (Windows Credential Manager or similar).
4. **Context length.** `-c 8192` fits the setup; longer chats on the bridge may need more or a summary of older messages.

## Related documents

- [RFC-011 — First Launch, Setup, and Xora](../rfcs/RFC-011-first-launch-setup-and-xora.md), section 5, open questions 2 and 5, and Amendment 3
- [ADR-007 — Bridge Chat History and Threads](./ADR-007-bridge-chat-history-and-threads.md)
- [Xora model evaluation](../research/xora-model-evaluation/README.md) and [FINDINGS.md](../research/xora-model-evaluation/FINDINGS.md)
