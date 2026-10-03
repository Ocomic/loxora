import { LoxoraError } from "@loxora/core";
import { parseArgs } from "node:util";
import { COMMANDS, type Options } from "./commands.js";
import { CliUsageError, resolveWorkspaceDirectory } from "./workspace.js";

export interface CliIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const STRING_OPTIONS = [
  "workspace",
  "actor",
  "name",
  "purpose",
  "description",
  "project",
  "space",
  "collection",
  "kind",
  "locator",
  "title",
  "summary",
  "content",
  "content-file",
  "reason",
  "proposal",
  "decision",
  "status",
  "blocking-condition",
  "related-project",
  "from-project",
  "from-node",
  "to-project",
  "to-node",
  "confidence",
  "task",
  "budget",
  "out",
  "in",
  "plan",
  "key",
] as const;
const MULTIPLE_OPTIONS = [
  "reviewer",
  "source",
  "evidence",
  "node",
  "related-node",
  "add-node",
  "remove-node",
  "remove-evidence",
] as const;
const BOOLEAN_OPTIONS = [
  "json",
  "help",
  "allow-in-repository",
  "restricted",
  "history",
  "include-related",
] as const;

export const USAGE = `Usage: loxora <command> [options]

Workspace (default <home>/.loxora/workspaces/default; override with --workspace or LOXORA_WORKSPACE)
  workspace init --reviewer <id>... [--name <name>] [--allow-in-repository]
  workspace status

Structure and provenance (write commands need --actor <id> or LOXORA_ACTOR)
  project add --name <name> [--purpose <text>]
  space add --project <p> --name <name> [--description <text>]
  collection add --project <p> --space <s> --name <name> [--description <text>]
  source add --project <p> --locator <git:owner/repo@commit:path> --title <t> [--kind document]
  evidence add --project <p> --source <s> --summary <text> --locator <#anchor|lines>

Knowledge (proposals require review by a workspace reviewer)
  propose new --project <p> --space <s> --collection <c> --title <t> (--content <text>|--content-file <path>) --source <s>... --evidence <e>... [--key <key>]
  propose successor --project <p> --node <n> (--content|--content-file) --reason <why> --source <s>... --evidence <e>...
  inbox [--project <p>]
  review --proposal <id> --decision accept|reject --reason <why> [--evidence <e>...]   (default: the proposal's Evidence)
  node key --project <p> --node <n> --key <key>   (reviewers only; keys are immutable and never reused)

Plans (planned knowledge, never canonical; closing or reopening a plan needs a reviewer)
  plan add --project <p> --title <t> --description <d> --status Proposed|Deferred|Ready|InProgress|Completed|Cancelled --reason <why>
           --blocking-condition <what must be true first> [--node <n>...] [--related-project <p> --related-node <n>...] [--evidence <e>...]
  plan update --plan <plan> [--project <p>] --reason <why> [--status <status>] [--title <t>] [--description <d>]
           [--blocking-condition <c>] [--add-node <n>...] [--remove-node <n>...] [--related-project <p>|none]
           [--evidence <e>...] [--remove-evidence <e>...]
  plan history --plan <plan> [--project <p>]
  relate propose --from-project <p> --from-node <n> --to-project <p> --to-node <n> --evidence <e>... --reason <why> [--confidence Low|Medium|High] [--restricted]
  relate review --proposal <id> --decision accept|reject --reason <why> [--evidence <e>...]   (default: the proposal's Evidence)

Reading
  show map --project <p>
  show current --project <p> --node <n>
  show history --project <p> --node <n>
  show plans --project <p>
  context --project <p> --node <n>... [--history] [--include-related] [--budget <tokens>] [--task <label>]

Portability
  export --out <file>
  export verify --in <file>

References accept ids, Node keys (for example D-001), unique id prefixes (6+ characters), or unique names/titles.
Add --json for machine-readable output. "loxora <command> --help" or "loxora help <command>" shows one command.`;

/** Usage lines of one command, including its continuation lines; null if unknown. */
export function commandUsage(name: string): string | null {
  const lines = USAGE.split("\n");
  const result: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith(`  ${name} `) || line === `  ${name}`) {
      result.push(line);
      while ((lines[index + 1] ?? "").startsWith("           ")) {
        index += 1;
        result.push(lines[index] ?? "");
      }
    }
  }
  return result.length > 0 ? `Usage: loxora\n${result.join("\n")}` : null;
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let json = false;
  try {
    const parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        ...Object.fromEntries(STRING_OPTIONS.map((name) => [name, { type: "string" as const }])),
        ...Object.fromEntries(
          MULTIPLE_OPTIONS.map((name) => [name, { type: "string" as const, multiple: true }]),
        ),
        ...Object.fromEntries(BOOLEAN_OPTIONS.map((name) => [name, { type: "boolean" as const }])),
      },
    });
    const options = parsed.values as Options;
    json = options.json === true;
    const positionals = parsed.positionals;
    const helpTarget =
      positionals[0] === "help" ? positionals.slice(1) : options.help === true ? positionals : null;
    if (helpTarget && helpTarget.length > 0) {
      const twoWordHelp = helpTarget.slice(0, 2).join(" ");
      const usage = commandUsage(COMMANDS[twoWordHelp] ? twoWordHelp : (helpTarget[0] ?? ""));
      if (!usage)
        throw new CliUsageError(`Unknown command: ${helpTarget.join(" ")}. Run "loxora --help".`);
      io.stdout(`${usage}\n`);
      return 0;
    }
    if (options.help === true || positionals.length === 0 || positionals[0] === "help") {
      io.stdout(`${USAGE}\n`);
      return positionals.length === 0 && options.help !== true ? 1 : 0;
    }
    const twoWord = positionals.slice(0, 2).join(" ");
    const name = COMMANDS[twoWord] ? twoWord : (positionals[0] ?? "");
    const extra = positionals.slice(name.split(" ").length);
    const handler = COMMANDS[name];
    if (!handler || extra.length > 0) {
      throw new CliUsageError(`Unknown command: ${positionals.join(" ")}. Run "loxora --help".`);
    }
    const workspaceDirectory = resolveWorkspaceDirectory(
      typeof options.workspace === "string" ? options.workspace : undefined,
      io.env,
    );
    const result = await handler({ workspaceDirectory, options, env: io.env, cwd: io.cwd });
    io.stdout(json ? `${JSON.stringify(result.data, null, 2)}\n` : `${result.message}\n`);
    return 0;
  } catch (error) {
    const known = error instanceof CliUsageError || error instanceof LoxoraError;
    const message = error instanceof Error ? error.message : String(error);
    const kind = error instanceof Error ? error.name : "Error";
    if (json) io.stdout(`${JSON.stringify({ error: { kind, message } }, null, 2)}\n`);
    io.stderr(`${known ? "" : `${kind}: `}${message}\n`);
    return known || (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS") ? 2 : 1;
  }
}
