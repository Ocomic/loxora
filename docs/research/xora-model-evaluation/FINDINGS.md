# Findings

Results of the Xora model evaluation (RFC-011 section 10, stage 3), newest first. Each entry names the prompt version (`PROMPT_VERSION` in `run.mjs`) so runs stay comparable. The full reports stay on the decision owner's machine (`var/xora-eval/`).

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
