#!/usr/bin/env node
/**
 * Xora model evaluation (RFC-011 section 10, stage 3). Sends the cases in `cases.json` to a
 * local model runtime with an OpenAI-compatible chat endpoint (for example llama.cpp's
 * `llama-server --jinja`) and checks tool-call accuracy, language, length, technical terms,
 * and response time. Staying in role and not inventing facts are rated by hand from the report.
 *
 * Standalone research tooling: no dependencies, not part of `@loxora/app`, and the tools
 * offered here are evaluation stand-ins, not a contract. The runtime must listen on this
 * computer; the script refuses other hosts, so no sentence leaves the machine.
 *
 *   node docs/research/xora-model-evaluation/run.mjs --label qwen3.5-2b-q4_k_m
 *   node docs/research/xora-model-evaluation/run.mjs --dry-run
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_WORDS = 60;

const { values: options } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:8080" },
    model: { type: "string", default: "xora" },
    label: { type: "string", default: "model" },
    runs: { type: "string", default: "3" },
    temperature: { type: "string", default: "0.7" },
    cases: { type: "string" },
    out: { type: "string", default: "var/xora-eval" },
    timeout: { type: "string", default: "120" },
    "dry-run": { type: "boolean", default: false },
    "wait-ready": { type: "boolean", default: false },
  },
});

/** Words that must not appear in Xora's replies (RFC-011 section 6: no technical terms). */
const TECHNICAL_TERMS = [
  "api",
  "json",
  "tool",
  "tools",
  "server",
  "database",
  "datenbank",
  "sqlite",
  "workspace",
  "prompt",
  "llm",
  "token",
  "function",
  "funktion",
  "parameter",
];

/** Frequent words per language, for a rough check that Xora answers in the chosen one. */
const STOP_WORDS = {
  de: [
    "und",
    "der",
    "die",
    "das",
    "ich",
    "du",
    "nicht",
    "ist",
    "ein",
    "eine",
    "dein",
    "wir",
    "mit",
    "für",
    "auf",
    "gern",
    "kann",
  ],
  en: [
    "and",
    "the",
    "you",
    "your",
    "is",
    "not",
    "a",
    "an",
    "we",
    "with",
    "for",
    "on",
    "can",
    "i",
    "it",
    "to",
    "of",
  ],
};

const PERSONA = {
  de: [
    "Du bist Xora, die Erste Offizierin. {captain} ist der Kapitän des Schiffs.",
    "Loxora stellt Projektarbeit als Raumschiff dar: das Schiff ist der Arbeitsbereich, das Logbuch der Ordner mit dem Wissen, die Brücke die Übersicht.",
    "Regeln:",
    "- Antworte immer auf Deutsch, auch wenn die Person Englisch schreibt.",
    "- Höchstens zwei kurze Sätze, freundlich und ruhig, per du.",
    "- Keine Begriffe aus der Technik wie Server, Datenbank, Ordnerstruktur oder Programmname.",
    "- Erfinde nichts über das Projekt. Wenn etwas unklar ist, frag nach statt zu raten.",
    "- Du hast kein Internet, öffnest keine Dateien außerhalb des Logbuchs, installierst nichts und änderst nichts an der Oberfläche. Lehne solche Bitten freundlich ab.",
    "- Du schlägst vor, der Kapitän bestätigt. Wissen übernimmt nur der Kapitän.",
    "- Nutze höchstens eine Aktion pro Antwort und nur, wenn die Antwort der Person eindeutig ist. Schreib immer zusätzlich einen kurzen Satz an die Person.",
  ],
  en: [
    "You are Xora, the first officer. {captain} is the captain of the ship.",
    "Loxora shows project work as a starship: the ship is the work area, the logbook is the folder with the knowledge, the bridge is the overview.",
    "Rules:",
    "- Always answer in English, even if the person writes German.",
    "- At most two short sentences, friendly and calm.",
    "- No technical terms such as server, database, folder structure, or program names.",
    "- Never invent anything about the project. When something is unclear, ask instead of guessing.",
    "- You have no internet, open no files outside the logbook, install nothing, and change nothing in the interface. Decline such requests kindly.",
    "- You propose, the captain confirms. Only the captain accepts knowledge.",
    "- Use at most one action per answer, and only when the person's answer is clear. Always also write one short sentence to the person.",
  ],
};

