# Milestone 14: Setup as a conversation with Xora (script mode)

**Status:** Authorized (this document merged in pull request #33, October 5, 2026); both deliveries (section 11) implemented: delivery 1 in pull requests #35 and #36, delivery 2 in pull request #37. The manual Windows check (section 10) started on October 8, 2026; its findings led to the follow-up below.
**Decision Owner:** Ocomic
**Change class:** C2 (RFC-008): a changed UI surface, changed setup routes and assistant inputs, bundled typefaces
**Implements:** RFC-011 Amendment 1 (setup as a conversation), on top of [Milestone 13](./MILESTONE-13.md)

## Authorization

- RFC-011 was accepted by Ocomic on October 4, 2026. Amendment 1, decided by Ocomic on October 5, 2026 after reviewing a clickable prototype, changes the shape of the setup and authorizes this milestone document.
- Milestone 13 (setup in script mode) is merged in two parts (pull requests #31 and #32). This milestone keeps its settings file, workspace resolution, actor resolution, Core writes, and proposed actions, and changes the surface and the order of the setup.
- Merging this document authorizes the implementation described here and nothing beyond it. The C3 items of RFC-011 section 11 stay out of scope. Adding an existing project (an import) stays gated and is only shown, not active.

## Goal

A person starts `@loxora/app` without a workspace and sets up their ship in a short conversation with Xora, in German or English: name, ship, logbook, project, bridge. They can type every answer, and every answer except their name can also be tapped. The setup ends on the bridge, where the first Mission is offered.

There is still no language model. Xora's replies are fixed texts, and typed answers are matched by a small, documented keyword list per language (script mode, RFC-011 section 2). When Xora does not understand, she says so.

## Authorized scope

### 1. The setup surface

The Milestone 13 setup screens (scenes A4 to C3) and the first-steps screen for part D are replaced by one conversation surface in the console style of RFC-011 Amendment 1:

- **Left column (Xora):** her picture, name plate, a status line, and the ship terms list (section 5).
- **Right column (conversation):** the progress bar with five steps (Name, Ship, Logbook, Project, Bridge), the conversation, and two to four answer buttons under Xora's latest message.
- **Bottom:** the Xora input bar from Milestone 13, which is the real input during the setup. Enter or the send button submits; an empty input does nothing.
- The DE/EN switch stays visible and applies at once. A language change keeps the conversation position; earlier messages stay in the language they were shown in.
- Keyboard: all buttons and the input bar are reachable with Tab; new Xora messages are announced to screen readers (`aria-live="polite"`).

### 2. Start screen (part A)

- Heading "Establishing connection to the command center" ("Verbindung zum Kommandozentrum wird hergestellt") with one line per real state, each set from `GET /api/setup`: ship computer (server) ready; logbook found or not yet created; Xora online in script mode. No invented progress and no artificial delay beyond a short animation between lines.
- Xora's picture is dimmed until the scripted assistant is ready, then the conversation starts.
- If the server cannot be reached, the screen says so and offers a retry.

### 3. The conversation

| Step | Xora asks | Answer buttons | Typed answer |
|---|---|---|---|
| Name | her introduction and the person's name; explains "captain" | none | any text; the captain id is derived as in Milestone 13 section 5. If it is unusable, Xora asks for a short name. |
| Ship | the ship's name, addressing the captain by name; explains "ship" | "Nova", "Aurora", "Kepler" | any text is the ship name |
| Logbook | shows the default location ("Documents › Loxora", full path under Details); explains "logbook" | "That's fine", "Choose another folder" | yes or other folder by keyword; otherwise a path |
| Project | new project, existing project, or look around | "Start a new project", "Add an existing project", "Look around first" | by keyword |
| Bridge | closing message; explains "bridge", "Mission", "crew" | "To the bridge" | by keyword |

- **Existing ship (Milestone 13 scene B0).** If the settings file or the CLI default has a workspace, Xora offers to open it in place before the Ship step. The captain must be a reviewer, as in Milestone 13. The Ship and Logbook steps are then marked done.
- **Logbook.** The OneDrive hint, the Git guard, and the existing-workspace check of Milestone 13 section 6 stay; Xora says them as messages. "Choose another folder" shows a path field inside the conversation. The workspace is created after the person confirms the folder (Milestone 13 section 7, unchanged).
- **New project.** Xora asks for one or two sentences about the plan, with the answer buttons "A game", "A website", "Texts or a book", and "Something else". A typed text is stored unchanged as the project purpose; a button uses the purpose of the matching Milestone 13 goal template, and "Something else" asks for a short text. Xora suggests a name and the knowledge spaces from the keyword list (a game, a website, texts or a book, otherwise the "other" spaces of Milestone 13) and shows a confirmation card in the conversation with "Create" and "Change name". Only "Create" executes the existing `createProject` action (Milestone 13 sections 7 and 8).
- **Add an existing project.** Shown, but not active. Xora says in one sentence that this comes in a later version and offers "Start a new project instead" and "Look around first". No folder is read.
- **Look around first.** Ends the setup without a project.
- **End.** The setup ends on the bridge (Mission Control) after "Create" or "Look around first". It sets `setup.completedAt`.
- **Not understood.** A typed answer that the keyword list cannot place gets one fixed reply ("I don't understand that yet, I'm still in script mode. Just tap one of the answers.") and the same answer buttons again. Name, ship name, project description, project name, and folder path accept any text and are never "not understood".
- **Change.** Confirmation cards offer "Change" instead of a Back button. Nothing is written before a card is confirmed.
- **Resume.** An interrupted setup continues at the current step on the next start (`setup` in the settings file). The conversation shown after a resume is rebuilt from the answers already stored, not from a stored transcript.

### 4. First Mission on the bridge (part E)

- Milestone 13 scenes E1 to E4 (start the Mission "Record the project goal", answer it, accept the goal, short hints) leave the setup. They are offered on the bridge while a project created by the setup exists and the first Mission is not finished: as the Mission list's empty state and as the banner that Milestone 13 already shows.
- The offer can be dismissed; the dismissal is stored in `setup`. The steps, actions, actors, and writes stay exactly as in Milestone 13 section 7.
- The final shape of this offer (empty state, guided tour, or Xora's first live start) is RFC-011 open question 8 and follows with the bridge design.

### 5. Ship terms

- A list "Ship terms" ("Bordbegriffe") next to Xora collects each term the first time the conversation uses it, with one sentence each: captain, first officer, ship, logbook, project, bridge, Mission, crew.
- The texts live in the label module in German and English. After the setup the list is not shown (RFC-011 open question 9).

### 6. Script-mode parsing

- `ScriptedAssistant` gets the setup steps as new assistant inputs. It returns the reply key, the answer buttons, and at most one proposed action, as in Milestone 13 section 8. It never writes.
- The keyword list is fixed per language in one module, with tests. It matches lower case, ignores accents and punctuation, and looks for word stems (for example "ander", "ordner" for another folder; "neu" or "new" for a new project).
- Answer buttons send their key, not their text, so buttons never depend on the keyword list.
- Typed setup answers are handled like input bar messages: they are not logged. Only the answers the setup stores (name, ship name, logbook path, project name and purpose) are kept, in the places Milestone 13 defines.

### 7. Routes

The Milestone 13 routes stay with their request protection. Changes:

- `POST /api/assistant/message` accepts the setup step and `{ "text" }` or `{ "choice" }` for it, and returns the reply key, the answer buttons, the terms to add, and a proposed action if any.
- `GET /api/setup` additionally returns the step for the progress bar and the start states of section 2.
- `POST /api/setup/intro` is removed; the orientation scenes it recorded no longer exist. A settings file that still holds the intro flag is read without error.
- Exact payloads are documented in `APP.md` with the implementation.

### 8. Visual base

- Console style tokens (colors, cut corners, glow, grid background) as CSS custom properties in `@loxora/app`. They are used by the setup surface, the header, and the input bar on every screen.
- Typefaces: Orbitron (headings and buttons), Exo 2 (text), Share Tech Mono (labels), all under the SIL Open Font License. They are bundled with the app with their license texts and never loaded from the internet.
- Mission Control's own layouts (overview and Mission detail) are not restyled in this milestone; only the header and the input bar get the new style there (see non-scope). Their restyling follows with the bridge design in a later milestone.

### 9. Xora's picture

- The picture supplied by the decision owner is committed only after its provenance is recorded: which tool created it and that its terms allow use in an Apache-2.0 project. The record goes into the pull request that adds it and next to the file.
- Until then the app uses a neutral placeholder silhouette made for the project. The milestone is complete with the placeholder.
- The hologram look for transmissions is a CSS effect on the same picture; no second picture is needed.

### 10. Tests and documentation

- **Unit tests:** the keyword list per language (each step's matches, the "not understood" fallback, free-text steps never rejected); label parity for all new texts and ship terms.
- **Server tests:** the setup conversation runs the Milestone 13 writes unchanged; the existing-project choice writes nothing and reads no folder; "Look around first" ends the setup without a project; the first Mission offer appears on the bridge and is gone after it is finished or dismissed; a settings file with the old intro flag still loads.
- **Playwright end-to-end tests** in script mode, with a temporary `LOXORA_HOME`: the full setup in German by tapping (apart from the name), the full setup in English by typing, opening an existing workspace, "Look around first", the not-understood reply, and the first Mission from the bridge. The Milestone 13 tests are replaced where they cover removed screens.
- **Manual check** on Windows by the decision owner: the whole conversation in both languages, the Documents location, and typing and tapping. The Milestone 13 Windows check can be recorded in the same pass.
- **Documentation:** `APP.md` (setup surface, routes, keyword list), RFC-011 (Milestone 14 implemented), the RFC index, `open-questions.md`, and `AGENTS.md` (milestone list).

### 11. Delivery

Two pull requests:

1. Tokens and typefaces for the setup surface, placeholder picture, start screen, the conversation with script-mode parsing, ship terms, routes, and the first Mission offer on the bridge (section 4), with their server and Playwright tests. The offer ships together with the new end of the setup, because ending the setup sets `setup.completedAt`, which hides the Milestone 13 first-steps banner; so there is no state in which a new project has no route to its first Mission.
2. Header and input bar style on every screen, the remaining Playwright tests, and the documentation. Xora's real picture is added here or later, once section 9 is satisfied.

## Choices made in this document

These follow from Amendment 1 but were not decided there. The decision owner can change any of them before merging:

- **Ship name buttons** are "Nova", "Aurora", and "Kepler".
- **Project name and spaces** are suggested from the description by the keyword list, reusing the Milestone 13 goal templates.
- **The transcript is not stored.** A resumed setup rebuilds the conversation from the stored answers.
- **Earlier messages keep their language** after a language switch.
- **`/api/setup/intro` is removed** instead of kept as a no-op.
- **Mission Control layouts are restyled later**, with the bridge design; this milestone only restyles the header and the input bar outside the setup.
- **Placeholder picture** until the provenance of Xora's picture is recorded.

## Explicit non-scope

- Any language model or model runtime (RFC-011 milestone 3).
- Adding an existing project, reading or linking any folder other than the logbook (import, gated).
- The 2D bridge visualizer, a guided bridge tour, and the final first-Mission offer (bridge design, RFC-011 milestone 4).
- Restyling the Mission overview and Mission detail layouts.
- Storing the conversation transcript or input bar messages.
- The installer, packaging, a native folder picker, and code signing.

## Acceptance checks

| Check | Evidence |
|---|---|
| The setup is one conversation with five visible steps, completable by typing only, and by tapping only apart from the name (with the default logbook and a fixed project button) | Playwright |
| The start screen shows only states the server reported | server and Playwright tests |
| Unknown typed answers get the not-understood reply; free-text steps accept any text | unit tests |
| The setup writes exactly what Milestone 13 section 7 lists for parts B and D, only after confirmed cards | server tests |
| "Add an existing project" writes nothing and reads no folder | server tests |
| The first Mission is offered on the bridge and runs the Milestone 13 part E writes | server tests, Playwright |
| Typefaces load without network access | Playwright with network requests to other hosts blocked |
| German and English labels have the same keys | `packages/app/test/app.test.ts` |
| Existing behavior is unchanged with `--workspace` | `npm run check`, existing tests |
| Windows check: the whole conversation in both languages | recorded in the pull request |

## Knowledge, navigation, and documentation effects

- New: this document. RFC-011 links it from its Decision section and Amendment 1.
- On implementation: `APP.md`, RFC-011, the RFC index, `open-questions.md`, and `AGENTS.md`.
- The fixed texts of the prototype move into the label module; the prototype itself stays outside the repository.

## Follow-up after the first Windows check

Decided by Ocomic on October 8, 2026, after running the setup on Windows, where the Documents folder was redirected to OneDrive. The logbook landed in OneDrive with only a warning, and choosing another place meant typing a full path.

- **Ship terms fold.** Each ship term has a chevron. The terms a prompt introduces are unfolded; all others fold when new terms arrive. The person can unfold or fold any term.
- **Logbook on this PC or in OneDrive.** When OneDrive is set up on the computer, "Choose another folder" becomes two answers: "Choose a folder on this PC" and "Choose a folder in OneDrive". Without OneDrive, "Choose another folder" stays.
- **Folder window.** The answer opens the folder window of Windows (opened by the local app server through PowerShell), starting in the home folder or in the OneDrive folder; "Choose another folder" starts in Documents. The logbook goes into a `Loxora` folder inside the chosen folder, unless the chosen folder is already called so or already holds a logbook. The chosen folder is checked like a typed one (Git working tree, OneDrive, existing logbook). Closing the window keeps the previous folder. Where the server cannot open the window (outside Windows), the folder is typed as before.
- **Route.** `POST /api/setup/folder` with `{ place: "local" | "oneDrive" | "documents", title }`, setup mode only, one window at a time.
- **Text.** "Everything stays on this computer" is said only when the proposed folder is not synchronized by OneDrive.
- **Checks.** Server tests with a stand-in folder window; a Playwright check for folding. The folder window itself is checked manually on Windows.

