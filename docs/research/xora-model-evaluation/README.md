# Xora model evaluation

**Status:** Research tooling for RFC-011 section 10, stage 3. Not part of the product, not a decision.
**Decision Owner:** Ocomic

This folder holds the test set and a small script for the model evaluation that RFC-011 asks for before a model is chosen for Xora: about 30 typical setup sentences, in German and English, against two or three sizes of a small open-weights model on the target hardware. The results set the minimum model size, the memory threshold for loading Xora, and the wait before script mode takes over (RFC-011 open question 5).

Which model ships as Xora stays a C3 decision of the decision owner (RFC-011 section 11). The license check for that decision is deferred by the decision owner until Loxora has real users (October 13, 2026).

## Candidates

Order chosen by the decision owner on October 13, 2026:

1. **Qwen3.5-2B** first, with **Qwen3.5-4B** as the next size up for comparison.
2. **Gemma 4 E2B** later, as a comparison.

## What is measured

| Measured | How |
|---|---|
| Right action | The case expects one action or none. The script offers only the actions that fit the situation, as a local assistant would. |
| Right action details | The chosen answer, goal template, or the text the action carries. |
| A sentence to the person | Xora always writes one short sentence, also with an action. |
| Language | Xora answers in the chosen language, also when the person writes the other one (rough check by frequent words; a reply whose language cannot be told counts as failed). |
| Length | At most 60 words. |
| No technical terms | A fixed word list (for example server, database, workspace, tool). |
| Asks back | For unclear answers the reply contains a question. |
| Response time | Wall-clock time per answer with the model loaded; median, 90th percentile, slowest. Generation speed when the runtime reports it. |
| Cold start | With `--wait-ready`: time from the script's start until the runtime answers on its health route. |

Staying in role and not inventing facts are rated by hand: the report has a column with the expectation for each such case and an empty rating column.

The actions (`place_answer`, `propose_project`, `propose_first_mission`, `propose_goal`) are evaluation stand-ins for the setup answers of Milestone 14 and the actions of RFC-011 section 6. They are not a contract; the real interface follows with the Xora milestone and the runtime ADR.

## Files

- `cases.json`: the 33 cases (18 German, 15 English): setup answers, plan descriptions, unclear answers, mixed languages, the first Mission, and requests Xora must decline.
- `run.mjs`: the script. Node 24, no dependencies.

## Running it on Windows

1. Download a llama.cpp release for Windows from its GitHub releases page (the CPU build `win-cpu-x64` runs everywhere; `win-vulkan-x64` uses most graphics cards) and unpack it.
2. Start the model server on this computer only, for example:

   ```powershell
   .\llama-server.exe -hf unsloth/Qwen3.5-2B-GGUF:Q4_K_M --jinja --host 127.0.0.1 --port 8080 -c 8192
   ```

   `-hf` downloads the model file from Hugging Face on the first start; check the repository name there. `--jinja` is needed for actions (tool calls).
3. In a second window, from the repository folder:

   ```powershell
   node docs/research/xora-model-evaluation/run.mjs --label qwen3.5-2b-q4_k_m
   ```

   To also measure the cold start (how long the model needs until it answers, which sets the wait before script mode), start the script first with `--wait-ready` and then start `llama-server`. The model file must already be downloaded, so the time does not include the download.
4. Repeat with the next model (for example `unsloth/Qwen3.5-4B-GGUF:Q4_K_M`, label `qwen3.5-4b-q4_k_m`).

The report lands in `var/xora-eval/` (ignored by Git) as Markdown and JSON. Note the computer (processor, memory, graphics card) and the memory the server used, from the Task Manager, next to the report.

Options: `--runs 3` (default; each case runs three times to show how stable answers are), `--temperature 0.7`, `--cases id1,id2`, `--url http://127.0.0.1:8080`, `--out <folder>`, `--timeout 120` (seconds), `--dry-run` (prints the requests without a server), `--wait-ready` (measures the cold start). Unknown case ids stop the script. The script refuses a runtime that is not on this computer and never follows a redirect, so no sentence leaves the machine.

## After the evaluation

The results and the decision owner's ratings go into a short findings note (for example in `open-questions.md` or the runtime ADR). They feed the ADR for the bundled runtime (RFC-011 open question 2) and the C3 model decision.
