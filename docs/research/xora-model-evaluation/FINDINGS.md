# Findings

Results of the Xora model evaluation (RFC-011 section 10, stage 3), newest first. Each entry names the prompt version (`PROMPT_VERSION` in `run.mjs`) so runs stay comparable. The full reports stay on the decision owner's machine (`var/xora-eval/`).

## Qwen3.5-2B and Qwen3.5-4B, Q4_K_M, prompt version 2 (November 2, 2026)

Same PC and setup, 33 cases, 3 runs each (99 answers), each model at temperature 0.7 and at 0.2.

| Check | 2B, 0.7 | 2B, 0.2 | 4B, 0.7 | 4B, 0.2 |
|---|---|---|---|---|
| All automatic checks | 19/99 | **29/99** | 14/99 | 14/99 |
| All except the extra sentence | 44/99 | **62/99** | 23/99 | 20/99 |
| Right action (or none) | 53/99 | **66/99** | 24/99 | 23/99 |
| Wrote a sentence to the person | 69/99 | 66/99 | 25/99 | 21/99 |
| Asked back when unclear | 2/6 | 3/6 | 1/6 | 0/6 |
| Response time, median | 295 ms | 258 ms | 812 ms | 823 ms |
| Cold start | – | 18.3 s | – | 15.2 s |

- **Temperature 0.2 helps the 2B clearly.** At 0.7 it proposed the first Mission in cases that need no action (internet, install, deadline); at 0.2 it declines those kindly. Placing setup answers is almost always right (details 38/39).
- **Project proposals stay the 2B's weak spot.** At 0.2 it called `propose_project` in 3 of 15 description cases; otherwise it wrote "I proposed the project" without the action. It still sometimes writes an action as text ("**Aktion:** ...").
- **The 4B is not better.** It almost never writes a sentence, never asks back, picks an answer for unclear questions, and at both temperatures calls `propose_first_mission` or `propose_goal` in the internet, deadline and "captain decides" cases. Many of its answers carry several action calls, which the old script counted as a wrong action. That understates it a little, but the faults above remain. Its German is more polished, with formal "Sie".
- **The extra sentence matters less than the action.** The 2B passes 62/99 when the app shows a fixed sentence next to an action card. That suggests the app should write that sentence itself.

Script changes after these runs: identical repeated action calls in one answer count once, the report shows how many calls an answer had, and the default temperature is now 0.2.

Next: Gemma 4 E2B (`unsloth/gemma-4-E2B-it-GGUF:Q4_K_M`) with the same settings. Qwen3.5-2B at 0.2 is the current favourite; the 4B is not pursued further.

## Qwen3.5-2B, Q4_K_M, prompt version 1 (November 2, 2026)

Decision owner's Windows PC, llama.cpp `llama-server` with a graphics card, 33 cases, 3 runs each (99 answers).

| Check | Passed |
|---|---|
| All automatic checks | 28/99 |
| Right action (or none) | 55/99 |
| Right action details, when the action was right | 26/28 |
| Wrote a sentence to the person | 76/99 |
| Answered in the chosen language | 76/76 |
| No technical terms | 74/76 |
| Response time, median / 90th percentile | 251 ms / 371 ms (227 tokens per second) |

- **Fast enough.** Answers take about a quarter of a second. The cold start was not measured yet.
- **Placing simple answers works.** When it chose an action, the details were almost always right. Language and the decline cases (internet, files, install) mostly passed.
- **Proposals fail.** It almost never used `propose_project` (1 of 15 tries, with an invalid goal) or `propose_first_mission` (1 of 6) and wrote the proposal as text instead. Several replies read the rule "you propose, the captain confirms" as "I may not act".
- **No sentence next to an action.** 23 answers carried only the action. Whether the app shows a fixed sentence next to an action, or the model must write one, is open; the report now counts both.
- **German quality is weak.** Mixed "du" and "Sie", odd forms of address ("meine liebevolle Mutter", "Frau Xora"), and grammar errors ("Ich schläge vor").
- **Role slips.** Twice it named game engines after saying it had no internet; once it said it was "not sure whether it is ChatGPT".

Changes for prompt version 2: the prompt says that an action is only a proposal shown as a card, asks to use the action instead of writing about it, and forbids naming programs, companies, or language models. The report adds "All except the extra sentence".

Next: rerun Qwen3.5-2B with prompt version 2, then Qwen3.5-4B, both with `--wait-ready` for the cold start.