/**
 * Where the conversation stands. `choices` maps the answer keys of `place_answer` to what
 * they mean (the keys follow `PROMPTS` in packages/app/src/shared/conversation.ts).
 */
const SITUATIONS = {
  existing: {
    tools: ["place_answer"],
    de: {
      text: "Einrichtung, Schritt Schiff. Auf diesem Computer gibt es schon ein Schiff namens Nova. Du hast gefragt, ob die Person es öffnen oder ein neues anlegen möchte.",
      choices: { open: "das vorhandene Schiff öffnen", new: "ein neues Schiff anlegen" },
    },
    en: {
      text: "Setup, step Ship. This computer already has a ship called Nova. You asked whether the person wants to open it or create a new one.",
      choices: { open: "open the existing ship", new: "create a new ship" },
    },
  },
  ship: {
    tools: ["place_answer"],
    de: {
      text: "Einrichtung, Schritt Schiff. Du hast nach dem Namen des Schiffs gefragt und Nova, Aurora und Kepler vorgeschlagen.",
      choices: {
        nova: "der Vorschlag Nova",
        aurora: "der Vorschlag Aurora",
        kepler: "der Vorschlag Kepler",
        own: "ein eigener Name; trage ihn als value ein",
      },
    },
    en: {
      text: "Setup, step Ship. You asked for the ship's name and suggested Nova, Aurora, and Kepler.",
      choices: {
        nova: "the suggestion Nova",
        aurora: "the suggestion Aurora",
        kepler: "the suggestion Kepler",
        own: "a name of their own; put it in value",
      },
    },
  },
  logbook: {
    tools: ["place_answer"],
    de: {
      text: "Einrichtung, Schritt Logbuch. Du hast vorgeschlagen, das Logbuch unter Dokumente › Loxora anzulegen, und gefragt, ob das passt.",
      choices: {
        fits: "der vorgeschlagene Ort passt",
        other: "die Person möchte einen anderen Ordner wählen, nennt aber keinen",
        path: "die Person nennt einen vollständigen Ordnerpfad; trage ihn als value ein",
      },
    },
    en: {
      text: "Setup, step Logbook. You suggested creating the logbook under Documents › Loxora and asked whether that is fine.",
      choices: {
        fits: "the suggested place is fine",
        other: "the person wants to choose another folder but names none",
        path: "the person names a full folder path; put it in value",
      },
    },
  },
  project: {
    tools: ["place_answer"],
    de: {
      text: "Einrichtung, Schritt Projekt. Du hast gefragt, ob die Person ein neues Projekt anlegen, ein bestehendes hinzufügen oder sich erst umsehen möchte.",
      choices: {
        new: "ein neues Projekt anlegen",
        existing: "ein bestehendes Projekt hinzufügen",
        look: "sich erst umsehen",
      },
    },
    en: {
      text: "Setup, step Project. You asked whether the person wants to start a new project, add an existing one, or look around first.",
      choices: {
        new: "start a new project",
        existing: "add an existing project",
        look: "look around first",
      },
    },
  },
  describe: {
    tools: ["propose_project"],
    de: {
      text: "Einrichtung, Schritt Projekt. Die Person legt ein neues Projekt an. Du hast sie gebeten, ihr Vorhaben in ein oder zwei Sätzen zu beschreiben. Schlag danach einen kurzen Projektnamen vor.",
    },
    en: {
      text: "Setup, step Project. The person is starting a new project. You asked them to describe their plan in one or two sentences. Then suggest a short project name.",
    },
  },
  confirm: {
    tools: ["place_answer"],
    de: {
      text: "Einrichtung, Schritt Projekt. Du hast das Projekt „Sternenhüpfer“ mit den Bereichen Ideen, Aufgaben und Entscheidungen vorgeschlagen und gefragt, ob du es so anlegen sollst.",
      choices: { create: "so anlegen", rename: "den Namen ändern" },
    },
    en: {
      text: "Setup, step Project. You proposed the project “Star Hopper” with the spaces Ideas, Tasks, and Decisions and asked whether to create it like this.",
      choices: { create: "create it like this", rename: "change the name" },
    },
  },
  bridge: {
    tools: ["place_answer"],
    de: {
      text: "Einrichtung, letzter Schritt. Du hast die Brücke, Missionen und die Crew erklärt und angeboten, auf die Brücke zu gehen.",
      choices: { toBridge: "auf die Brücke gehen" },
    },
    en: {
      text: "Setup, last step. You explained the bridge, Missions, and the crew and offered to go to the bridge.",
      choices: { toBridge: "go to the bridge" },
    },
  },
  bridgeChat: {
    tools: ["propose_first_mission"],
    de: {
      text: "Auf der Brücke, nach der Einrichtung. Das Projekt „Gartenplan“ ist angelegt. Die erste Mission „Projektziel festhalten“ ist noch nicht gestartet. Sonst ist noch nichts über das Projekt festgehalten.",
    },
    en: {
      text: "On the bridge, after the setup. The project “Garden plan” exists. The first Mission “Record the project goal” has not started yet. Nothing else about the project is recorded yet.",
    },
  },
  goalQuestion: {
    tools: ["propose_goal"],
    de: {
      text: "Auf der Brücke. Die Mission „Projektziel festhalten“ läuft und hat gefragt: „Für wen ist das Projekt?“. Aus der Antwort schlägst du das Projektziel in ein bis zwei Sätzen vor; der Kapitän übernimmt es danach selbst.",
    },
    en: {
      text: "On the bridge. The Mission “Record the project goal” is running and asked: “Who is the project for?”. From the answer you propose the project goal in one or two sentences; the captain then accepts it.",
    },
  },
};

/** The evaluation stand-ins for Xora's actions (RFC-011 section 6 and Milestone 14). */
function toolDefinition(name, choices) {
  switch (name) {
    case "place_answer":
      return {
        type: "function",
        function: {
          name,
          description: "Record which answer the person gave in the current setup step.",
          parameters: {
            type: "object",
            properties: {
              choice: { type: "string", enum: Object.keys(choices) },
              value: { type: "string", description: "A name or folder path the person typed." },
            },
            required: ["choice"],
          },
        },
      };
    case "propose_project":
      return {
        type: "function",
        function: {
          name,
          description:
            "Propose a new project. The person confirms it on a card before anything is created.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "A short project name, at most four words." },
              purpose: { type: "string", description: "The plan in the person's own words." },
              goal: { type: "string", enum: ["game", "website", "writing", "other"] },
            },
            required: ["name", "purpose", "goal"],
          },
        },
      };
    case "propose_first_mission":
      return {
        type: "function",
        function: {
          name,
          description:
            "Propose to start the first Mission “Record the project goal”. The captain confirms it.",
          parameters: { type: "object", properties: {} },
        },
      };
    case "propose_goal":
      return {
        type: "function",
        function: {
          name,
          description:
            "Propose the project goal from the captain's answer. The captain accepts it.",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "The goal in one or two sentences." },
            },
            required: ["content"],
          },
        },
      };
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function systemPrompt(situation, language) {
  const view = SITUATIONS[situation][language];
  const captain = "Mira";
  const lines = [
    ...PERSONA[language].map((line) => line.replaceAll("{captain}", captain)),
    "",
    view.text,
  ];
  if (view.choices) {
    lines.push(language === "de" ? "Mögliche Antworten:" : "Possible answers:");
    for (const [key, meaning] of Object.entries(view.choices)) lines.push(`- ${key}: ${meaning}`);
  }
  return lines.join("\n");
}

function request(testCase) {
  const situation = SITUATIONS[testCase.situation];
  if (!situation) throw new Error(`Case ${testCase.id}: unknown situation ${testCase.situation}`);
  const choices = situation[testCase.language].choices ?? {};
  return {
    model: options.model,
    temperature: Number(options.temperature),
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt(testCase.situation, testCase.language) },
      { role: "user", content: testCase.text },
    ],
    tools: situation.tools.map((name) => toolDefinition(name, choices)),
    // Qwen3.5 small models answer without thinking by default; other templates ignore this.
    chat_template_kwargs: { enable_thinking: false },
  };
}

function lowerWords(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function includes(haystack, needle) {
  return typeof haystack === "string" && haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Rough language guess from frequent words; null when it cannot tell. */
function guessLanguage(text) {
  const found = lowerWords(text);
  const de = found.filter((word) => STOP_WORDS.de.includes(word)).length;
  const en = found.filter((word) => STOP_WORDS.en.includes(word)).length;
  if (de === en) return null;
  return de > en ? "de" : "en";
}

function parseArguments(call) {
  try {
    return JSON.parse(call.function?.arguments || "{}");
  } catch {
    return null;
  }
}

/** Every automatic check of one answer; a check is true, false, or null (not applicable). */
function check(testCase, message) {
  const calls = message.tool_calls ?? [];
  const text = (message.content ?? "").trim();
  const expect = testCase.expect;
  const call = calls[0];
  const args = call ? parseArguments(call) : null;
  const checks = {};

  checks.tool =
    expect.tool === null
      ? calls.length === 0
      : calls.length === 1 && call.function?.name === expect.tool;
  checks.arguments = null;
  if (expect.tool && checks.tool) {
    const results = [args !== null];
    if (args) {
      if (expect.choice) results.push(expect.choice.includes(args.choice));
      if (expect.valueIncludes) results.push(includes(args.value, expect.valueIncludes));
      if (expect.goal) results.push(expect.goal.includes(args.goal));
      if (expect.purposeIncludes) results.push(includes(args.purpose, expect.purposeIncludes));
      if (expect.tool === "propose_project")
        results.push(typeof args.name === "string" && args.name.trim() !== "");
      if (expect.contentIncludes) results.push(includes(args.content, expect.contentIncludes));
    }
    checks.arguments = results.every(Boolean);
  }
  checks.hasText = text.length > 0;
  const language = text ? guessLanguage(text) : null;
  // A reply whose language cannot be told counts as failed, not as passed.
  checks.language = text ? language === testCase.language : null;
  checks.length = text ? lowerWords(text).length <= MAX_WORDS : null;
  const terms = lowerWords(text).filter((word) => TECHNICAL_TERMS.includes(word));
  checks.noTechnicalTerms = text ? terms.length === 0 : null;
  checks.asks = expect.asks ? text.includes("?") : null;

  const passed = Object.values(checks).every((value) => value !== false);
  return {
    checks,
    passed,
    call: call ? { name: call.function?.name, arguments: args } : null,
    text,
    terms,
  };
}

async function ask(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeout) * 1000);
  const started = performance.now();
  try {
    const response = await fetch(new URL("/v1/chat/completions", options.url), {
      method: "POST",
      // A redirect could send the sentences to another host; never follow one.
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const elapsedMs = Math.round(performance.now() - started);
    if (!response.ok)
      return { error: `HTTP ${response.status}: ${await response.text()}`, elapsedMs };
    const data = await response.json();
    return { message: data.choices?.[0]?.message ?? {}, timings: data.timings ?? null, elapsedMs };
  } catch (error) {
    return {
      error: String(error?.message ?? error),
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

function percentile(values, share) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
}

function rate(results, key) {
  const relevant = results.filter(
    (result) => result.checks?.[key] !== null && result.checks?.[key] !== undefined,
  );
  if (relevant.length === 0) return "–";
  const passed = relevant.filter((result) => result.checks[key]).length;
  return `${passed}/${relevant.length}`;
}

function cell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ");
}

function report(meta, results) {
  const answered = results.filter((result) => !result.error);
  const times = answered.map((result) => result.elapsedMs);
  const speeds = answered
    .map((result) => result.timings?.predicted_per_second)
    .filter((value) => typeof value === "number");
  const passed = answered.filter((result) => result.passed).length;
  const lines = [
    `# Xora model evaluation: ${meta.label}`,
    "",
    `- Date: ${meta.date}`,
    `- Runtime: ${meta.url}, model \`${meta.model}\`, temperature ${meta.temperature}, ${meta.runs} run(s) per case`,
    `- Cases: ${meta.caseCount}, answers: ${answered.length}, errors: ${results.length - answered.length}`,
    `- Cold start until the runtime was ready: ${meta.readyMs === null ? "not measured (run with --wait-ready, then start the runtime)" : `${meta.readyMs} ms`}`,
    "- Response times below are measured with the model already loaded.",
    "",
    "## Summary",
    "",
    "| Check | Passed |",
    "|---|---|",
    `| All automatic checks | ${passed}/${answered.length} |`,
    `| Right action (or none) | ${rate(answered, "tool")} |`,
    `| Right action details | ${rate(answered, "arguments")} |`,
    `| Wrote a sentence to the person | ${rate(answered, "hasText")} |`,
    `| Answered in the chosen language | ${rate(answered, "language")} |`,
    `| At most ${MAX_WORDS} words | ${rate(answered, "length")} |`,
    `| No technical terms | ${rate(answered, "noTechnicalTerms")} |`,
    `| Asked back when unclear | ${rate(answered, "asks")} |`,
    "",
    "| Language | All checks passed |",
    "|---|---|",
    ...["de", "en"].map((language) => {
      const own = answered.filter((result) => result.language === language);
      return `| ${language} | ${own.filter((result) => result.passed).length}/${own.length} |`;
    }),
    "",
    "| Response time | ms |",
    "|---|---|",
    `| Median | ${percentile(times, 0.5) ?? "–"} |`,
    `| 90th percentile | ${percentile(times, 0.9) ?? "–"} |`,
    `| Slowest | ${times.length ? Math.max(...times) : "–"} |`,
    "",
    `Median generation speed (from the runtime): ${speeds.length ? `${Math.round(percentile(speeds, 0.5))} tokens per second` : "not reported"}.`,
    "",
    "## Answers",
    "",
    "Rate the last column by hand: stays in role, invents nothing, and the manual note is met.",
    "",
    "| Case | Run | Passed | Action | Reply | ms | Manual note | Rating |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const result of results) {
    const action = result.call
      ? `${result.call.name} ${JSON.stringify(result.call.arguments)}`
      : "";
    const failed = result.error
      ? `error: ${result.error}`
      : result.passed
        ? "yes"
        : `no (${Object.entries(result.checks)
            .filter(([, value]) => value === false)
            .map(([key]) => key)
            .join(", ")})`;
    lines.push(
      `| ${result.id} | ${result.run} | ${cell(failed)} | ${cell(action)} | ${cell(result.text)} | ${result.elapsedMs} | ${cell(result.manual)} | |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Polls the runtime's health route until it answers, for at most ten minutes. Started before
 * the runtime, this measures the cold start that the wait before script mode must cover.
 */
async function waitReady() {
  const started = performance.now();
  const deadline = started + 600_000;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(new URL("/health", options.url), { redirect: "error" });
      if (response.ok) return Math.round(performance.now() - started);
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("The runtime did not become ready within ten minutes.");
}

function assertLocal(url) {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) {
    throw new Error(`The runtime must run on this computer (127.0.0.1); got ${host}.`);
  }
}

async function main() {
  const file = JSON.parse(await readFile(join(HERE, "cases.json"), "utf8"));
  const wanted = options.cases ? new Set(options.cases.split(",")) : null;
  const cases = file.cases.filter((testCase) => !wanted || wanted.has(testCase.id));
  const unknown = [...(wanted ?? [])].filter(
    (id) => !file.cases.some((testCase) => testCase.id === id),
  );
  if (unknown.length > 0) throw new Error(`Unknown case id(s): ${unknown.join(", ")}`);
  if (options["dry-run"]) {
    for (const testCase of cases) {
      console.log(`--- ${testCase.id}`);
      console.log(JSON.stringify(request(testCase), null, 2));
    }
    return;
  }
  assertLocal(options.url);
  const readyMs = options["wait-ready"] ? await waitReady() : null;
  const runs = Math.max(1, Number(options.runs));
  const results = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const testCase of cases) {
      const answer = await ask(request(testCase));
      const base = {
        id: testCase.id,
        language: testCase.language,
        run,
        manual: testCase.manual,
        elapsedMs: answer.elapsedMs,
      };
      const result = answer.error
        ? { ...base, error: answer.error }
        : { ...base, timings: answer.timings, ...check(testCase, answer.message) };
      results.push(result);
      const status = result.error ? `error: ${result.error}` : result.passed ? "ok" : "failed";
      console.log(`[run ${run}/${runs}] ${testCase.id}: ${status} (${result.elapsedMs} ms)`);
    }
  }
  const date = new Date().toISOString();
  const meta = {
    label: options.label,
    model: options.model,
    url: options.url,
    temperature: Number(options.temperature),
    runs,
    caseCount: cases.length,
    readyMs,
    date,
  };
  const outDir = resolve(options.out);
  await mkdir(outDir, { recursive: true });
  const stem = `${options.label}-${date.replace(/[:.]/g, "-")}`;
  await writeFile(join(outDir, `${stem}.json`), `${JSON.stringify({ meta, results }, null, 2)}\n`);
  await writeFile(join(outDir, `${stem}.md`), report(meta, results));
  console.log(`\nReport: ${join(outDir, `${stem}.md`)}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
