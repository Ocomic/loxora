# Projekt-Review Loxora, November 2026

**Status:** Review, keine Entscheidung und keine Umsetzungsfreigabe (RFC-008)
**Stand:** `main` bei Commit `54a48be` (PR #55, Milestone 16, Lieferung 1), 15. November 2026
**Auftraggeber:** Ocomic
**Sprache:** Deutsch, auf Wunsch des Auftraggebers (die übrige Doku ist englisch)

## Worauf dieses Review beruht

**Vollständig gelesen:** `README.md`, `AGENTS.md`, `PRODUCT-VISION.md`, `UI-VISION.md`, `open-questions.md`, RFC-000, RFC-009, RFC-011 (mit Amendments 1 bis 3), ADR-007, ADR-008, `MILESTONE-16.md`, `FINDINGS.md` der Modellauswertung, `MCP-API.md`, `DOGFOODING.md`, die Recherche zur Token-sparenden Wissensdarstellung, der größte Teil von `APP.md`, die PR-Vorlage, `ci.yml`. Im Code: `packages/app/src/server/assistant.ts`, `model.ts`, `xora-prompt.ts`, die Schreibschutz- und Routing-Teile von `server.ts`, `core/src/ports.ts`.

**Nur überflogen (Überschriften, Ausschnitte, gezielte Suche):** RFC-001 bis RFC-008 und RFC-010, ADR-001 bis ADR-006, Milestones 1 bis 15, die Hackathon-Dokumente, `LICENSING-STRATEGY.md`, `runtime.ts`, `setup.ts`, `core/src/mission.ts`, `Bridge.tsx`, `styles.css`, die SQLite-Adapter und `packages/demo`.

**Selbst ausgeführt:** `npm ci` und `npm test` (159 Tests, alle grün, unter Node 22.23 statt der geforderten 24.18). Die App im Skriptmodus gestartet und Einrichtung und Brücke auf Deutsch durchgeklickt, bei 1280 und 390 Pixel Breite.

**Nicht geprüft:** Xora mit einem echten Modell, das Verhalten unter Windows, PR #56 (noch nicht auf `main`), der private Arbeitsbereich und die privaten Design-Entwürfe.

**Annahmen** sind im Text als „Annahme“ markiert. Das betrifft vor allem alle Aussagen über Wettbewerber: Sie stammen aus meinem Vorwissen und sind nicht recherchiert.

---

## Zusammenfassung

1. **Der wichtigste Befund: Bei Loxora arbeitet noch niemand.** Es gibt ein Logbuch, einen Missions-Zustand, einen Bord-Chat und eine Erste Offizierin, aber keinen einzigen Agenten, der eine Aufgabe ausführt. Missionen entstehen nur über die Kommandozeile oder als feste Übungsmission der Einrichtung. Ein Nicht-Entwickler landet nach der Einrichtung auf einer Brücke mit „Noch keine Crew“ und kann nichts erledigen lassen.
2. **Im Repository stecken zwei Produkte.** Das erste ist ein strenges Projektgedächtnis für Entwickler (Quellen, Belege, Vorschläge, Review, Rollback). Das zweite ist ein Raumschiff für Nicht-Entwickler. `README.md` beschreibt nur das erste, die letzten sechs Milestones bauen nur das zweite. Die Verbindung zwischen beiden ist nirgends entschieden.
3. **Die Ingenieursqualität ist hoch.** Saubere Schichten (Core ohne Modell- und Datenbankcode), 159 grüne Tests, ein deterministischer Skriptmodus als Rückfallebene und Teststub, ehrliche Auswertung der kleinen Modelle. Das ist für ein Soloprojekt ungewöhnlich gut.
4. **Die Xora-Entscheidung ist richtig, aber ihr Nutzen ist heute klein.** Gemma 4 E2B besteht 42 von 99 Prüfungen. Die Konsequenz (die App erledigt feste Auswahlschritte selbst, das Modell nur Freitext) ist genau richtig. Auf der Brücke kann Xora aber nur erklären: Sie kennt keine Projektinhalte und kann nichts anlegen.
5. **Die Metapher trägt, wenn sie dünn bleibt.** Kapitän, Crew, Mission, Logbuch und Brücke erklären sich fast selbst. Darunter liegen aber noch „Bereich“, „Sammlung“, „Vorschlag“, „Quelle“ und „Beleg“. Das sind zu viele Begriffe für jemanden, der nur eine Aufgabe erledigt haben will.
6. **Der Prozess ist für eine Person zu schwer.** Rund 645 KB Doku stehen 42.000 Zeilen Code gegenüber, RFC-011 hat drei Amendments in vier Wochen. Die Doku-zuerst-Regel ist für KI-gestützte Entwicklung wertvoll, kostet aber jedes Mal Tokens und Zeit. Für Experimente fehlt eine leichte Spur.
7. **Die Reihenfolge der Roadmap stimmt nicht.** Geplant ist: Xora, dann Installer, Mehr-Agenten-Betrieb irgendwann. Ich empfehle: erst ein einzelner Agent, der eine echte Mission ausführt, dann fünf Testpersonen, dann der Installer.
8. **Eine Sicherheitslücke mit kleinem Aufwand und eine Vertrauensannahme, die mit der ersten Crew nicht mehr hält:** Lese-Routen prüfen den Host-Header nicht (Auslesen des Chats über DNS-Rebinding möglich). Und die Regel „nur Menschen übernehmen Wissen“ ist laut ADR-004 bewusst nur ein Schutz gegen Versehen (`agent:`-Präfix), keine Sicherheitsgrenze. Ein ausführender Agent braucht deshalb eine Sandbox.
9. **Die stärkste ungenutzte Positionierung ist Privatsphäre plus Kontrolle,** nicht das Raumschiff: ein lokaler Assistent, der fragt, bevor etwas den Rechner verlässt oder geschrieben wird, und über den man jederzeit nachlesen kann, was warum entschieden wurde.
10. **Vier Entscheidungen blockieren alles Weitere:** Zielgruppe für die erste Version, erster echter Anwendungsfall, wie die erste Crew angebunden wird, und ob das Wissensmodell für Nicht-Entwickler vereinfacht wird (Kapitel 8).

---

## 1. Produktvision

### Stärken

- **Ein klares Leitbild für Kontrolle.** „Xora schlägt vor, du entscheidest“ ist im Code durchgezogen: Bestätigungskarten, schreibende Aktionen nur nach Klick, Wissen nur durch menschliche Annahme (gelesen in `assistant.ts`, RFC-011 Abschnitt 6). Viele Agenten-Werkzeuge versprechen das nur.
- **Aufmerksamkeit ist ein eigenes Konzept.** Der Missions-Zustand `waiting` mit typisiertem Grund (`needs_input`, `needs_approval`, `provider_limit` und weitere, RFC-009) und der abgeleitete Kanal `#entscheidungen` beantworten die Frage „Was braucht mich gerade?“ strukturell. Das ist die beste Produktidee im Repository.
- **Lokal zuerst ist glaubwürdig.** Schriften gebündelt, Server nur auf `127.0.0.1`, kein Download ohne Zustimmung, Skriptmodus ohne Modell.
- **Gedächtnis mit Herkunft.** Aktuelles, früheres und geplantes Wissen sind getrennt, jede Änderung hat Grund und Urheber. Das löst ein echtes Problem von KI-Arbeit: Niemand weiß nach drei Wochen mehr, warum etwas so entschieden wurde.

### Schwächen und Risiken

**Zwei Produkte, eine Codebasis.** `README.md` sagt: „local-first and model-independent project knowledge and context layer“. `UI-VISION.md` sagt: Raumschiff für Menschen ohne Programmierkenntnisse. Der Wissenskern wurde an Entwickler-Arbeit geprüft (Dogfooding mit Git-Commits als Quellen). Für Nicht-Entwickler wurde er nie geprüft. Folge: Die Einrichtung legt für ein Hobbyprojekt drei „Bereiche“ und eine „Sammlung“ an und erzeugt für einen einzigen Satz Projektziel eine Quelle, einen Beleg, einen Vorschlag und ein Review. Das ist korrekt nach RFC-003, aber Zeremonie ohne spürbaren Nutzen für diese Zielgruppe.

**Die Metapher verspricht mehr, als das Produkt hält.** „Kapitän eines Raumschiffs mit Crew“ weckt die Erwartung, dass die Crew arbeitet. Heute erklärt Xora das Schiff, und die Crew-Liste ist leer. Je schöner die Metapher, desto größer die Enttäuschung im ersten Test. Das Risiko ist nicht die Metapher selbst, sondern der Zeitpunkt: Sie wurde vor der Funktion gebaut.

**Die Metapher kostet Begriffe.** Gelesen in `conversation.ts` und im Durchlauf gesehen: Kapitän, Erste Offizierin, Schiff, Logbuch, Projekt, Brücke, Mission, Crew, Modell. Dazu kommen ohne Erklärungsliste: Bereich, Sammlung, Kanal, Thread, Direktnachricht, Entscheidungen, Skriptmodus. Das sind rund 16 Begriffe in den ersten zehn Minuten. Faustregel aus der Praxis: Mehr als fünf neue Begriffe im Onboarding merkt sich niemand.

**Zielgruppe „Nicht-Entwickler“ ist zu breit.** Die Vorlagen nennen Spiel, Website und Texte. Zwei davon sind Software-Projekte. Ein Nicht-Entwickler, der ein Spiel bauen will, braucht einen Agenten, der Code schreibt, ausführt und zeigt. Das ist der schwierigste denkbare erste Anwendungsfall. Wer genau der erste Nutzer ist, ist nicht entschieden (`open-questions.md` nennt nur Ocomic als Dogfooding-Ziel, also wieder einen Entwickler).

**Positionierung gegenüber bestehenden Werkzeugen (Annahme, nicht recherchiert).** Für Nicht-Entwickler gibt es Chat-Apps mit Agentenfunktionen der großen Anbieter, lokale Modell-Oberflächen (LM Studio, Jan, Open WebUI, AnythingLLM) und Automatisierer (n8n, Zapier). Für Entwickler gibt es Coding-Agenten. Loxora ist heute in keinem dieser Felder besser. Mögliche eigene Lücke: lokal, anbieterunabhängig, mit nachvollziehbarem Gedächtnis und sichtbarer Freigabe. Diese Lücke ist echt, aber sie wird durch Kontrolle und Gedächtnis gefüllt, nicht durch das Raumschiff-Design. Ein Wettbewerbsvergleich fehlt im Repository vollständig und gehört in die Research-Pakete (Kapitel 5, R1).

**Vision ohne Grenze.** `PRODUCT-VISION.md` enthält Compute-Router, Cloud-Burst, Kostenwächter, Hub, Modell-Gateway, selbst anpassende Oberfläche und Dashboards. Das sind fünf bis sechs eigene Firmen. Als Nordstern ist das in Ordnung, aber es fehlt der Satz, was Loxora in der ersten nutzbaren Version **nicht** ist.

### Richtungen, an die bisher nicht gedacht wurde

Wenige, dafür mit konkretem Anschluss an das, was schon gebaut ist:

| Richtung | Idee | Warum Loxora dafür passt |
|---|---|---|
| **Privatsphäre als Hauptprodukt** | Der „Schleusenwärter“: Xora läuft lokal und entscheidet mit dem Kapitän, was an ein Cloud-Modell geht. Sie ersetzt Namen, Adressen und Zahlen vor dem Senden und setzt sie in der Antwort wieder ein. | Die Zustimmungskarte für Cloud-Modelle (RFC-011 Amendment 3) ist der erste Baustein. Ein kleines lokales Modell ist für Erkennen und Ersetzen deutlich besser geeignet als für Agentenarbeit. Zielgruppen: Kanzleien, Praxen, Vereine, Lehrkräfte. |
| **Bildung** | „Klassenfahrt-Modus“: Jede Schülerin ist Kapitänin, die Lehrkraft sieht die Logbücher. Das Logbuch zeigt, was die KI vorgeschlagen und was der Mensch entschieden hat. | Trennung von Vorschlag und Annahme ist genau das, was Schulen bei KI-Nutzung nachweisen wollen. Läuft offline auf Schulrechnern. Die Metapher passt für 10- bis 16-Jährige besser als für Erwachsene. |
| **Barrierefreiheit** | Sprache als gleichwertiger Zugang, nicht als Zusatz. Der Kanal `#entscheidungen` als vorlesbare Liste: „Du hast zwei offene Entscheidungen.“ | Die Trennung „was mich braucht“ von „was passiert“ ist für Screenreader und Sprachbedienung ideal. Lokale Spracherkennung (Whisper-Klasse) passt zu lokal zuerst. |
| **Familien und kleine Teams** | Ein Schiff, mehrere Offiziere mit eigenen Rechten. Kinder dürfen Missionen starten, Eltern geben frei. | `reviewers` in `workspace.json` und die Menschen-Regeln im Core sind die Grundlage. ADR-007 hält Mehrpersonen-Kanäle bereits offen. |
| **Vereine und Ehrenamt** | Vorstandswechsel ohne Wissensverlust: Protokolle, Beschlüsse, Zuständigkeiten als Logbuch mit Verlauf. | Das ist der ursprüngliche Kern („Projects should never lose their memory“) für eine Zielgruppe, die ihn sofort versteht und keine Git-Commits als Quellen braucht. |
| **Übergabe-Protokoll** | Am Ende jeder Mission ein Bericht in einfacher Sprache: was getan, was offen, was entschieden. Als Datei im Dokumente-Ordner. | `MissionOutcome` existiert. Das Logbuch liegt bereits sichtbar unter Dokumente. |
| **Community** | „Missionsvorlagen“ als geteilte Dateien: eine Vorlage ist Ziel, Fragen an den Kapitän und nötige Werkzeuge. | Vorlagen sind Text, brauchen keinen Hub und keinen Server. Sie sind ein niedrigschwelliger Beitrag für Leute, die nicht programmieren. |
| **Geschäftsmodell** | Kern bleibt Apache 2.0. Bezahlt werden: signierter Installer mit automatischen Updates, geprüfte Modell- und Vorlagenpakete, später Abgleich zwischen Geräten. | Deckt sich mit dem Geschäftsprinzip in `PRODUCT-VISION.md`, ist aber Jahre früher erreichbar als Compute oder Gateway. Muss vor einer SignPath-Bewerbung geprüft werden. |

Meine Empfehlung: **Privatsphäre** als Positionierung und **Vereine oder Selbstständige mit Schreib- und Organisationsarbeit** als erste Zielgruppe. Beides braucht keinen Code-Agenten.

---

## 2. Architektur

### Was im Repository steht

- **Pakete:** `core` (Regeln, Typen, Ports, keine Abhängigkeiten), `sqlite` (Adapter auf `node:sqlite`, acht Migrationen), `cli`, `mcp` (ein lesendes Werkzeug `loxora_get_context` über stdio), `app` (lokaler Node-Server plus React-Client), `demo` (eingefroren).
- **Orchestrierung:** keine. `MissionService` ist eine Zustandsmaschine mit sieben Zuständen. Übergänge werden von außen gemeldet (CLI) oder von der App für die feste erste Mission geschrieben. RFC-009 schließt Orchestrierung ausdrücklich aus, `AGENTS.md` führt sie unter „Always gated“.
- **Xora:** Schnittstelle `Assistant` im App-Server, `ScriptedAssistant` und `ModelAssistant`, ein Adapter für `POST /v1/chat/completions`, `llama-server` als eigener Prozess (attached oder managed). Erlaubte Aktionen: `place_answer` und `propose_project`. Im Chat nur Text, mit den letzten zehn Nachrichten.
- **Gedächtnis:** Wissensknoten mit Revisionen, Quellen, Belegen, Review. Chatverlauf in eigenen Tabellen, ausdrücklich kein Wissen. Keine Suche, keine Embeddings (gesperrt nach `AGENTS.md`).
- **Werkzeuge:** keine Anbindung nach außen. MCP nur als Server, nicht als Client.

### Bewertung

| Bereich | Urteil | Begründung |
|---|---|---|
| Struktur und Modulgrenzen | **gut** | Core ist frei von Modell-, Datenbank- und UI-Code. Grenztests erzwingen das. Ports sind asynchron, der Speicher ist austauschbar. |
| Testbarkeit | **sehr gut** | Skriptmodus als deterministischer Stub, falsche Laufzeit für den Modelladapter, Playwright auf Deutsch und Englisch. Kein Test braucht ein Modell. |
| Xora-Integration | **gut entworfen, schmal im Nutzen** | Validierung jeder Modellantwort, Rückfall auf Skript, kein automatischer Neustart, Modellname aus den Einstellungen. Aber `ModelAssistant` ist auf die Einrichtung zugeschnitten: Jede neue Fähigkeit braucht neuen Code in drei Dateien. |
| Agenten-Orchestrierung | **fehlt** | Es gibt keinen Ausführer, keine Werkzeugschleife, keine Rechte pro Werkzeug. Das ist die größte Lücke des Projekts. |
| Speicher und Gedächtnis | **stark im Modell, schwach im Zugriff** | Xora und künftige Agenten bekommen kein Wissen aus dem Logbuch. Ein Kontextpaket für einen Knoten kostete im Dogfooding rund 4.200 Tokens. Das ist die Hälfte von Xoras Kontextfenster (`-c 8192`). |
| Werkzeuganbindung | **fehlt** | Kein MCP-Client, kein Fähigkeitsmodell im Code. Die Vision spricht von Fähigkeiten statt Anbietern, der Code kennt den Begriff nicht. |
| Lokal und Cloud | **sauber getrennt** | Ein Protokoll, Schlüssel nur aus der Umgebung, Zustimmungskarte. Der Cloud-Teil ist noch nicht auf `main`. |
| Sicherheit | **eine Lücke und eine offene Vertrauensannahme, sonst sorgfältig** | Siehe unten. |
| Laufzeitbasis | **Risiko** | `node:sqlite` ist laut ADR-001 und laut Warnung im Testlauf experimentell. Polling statt Push ist für den Chat mit einem antwortenden Modell auf Dauer zu träge. |

### Konkrete Verbesserungen

**A1. Eine Agenten-Schicht, bevor es ein Mehr-Agenten-RFC gibt.** Die Sperre „multi-agent orchestration“ verhindert derzeit auch den ersten einzelnen Agenten. Vorschlag: ein RFC „Ein Crewmitglied führt eine Mission aus“ mit einer Schnittstelle `CrewMember` im App-Server neben `Assistant`:

```text
CrewMember.run(mission, tools, report) -> Outcome
  report.activity(text)        -> Mission Event
  report.ask(question, options) -> waiting + needs_input
  report.needsApproval(action)  -> waiting + needs_approval
```

Der Core bleibt unverändert, denn `MissionService` kann das alles schon. Neu ist nur der Ausführer. Erste Implementierung: ein Agent mit zwei Werkzeugen (Datei im Projektordner lesen, Datei im Projektordner schreiben, Schreiben nur nach Freigabe). Begründung: Damit wird erstmals geprüft, ob das Missionsmodell zu echter Arbeit passt. RFC-009 nennt genau das als eigenes Risiko („Over-modeling before evidence“).

**A2. Xora wird Disponentin, nicht Arbeiterin.** Ein 2-Milliarden-Parameter-Modell mit 42 von 99 Punkten wird keine Aufgaben zuverlässig ausführen. Es kann aber: eine Bitte einer Missionsvorlage zuordnen, nachfragen, zusammenfassen, erklären, sensible Daten erkennen. Die Arbeit selbst macht ein stärkeres Modell (lokal größer oder Cloud nach Zustimmung). Diese Rollenteilung sollte in RFC-011 oder im neuen RFC ausdrücklich stehen, sonst wird Xora an Aufgaben gemessen, die sie nicht leisten kann.

**A3. Aktionen als Register statt als Fallunterscheidung.** Heute sind `ActionPayload`, `describeAction` und die Ausführung im Server getrennte, handgepflegte Stellen. Ein Register mit einem Eintrag pro Aktion (Name, Eingabeschema, Karte in beiden Sprachen, Ausführung, nötiges Recht) macht neue Fähigkeiten zu einer Datei und liefert die Werkzeugliste für das Modell automatisch. Dasselbe Register kann später MCP-Werkzeuge aufnehmen.

**A4. MCP als Client, hinter einer Rechteschicht.** Jedes Werkzeug bekommt drei Angaben: liest oder schreibt es, verlässt etwas den Rechner, kostet es Geld. Daraus ergibt sich automatisch, ob eine Karte nötig ist. Das ist der kleinste Schritt vom Fähigkeitsgedanken der Vision zu Code, ohne Registry und Router.

**A5. Kompakte Kontextpakete und einfache Suche.** Ohne Zugriff auf das Logbuch bleibt Xora ahnungslos. Zwei Schritte: erstens eine Kurzform des Kontextpakets mit Verweisen statt Wiederholungen (als offener Punkt bereits in `open-questions.md`), zweitens SQLite-Volltextsuche (FTS5) über aktuelle Revisionen. Embeddings sind dafür nicht nötig. Die Sperre für „search“ in `AGENTS.md` sollte für FTS gezielt aufgehoben werden.

**A6. Projektinhalte sind nicht vertrauenswürdig.** Sobald ein Agent Dateien oder Logbuchtexte liest, können diese Anweisungen enthalten. Regel für den neuen RFC: Gelesene Inhalte werden dem Modell als Daten gekennzeichnet übergeben, und jede schreibende oder nach außen gehende Aktion braucht eine Karte, egal was das Modell begründet. RFC-011 nennt das Risiko schon, eine Regel dafür fehlt.

**A7. Sicherheit: eine Lücke schließen, eine Annahme absichern.**

- *Host-Prüfung auf Lese-Routen.* `readWriteRequest` in `server.ts` prüft Host und Origin nur für schreibende Anfragen. `GET /api/chats`, `/api/missions` und `/api/settings` antworten jedem Host-Header. Eine fremde Webseite kann über DNS-Rebinding den Chat und die Missionen auslesen. Abhilfe: dieselbe Host-Prüfung für alle `/api`-Routen. Aufwand: klein.
- *Identität der Akteure.* Die CLI nimmt den Akteur aus `--actor` oder `LOXORA_ACTOR` (`commands.ts`). Ein Agent mit Shell-Zugriff kann sich als Mensch ausgeben und Wissen annehmen. Das ist keine unentdeckte Lücke, sondern eine dokumentierte Annahme: ADR-004 („Actors and review“) und `CLI.md` nennen die Regel ausdrücklich einen Schutz gegen versehentliche Selbstannahme und keine Sicherheitsgrenze, weil jeder mit Dateizugriff den Arbeitsbereich ändern kann. Die Annahme trägt, solange ein Mensch die Agenten selbst startet. Sie trägt nicht mehr, sobald Loxora nach A1 selbst einen Agenten ausführt. Eine Identität vom Server allein reicht dann nicht, denn ein Agent mit Dateizugriff könnte die SQLite-Datei oder `workspace.json` direkt ändern. Anforderung für den RFC zu A1: Der Ausführer läuft in einer Sandbox, hat keinen Shell-Zugriff, erreicht den Logbuch-Ordner nicht direkt und schreibt nur über die Werkzeuge, die der Server ihm gibt.
- *Lokale Prozesse.* Jedes Programm auf dem Rechner kann mit gefälschtem Origin-Header als Kapitän schreiben. Das ist für eine lokale App üblich, sollte aber in „Security and privacy“ stehen. Abhilfe später: ein zufälliges Sitzungsgeheimnis beim Start, das nur die eigene Seite kennt.

**A8. Laufzeitbasis vor dem Installer klären.** Der Installer friert die Node-Version ein. Vorher entscheiden: bei `node:sqlite` bleiben (Risiko: Verhalten ändert sich) oder auf `better-sqlite3` wechseln (Risiko: nativer Build pro Plattform). Der Port im Core macht den Wechsel billig. Außerdem prüfen, ob die Mindestversion 24.18 wirklich nötig ist: Die Tests laufen unter 22.23 durch.

**A9. Push für den Chat.** Sobald ein Modell antwortet, sollte der Text fließen (Server-Sent Events). RFC-010 schiebt das auf, „bis ein Bedarf nachgewiesen ist“. Der Bedarf entsteht mit Milestone 16.

---

## 3. Features

### Was für ein brauchbares Produkt fehlt

| Priorität | Feature | Warum |
|---|---|---|
| **Must** | Eine Mission in der App anlegen („Xora, ich brauche …“) | Heute nur über `loxora mission create`. Ohne das ist die Brücke eine Anzeige. |
| **Must** | Mindestens ein Crewmitglied, das eine Mission wirklich ausführt | Kern des Versprechens (A1). |
| **Must** | Ein Ergebnis, das man anfassen kann: eine Datei im Projektordner, mit Vorschau und „Im Ordner zeigen“ | Nicht-Entwickler messen Nutzen am Ergebnis, nicht am Zustand. |
| **Must** | Windows-Installer mit gebündelter Laufzeit und Modell, Start über ein Symbol | `npm ci`, `npm run build`, PowerShell und zwei Fenster sind für die Zielgruppe ausgeschlossen. |
| **Must** | Xora kann anlegen, was sie erklärt: Projekt, Mission, Kanal | Der Chat-Prompt sagt heute wörtlich: „Du kannst aus dem Gespräch heraus noch nichts anlegen.“ |
| **Must** | Rückgängig für die letzte Aktion | Bestätigungskarten schützen vor dem Schreiben, nicht danach. Für Unerfahrene ist „Zurücknehmen“ wichtiger als „Bestätigen“. |
| **Should** | Bestehenden Ordner als Projekt hinzufügen (nur lesen) | In der Einrichtung sichtbar, aber inaktiv. Die meisten Menschen haben schon Dateien. |
| **Should** | Stärkeres Modell mit einem Klick: Empfehlung nach Hardware, Download nach Zustimmung | Die Arbeit braucht mehr als E2B (A2). |
| **Should** | Privatsphäre-Schleuse (Kapitel 1) | Alleinstellungsmerkmal, passt zum kleinen lokalen Modell. |
| **Should** | Missionsvorlagen (fünf bis zehn mitgeliefert) | Nimmt die Angst vor dem leeren Eingabefeld. |
| **Should** | Suche über Logbuch und Chat | Ein Gedächtnis ohne Suche wird nicht benutzt. |
| **Should** | Sicherung und Wiederherstellung per Knopf | Export existiert in der CLI, die Sicherungskopie vor Migrationen existiert in der App. Der Schritt zur Funktion ist klein. |
| **Could** | Spracheingabe lokal | Vision, Barrierefreiheit. Erst wenn Text gut funktioniert. |
| **Could** | Mehrere Agenten in einem Kanal, `@`-Ansprache | Erst sinnvoll, wenn einer funktioniert. |
| **Could** | Mehrere Personen auf einem Schiff | Familien, Vereine, Klassen. |
| **Could** | Xora passt die Oberfläche an | Reizvoll, aber kein Problem eines ersten Nutzers. |
| **Später** | Compute-Router, Cloud-Burst, Hub, Gateway | Erst nach belegter Nutzung. |

### Features, die die Idee stark machen würden

1. **„Was habe ich verpasst?“** Beim Öffnen fasst Xora zusammen: was erledigt wurde, was auf dich wartet, was schiefging. Technisch eine Zusammenfassung über Missions-Ereignisse seit dem letzten Besuch, für ein kleines Modell gut machbar.
2. **Entscheidungsprotokoll in Klartext.** Jede Antwort auf eine Frage der Crew wird eine lesbare Zeile im Logbuch: „12. November: Du hast entschieden, dass die Einladung per Du formuliert wird.“ Das ist das Wissensmodell, übersetzt für Menschen, und erklärt nebenbei, wozu das Logbuch gut ist.
3. **Der sichtbare Schleusenbericht.** Nach jeder Cloud-Anfrage auf Wunsch einsehbar: was gesendet wurde, was ersetzt wurde. Vertrauen entsteht durch Nachsehen können.
4. **Probelauf.** Eine Mission erst als Plan zeigen („Das würde ich tun: 1, 2, 3“), dann ausführen. Passt zum Vorschlagsprinzip und fängt Missverständnisse vor der Arbeit ab.

---

## 4. Benutzeroberfläche und Bedienbarkeit

Grundlage: eigener Durchlauf im Skriptmodus auf Deutsch, plus `labels.ts`, `styles.css` und die Playwright-Tests. Kein Test mit echten Personen. Den gab es laut RFC-011 Abschnitt 10 bisher auch nicht: Stufe 1 war eine Simulation, Stufe 2 lief ohne Menschen.

### Onboarding

**Gut:** Antworten per Tippen oder Schreiben, kein Warten auf das Modell, jede Karte sagt, was geschrieben wird, „Ändern“ statt Zurück, Wiederaufnahme nach Neuladen, ehrlicher Status „Skriptmodus“, die Bordbegriffe klappen beim ersten Auftreten auf.

**Probleme und Vorschläge:**

| Befund | Vorschlag |
|---|---|
| Die Einrichtung endet ohne Nutzen. Nach sechs Schritten folgt eine Übungsmission, in der man beantwortet, für wen das Projekt ist. | Die erste Mission muss ein kleines echtes Ergebnis liefern, zum Beispiel einen Einseiter „Mein Vorhaben“ als Datei im Projektordner. |
| Die Projektkarte sagt: „Dazu drei Bereiche, also Abschnitte im Logbuch: Ideen, Aufgaben, Entscheidungen. Im Bereich Ideen lege ich die Sammlung Projektziel an.“ Drei neue Begriffe in zwei Sätzen, ohne dass der Nutzer etwas davon braucht. | Bereiche und Sammlung still anlegen und erst zeigen, wenn dort etwas liegt. Auf der Karte nur: Name und Zweck. |
| Der neue Schritt „Xora“ (Modellwahl direkt nach dem Namen, Milestone 16) stellt die technischste Frage des ganzen Produkts an zweiter Stelle. | Im Normalfall überspringen. Nur einen Satz zeigen („Ich arbeite gerade mit einem kleinen Modell auf deinem Computer“) und die Wahl ins Detailfeld auf der Brücke legen. |
| Schiffsname und Projektname sind zwei Benennungen direkt nacheinander. | Schiffsnamen vorschlagen und per Klick übernehmen, wie heute, aber als einen Satz mit dem Namen der Person: „Alex, dein Schiff heißt Nova. Passt das?“ |
| Unterzeile im Logo: „LOCAL · KNOWLEDGE · CREW“ steht auch in der deutschen Oberfläche auf Englisch. | Übersetzen oder weglassen. |

### Brücke

**Gut:** `#entscheidungen` steht ganz oben und ist rot. Die Mission läuft als Thread im Projektkanal. Die Karte „Das schreibe ich ins Logbuch“ ist ein starkes Muster. Auf 390 Pixel Breite klappt das Layout sauber auf „Kanäle“ und „Details“ um.

**Probleme und Vorschläge:**

| Befund | Vorschlag |
|---|---|
| Der Chat-Messenger ist ein Muster für Teams. Für eine Person mit einer Helferin sind Kanäle, Direktnachrichten, Threads und „Neuer Kanal“ Struktur ohne Inhalt. | Für die erste Version zwei Ebenen: „Heute“ (was mich braucht und was zuletzt geschah) und das Gespräch mit Xora. Kanäle erst zeigen, wenn es ein zweites Projekt oder ein zweites Crewmitglied gibt. |
| Das Eingabefeld sagt „Neues Thema mit Xora …“, die Detailspalte sagt aber „Antwortet mit festen Texten“. Das Feld lädt zu etwas ein, das nicht geht. | Im Skriptmodus drei bis fünf antippbare Fragen statt eines freien Felds, wie in der Einrichtung. |
| Kopfzeile: „Akteur: alex“. Das ist ein interner Begriff. | „Kapitän: Alex“ oder nur der Name. |
| Zwei Reiter „Brücke“ und „Missionen“ plus „Alle Missionen“ unten links plus `#entscheidungen`: vier Wege zu fast derselben Liste. | Ein Weg: die Liste dessen, was den Kapitän braucht, mit Filter „alle“. |
| „Noch keine Crew“ ohne Hinweis, wie man eine bekommt. | Leerzustand mit einem Satz und einem Knopf, wie überall sonst. Solange es keine Crew gibt: ehrlich sagen, wann sie kommt. |
| Die Brücke nutzt eine andere Textschrift als die Einrichtung (im Durchlauf sichtbar: Exo 2 in der Einrichtung, eine Systemschrift auf der Brücke). | Eine Textschrift für die ganze App. |

### Missionsliste und Missionsdetail

Die Statuslogik ist gut: Farbe plus Text, Reihenfolge nach Aufmerksamkeit, „Entscheidung erforderlich“ mit Optionen und Folgen. Zwei Punkte:

- Die Filter „Läuft, Wartet, Benötigt Input, Abgeschlossen, Fehlgeschlagen“ bilden die Zustandsmaschine ab. Für Nutzer reichen drei: „Braucht dich“, „In Arbeit“, „Fertig“. „Benötigt Input“ ist Denglisch.
- Ein fehlgeschlagener Zustand zeigt, was passiert ist, aber nicht, was man tun kann. Jede Fehlermeldung braucht einen nächsten Schritt („Noch einmal versuchen“, „Xora fragen“).

### Verständlichkeit der Schiffsbegriffe

Behalten: Kapitän, Crew, Mission, Logbuch, Brücke, Xora. Diese sechs erklären sich fast selbst.

Streichen oder verstecken: Bereich, Sammlung, Bordcomputer als eigener Akteur, Stationen, Skriptmodus (besser: „Xora antwortet gerade nur auf Knopfdruck“), Akteur, Thread (besser: „Verlauf“).

Regel: Ein Schiffsbegriff ist nur erlaubt, wenn er ein Alltagswort ersetzt, das schwerer wäre. „Logbuch“ ersetzt „Wissensspeicher“: Gewinn. „Bereich“ ersetzt „Ordner“: Verlust.

### Barrierefreiheit

**Gelesen:** Sprunglink, sichtbarer Tastaturfokus, Status als Text und Farbe, semantische Bereiche, 58 ARIA-Angaben im Client, eine Regel für reduzierte Bewegung, höfliche Ansage neuer Nachrichten.

**Lücken:**

- **Schriftgrößen in Pixeln, viele davon klein.** `styles.css` enthält 10, 12 und 13 Pixel für Beschriftungen, oft in Großbuchstaben mit Sperrung und in Monospace. Das ist für viele Menschen über 45 schwer lesbar. Vorschlag: Mindestgröße 14 Pixel, Angaben in `rem`, eine Einstellung „Große Schrift“.
- **Kontrast nicht gemessen.** Graue Zusatztexte auf dunklem Blau sehen im Durchlauf grenzwertig aus. Eine automatische Prüfung (axe im Playwright-Lauf) fehlt.
- **Kein helles Design und kein Modus für hohen Kontrast.** Ein dunkles Neon-Design ist Geschmack, für manche Sehbehinderungen aber ein Ausschluss.
- **Kein Test mit einem Screenreader** ist dokumentiert.

### Fehlerfälle

Gut gelöst: kaputte Einstellungsdatei wird nie überschrieben, Modell fällt aus und der Skriptmodus übernimmt, zu wenig Speicher, veraltetes Logbuch mit Sicherung per Knopf, Logbuch im OneDrive-Ordner mit Warnung.

Offen: Was sieht die Person, wenn der Server-Prozess beendet wurde und das Browserfenster noch offen ist? Was, wenn zwei Fenster offen sind? Was, wenn der Ordner des Logbuchs verschoben wurde? Und die größte Lücke: Es gibt kein Programmfenster. Wer den Browser-Tab schließt, weiß nicht, ob Loxora noch läuft. Das löst erst die Entscheidung über die Verpackung (Kapitel 8, E5).

---

## 5. Arbeitspakete

Aufwand für eine Person mit KI-Unterstützung: **S** bis zwei Tage, **M** bis eine Woche, **L** zwei bis vier Wochen.

### Research

| Nr. | Paket | Ziel | Ergebnis | Abhängig von | Aufwand | Abnahmekriterium |
|---|---|---|---|---|---|---|
| R1 | Wettbewerb und Lücke | Wissen, wogegen Loxora antritt | Tabelle mit acht bis zehn Werkzeugen: Zielgruppe, lokal oder Cloud, Freigaben, Gedächtnis, Preis; ein Absatz „Loxora ist das einzige Werkzeug, das …“ | – | S | Der Satz lässt sich mit der Tabelle belegen, oder die Positionierung wird geändert |
| R2 | Fünf Gespräche mit Nicht-Entwicklern | Zielgruppe und ersten Anwendungsfall festlegen | Notizen zu fünf Gesprächen (je 30 Minuten): Welche wiederkehrende Aufgabe würden sie abgeben? Was dürfte den Rechner verlassen? | – | M | Mindestens drei Personen nennen dieselbe Art Aufgabe |
| R3 | Nutzertest der Einrichtung | Prüfen, ob die Erfolgskriterien aus RFC-011 Abschnitt 10 stimmen | Drei bis fünf Personen durchlaufen Einrichtung und erste Mission, Bildschirm aufgezeichnet, ohne Hilfe | Lauffähiger Stand auf einem Testrechner | M | Zeit bis zur Brücke, Zahl der Stockungen, und ob die Person Xora, Crew und Mission in eigenen Worten erklären kann |
| R4 | Ausführendes Modell | Wissen, welches Modell eine Mission mit Werkzeugen zuverlässig schafft | Auswertung wie bei Xora: 20 Aufgaben mit zwei Werkzeugen, lokal 4B, 12B und eine Cloud-Stufe | Werkzeugschnittstelle aus P1 | M | Ein Modell erreicht mindestens 80 Prozent, sonst ist Cloud für die Arbeit Pflicht |
| R5 | Verpackung | Entscheidungsgrundlage für E5 | Zwei Mini-Prototypen (Browser plus Tray-Symbol, Desktop-Hülle), je mit Größe, Startzeit, Update-Weg, Signierbarkeit | – | M | Tabelle mit Messwerten auf Olivers Windows-PC |
| R6 | Modell-Lizenz und Weitergabe | C3-Entscheidung zum Modell vorbereiten | Kurzvermerk: Darf Gemma 4 E2B im Installer liegen, unter welchen Bedingungen, welche Hinweise sind nötig | – | S | Klare Ja/Nein-Aussage mit Quelle. Juristische Prüfung bleibt beim Auftraggeber |
| R7 | Privatsphäre-Schleuse | Machbarkeit mit kleinem Modell | 50 Sätze mit Namen, Adressen, Beträgen: Erkennungsrate und Fehlalarme von E2B, verglichen mit Regeln | – | S | Erkennungsrate und Fehlalarmrate liegen vor, Entscheidung „Modell, Regeln oder beides“ ist möglich |
| R8 | Speicherbedarf unter Windows | Offener Punkt aus Milestone 16 Abschnitt 9 | Spitzenwert von `llama-server` mit E2B, Kaltstartzeit im verwalteten Modus | PR #56 | S | Werte stehen in `MILESTONE-16.md`, Schwelle ist gesetzt |

### Proof of Concept

| Nr. | Paket | Ziel | Ergebnis | Abhängig von | Aufwand | Abnahmekriterium |
|---|---|---|---|---|---|---|
| P1 | Ein Crewmitglied, eine Mission | Zeigen, dass das Missionsmodell echte Arbeit trägt | RFC plus Prototyp: Agent mit „Datei lesen“ und „Datei schreiben“ im Projektordner, meldet Schritte, fragt nach, legt eine Datei ab | E3, E4 | L | Eine Mission „Schreibe einen Einseiter zu meinem Vorhaben“ läuft von Start bis Datei durch, mit einer Rückfrage und einer Freigabe |
| P2 | Mission aus dem Chat | Xora nimmt eine Bitte an und macht daraus eine Mission | Aktion `propose_mission` mit Karte | P1 teilweise | M | Aus fünf frei formulierten Bitten entstehen fünf sinnvolle Missionskarten, oder Xora fragt nach |
| P3 | Aktionsregister | Neue Fähigkeit in einer Datei | Umbau von `ActionPayload` auf ein Register (A3) | – | M | Bestehende Tests grün, eine neue Aktion braucht eine Datei |
| P4 | Schleuse | Privatsphäre als Funktion | Ersetzen und Zurücksetzen von Namen vor einer Cloud-Anfrage, mit Bericht | R7, Cloud-Lieferung aus M16 | M | In zehn Beispielanfragen verlässt kein markierter Name den Rechner (per Test belegt) |
| P5 | Logbuch-Zugriff für Xora | Xora beantwortet Fragen zum Projekt | Volltextsuche plus Kurzform des Kontextpakets | Aufhebung der Suchsperre | M | Xora beantwortet „Was haben wir zum Thema X entschieden?“ mit Verweis auf den Eintrag, in unter 1.500 Tokens Kontext |

### MVP

| Nr. | Paket | Ziel | Ergebnis | Abhängig von | Aufwand | Abnahmekriterium |
|---|---|---|---|---|---|---|
| M1 | Sicherheit und Aufräumen | Lücke aus A7 schließen | Host-Prüfung auf allen Routen, Hinweis auf lokale Prozesse in der Doku, englische Reste entfernt | – | S | Test: Lese-Anfrage mit fremdem Host wird abgelehnt |
| M2 | Milestone 16 abschließen | Xora mit lokalem Modell | PR #56 und Cloud-PoC, Messwerte aus R8 | R8 | M | Windows-Check aus `MILESTONE-16.md` bestanden |
| M3 | Vereinfachte Brücke | Erste Version für eine Person | „Heute“-Ansicht, eine Missionsliste, Kanäle erst bei Bedarf, drei Statusgruppen | R3 | M | Im Nutzertest findet jede Person ohne Hilfe, was auf sie wartet |
| M4 | Onboarding mit echtem Ergebnis | Nutzen in den ersten zehn Minuten | Einrichtung in vier Schritten, erste Mission liefert eine Datei | P1, R3 | M | Drei von fünf Testpersonen haben nach zehn Minuten eine Datei im Projektordner |
| M5 | Drei Missionsvorlagen | Nicht vor dem leeren Feld stehen | Vorlagen für den in R2 gewählten Anwendungsfall | R2, P1 | M | Jede Vorlage läuft zehnmal hintereinander durch |
| M6 | Rückgängig und Sicherung | Vertrauen | „Zurücknehmen“ für die letzte geschriebene Datei, Sicherung per Knopf | P1 | M | Test: Datei nach Rücknahme identisch zum Stand davor |
| M7 | Barrierefreiheit Grundstufe | Lesbar für alle | Mindestschrift 14 Pixel, `rem`, axe-Prüfung im Playwright-Lauf, helles Design | – | M | axe ohne kritische Befunde auf Einrichtung und Brücke |
| M8 | Windows-Installer | Start per Symbol | Installer mit Laufzeit, Modell, Symbol, Deinstallation, unsigniert | E5, R5, R6, A8 | L | Installation auf einem frischen Windows ohne Node, ohne Konsole, unter zehn Minuten |
| M9 | Bestehenden Ordner hinzufügen | Mit eigenen Dateien arbeiten | Nur lesender Zugriff auf einen gewählten Ordner | P1, A6 | M | Agent kann eine vorhandene Datei zusammenfassen, schreibt nie in den Ordner |

### Danach

| Nr. | Paket | Ziel | Abhängig von | Aufwand |
|---|---|---|---|---|
| D1 | Modellempfehlung nach Hardware mit Download | Stärkere lokale Arbeit | M8, R4 | M |
| D2 | MCP-Client mit Rechteschicht | Werkzeuge von außen | P3, A4 | L |
| D3 | Zweites Crewmitglied, Ansprache mit `@` | Mehr-Agenten-Betrieb | P1 stabil | L |
| D4 | Spracheingabe lokal | Barrierefreiheit, Vision | M7 | L |
| D5 | Mehrere Personen auf einem Schiff | Familien, Vereine, Klassen | Rechtekonzept | L |
| D6 | Signierter Installer und Updates | Raus aus der Testphase | M8, Lizenzprüfung SignPath | M |
| D7 | Englische und deutsche Kurzanleitung, Webseite | Community-Tester gewinnen | M8 | S |

---

## 6. Modellwahl für Kosten und Tokens

Preisverhältnis laut Anbieter-Preisliste (Stand Anfang November 2026, pro Million Tokens Eingabe und Ausgabe): Haiku 5.5 etwa 0,10 und 0,50 Dollar, Sonnet 5.5 etwa 2 und 10, Opus 5.5 etwa 4 und 20, Fable 5.2 etwa 8 und 40. Fable kostet also rund 80-mal so viel wie Haiku, Opus rund 40-mal, Sonnet rund 20-mal. Im Abo zählt statt Dollar das Nutzungslimit, das Verhältnis ist aber ähnlich. Vor größeren Läufen die aktuelle Preisliste prüfen.

| Paket | Modell | Begründung |
|---|---|---|
| R1 Wettbewerb | Sonnet mit Websuche | Recherche und Tabelle, kein Architektururteil. Den Schlusssatz von Opus prüfen lassen. |
| R2, R3 Gespräche und Nutzertest | kein Modell für die Durchführung, Haiku für das Zusammenfassen der Notizen | Die Arbeit ist menschlich. Zusammenfassen ist Routine. |
| R4 Ausführendes Modell | lokal für die Läufe, Sonnet für das Skript | Das Auswertungsskript existiert als Muster (`run.mjs`). |
| R5 Verpackung | Sonnet | Zwei kleine Prototypen nach bekannten Mustern. |
| R6 Lizenz | Sonnet, Ergebnis vom Menschen geprüft | Lesen und Zusammenfassen. Keine Rechtsberatung durch ein Modell. |
| R7 Schleuse | lokal (E2B) für die Läufe, Haiku für die Testsätze | Testdaten erzeugen ist Routine. |
| R8 Speicher | kein Modell | Messen im Task-Manager. |
| P1 Crewmitglied | **Opus oder Fable für den RFC**, Sonnet für die Umsetzung | Wichtigste Architekturentscheidung des Jahres. Hier lohnt das teure Modell, aber nur für das Dokument. |
| P2 Mission aus dem Chat | Sonnet | Folgt dem Muster von `propose_project`. |
| P3 Aktionsregister | Sonnet, Review durch Opus | Umbau mit guter Testabdeckung. |
| P4 Schleuse | Sonnet, Sicherheitsreview durch Opus | Fehler sind hier teuer, die Umsetzung selbst ist überschaubar. |
| P5 Logbuch-Zugriff | Sonnet | SQLite-FTS und eine Ausgabeform. |
| M1 Sicherheit | Sonnet | Kleine, klar beschriebene Änderungen. |
| M2 Milestone 16 | Sonnet | Das Milestone-Dokument ist sehr genau. |
| M3, M4 Brücke und Onboarding | Sonnet für den Code, **Haiku für alle Texte und Übersetzungen** | `labels.ts` hat 1.400 Zeilen. Textarbeit in zwei Sprachen ist das beste Sparfeld. |
| M5 Vorlagen | Haiku für Entwürfe, Sonnet für die Prüfung | Viel Text, wenig Logik. |
| M6 Rückgängig | Sonnet | |
| M7 Barrierefreiheit | Haiku für die CSS-Umstellung, Sonnet für das helle Design | Suchen und Ersetzen mit Regeln. |
| M8 Installer | Sonnet, **Opus für den ADR** | Viele Detailfallen unter Windows. Die Entscheidung einmal gründlich, die Umsetzung normal. |
| M9 Ordner hinzufügen | Sonnet, Sicherheitsreview durch Opus | Unvertrauenswürdige Inhalte (A6). |
| Tests schreiben und erweitern | Haiku | Die Testmuster sind im Repository einheitlich. |
| Doku-Indexe, Querverweise, Changelogs | Haiku | Reine Fleißarbeit, heute vermutlich mit dem teuersten Modell erledigt. |
| Reviews von Pull Requests | Sonnet standardmäßig, Opus bei Core, Migrationen, Sicherheit | |
| Projekt-Reviews wie dieses | Fable oder Opus, höchstens einmal im Quartal | Braucht die ganze Doku im Kontext und kostet entsprechend. |

### Tipps zum Token-Sparen

1. **Die Pflichtlektüre in `AGENTS.md` kürzen.** Dreizehn Dokumente vor jeder Aufgabe sind grob 40.000 bis 60.000 Tokens, bevor eine Zeile Code gelesen ist. Vorschlag: ein Dokument `docs/CONTEXT.md` mit höchstens 200 Zeilen (Stand, Regeln, Paketkarte, Verweise) als einzige Pflicht. Alles andere nach Bedarf.
2. **Milestone-Dokumente schrumpfen.** `MILESTONE-13` bis `-16` haben je 17 bis 21 KB. Ein Milestone braucht: Ziel, Umfang, Nicht-Umfang, Abnahme. Entscheidungen gehören in den ADR, nicht doppelt hinein.
3. **Amendments einarbeiten.** RFC-011 hat 40 KB, davon mehr als die Hälfte Amendments, die frühere Abschnitte überschreiben. Ein Modell muss alles lesen und im Kopf zusammenführen. Einmal konsolidieren, die alte Fassung bleibt in der Git-Historie.
4. **Aufgaben klein schneiden und eine neue Sitzung pro Aufgabe.** Lange Sitzungen schleppen alten Kontext mit. Die Lieferungen pro Milestone sind schon ein guter Schnitt.
5. **Erst planen lassen, dann bauen lassen.** Ein kurzer Plan von Opus (wenige hundert Tokens Ausgabe), umgesetzt von Sonnet, ist billiger als Opus für alles.
6. **Übersetzungen und Textvarianten gebündelt an Haiku geben,** mit dem Glossar der Bordbegriffe als festem Vorspann. Gleichbleibende Vorspanne nutzen den Zwischenspeicher des Anbieters, der gelesene Tokens stark verbilligt.
7. **Nicht eilige Massenarbeit im Stapel.** Die Stapelverarbeitung der Anbieter kostet etwa die Hälfte. Das passt für Übersetzungen, Testdaten und Auswertungen.
8. **Lokal, wo es reicht.** Testsätze variieren, Texte glätten und grobe Klassifikation kann ein lokales 4B- oder 12B-Modell. Für Code im Repository reicht es nicht.
9. **Zwei Spuren im Prozess.** Experimente auf einem `spike/`-Zweig ohne RFC, mit einer Seite Befund am Ende. Erst was bleibt, bekommt RFC und Milestone. Das spart die teuersten Tokens: die für Dokumente zu Dingen, die wieder verworfen werden (Beispiel: der 2D-Brücken-Visualizer, in zwei Tagen beschlossen und ersetzt).

---

## 7. Gesamtplan

Reihenfolge nach dem Grundsatz: erst belegen, dass jemand das will, dann beweisen, dass es geht, dann verpacken.

```text
Phase 0  Aufräumen und Entscheiden          (1 bis 2 Wochen)
Phase 1  Wissen, für wen und was            (2 bis 3 Wochen, parallel zu Phase 2)
Phase 2  Die Crew arbeitet                  (4 bis 6 Wochen)
Phase 3  Erste Version für Testpersonen     (4 bis 6 Wochen)
Phase 4  Installer und öffentlicher Test    (3 bis 4 Wochen)
Phase 5  Ausbau nach Rückmeldung
```

Die Wochenangaben sind Schätzungen für eine Person in Teilzeit und nicht belastbar.

| Phase | Pakete | Meilenstein | Woran man ihn erkennt |
|---|---|---|---|
| 0 | M1, M2, R8, Entscheidungen E1 bis E4, Doku-Diät (Tipps 1 bis 3) | **„Sauberer Stand“** | Milestone 16 ist zu, die Sicherheitslücke ist geschlossen, `README.md` beschreibt das Produkt, das gebaut wird |
| 1 | R1, R2, R3, R6 | **„Wir wissen, für wen“** | Eine Zielgruppe, ein Anwendungsfall, ein Positionierungssatz, mit Belegen aus Gesprächen |
| 2 | P1, P3, R4, P2, P5 | **„Erste echte Mission“** | Eine frei formulierte Bitte führt zu einer Datei im Projektordner, mit Rückfrage und Freigabe |
| 3 | M3, M4, M5, M6, M7, R7, P4 | **„Fünf Fremde“** | Fünf Personen ohne Programmierkenntnisse erledigen auf Olivers Rechner oder per Fernsitzung eine eigene Aufgabe, drei davon würden es wieder benutzen |
| 4 | R5, M8, M9, D7 | **„Öffentlicher Test“** | Installer zum Herunterladen, Anleitung, Aufruf an die Community |
| 5 | D1 bis D6 nach Bedarf | **„Version 1“** | Signierter Installer, Updates, stabile Nutzung über vier Wochen |

### Was genau untersucht werden muss und wie

- **R1 Wettbewerb:** Acht bis zehn Werkzeuge selbst installieren oder die öffentliche Doku lesen. Pro Werkzeug dieselbe kleine Aufgabe („Schreibe eine Einladung und lege sie als Datei ab“) und sechs Fragen: Für wen? Lokal möglich? Was verlässt den Rechner? Wie wird freigegeben? Merkt es sich etwas über Sitzungen? Was kostet es? Ergebnis als Tabelle in `docs/research/`.
- **R2 Gespräche:** Fünf Personen aus dem eigenen Umfeld, die nicht programmieren und unterschiedlich arbeiten (Verein, Selbstständige, Lehrkraft, Büro, Rente). Kein Produkt zeigen. Fragen: Welche Aufgabe am Rechner nervt jede Woche? Wie lösen sie sie heute? Was haben sie mit KI schon probiert und warum aufgehört? Was dürfte auf keinen Fall ins Internet? Auswertung: Aufgaben nach Häufigkeit sortieren.
- **R3 Nutzertest:** Aufgabe vorlesen („Richte das Programm ein und lass dir beim Start deines Vorhabens helfen“), dann schweigen. Laut denken lassen. Messen: Zeit, Stockungen über zehn Sekunden, Rückfragen. Danach drei Fragen: Was ist Xora? Was ist eine Mission? Was würdest du als Nächstes tun? Drei Personen reichen für die gröbsten Probleme.
- **R4 Ausführendes Modell:** Das Muster von `docs/research/xora-model-evaluation/` übernehmen. 20 Aufgaben, die die zwei Werkzeuge aus P1 brauchen, je dreimal. Prüfen: richtiges Werkzeug, richtige Reihenfolge, Rückfrage bei Unklarheit, keine Aktion außerhalb des Ordners. Kandidaten: ein lokales Modell mit etwa 4 Milliarden Parametern, eines mit etwa 12 Milliarden, eine günstige und eine mittlere Cloud-Stufe.
- **R5 Verpackung:** Zwei Wegwerf-Prototypen, die nur die bestehende App starten. Messen auf Olivers PC: Größe des Installers, Zeit bis zum ersten Fenster, Speicher im Leerlauf, Verhalten beim Schließen des Fensters, Aufwand für Updates.
- **R7 Schleuse:** 50 deutsche und englische Sätze mit markierten Namen, Orten, Beträgen, Kontonummern. Drei Verfahren vergleichen: nur Regeln, nur E2B, beides. Zählen: gefunden, übersehen, fälschlich ersetzt.

---

## 8. Offene Entscheidungen

„Bis wann“ ist relativ zu den Phasen aus Kapitel 7.

| Nr. | Frage | Optionen und Folgen | Empfehlung | Bis wann |
|---|---|---|---|---|
| E1 | **Für wen ist die erste Version?** | (a) Nicht-Entwickler mit Schreib- und Organisationsarbeit: einfache Werkzeuge, große Zielgruppe, das Wissensmodell muss vereinfacht werden. (b) Entwickler und Bastler: der Kern passt, aber starker Wettbewerb und das Raumschiff-Design wirkt dort eher verspielt. (c) Beide: zwei Onboardings, doppelter Aufwand. | **(a)**, mit Oliver selbst als Entwickler-Nutzer über die CLI nebenher | Phase 0, nach R2 bestätigen |
| E2 | **Was ist Loxora in einem Satz?** | (a) „Projektgedächtnis für KI-Arbeit“ (heutiges README). (b) „Deine KI-Crew, die fragt, bevor sie handelt, und nichts vergisst“. (c) „Der private KI-Assistent, der auf deinem Rechner bleibt“. | **(b) mit (c) als Beweis.** README und Vision danach angleichen | Phase 0 |
| E3 | **Wie kommt die erste Crew an Bord?** | (a) Eigene kleine Agentenschleife im App-Server: volle Kontrolle über Freigaben, mehr eigener Code. (b) Vorhandene Coding-Agenten über einen Adapter anbinden: schnell für Oliver, für Nicht-Entwickler unbrauchbar (Installation, Abo, Nutzungsbedingungen). (c) Nur beobachten wie heute: kein Produkt. | **(a)**, mit (b) als späterem Adapter | Vor Phase 2 |
| E4 | **Welches Modell macht die Arbeit?** | (a) Nur lokal: privat, aber auf üblichen Rechnern wahrscheinlich zu schwach (R4 prüft das). (b) Cloud nach Zustimmung als Normalfall für Arbeit, Xora lokal als Disponentin und Schleuse: brauchbar, braucht Schlüssel oder Abo. (c) Nur Cloud: widerspricht lokal zuerst. | **(b)**, mit ehrlicher Anzeige. Nach R4 neu prüfen | Vor Phase 2, endgültig nach R4 |
| E5 | **Browser-Tab oder eigenes Fenster?** | (a) Browser plus Symbol in der Taskleiste: klein, schnell gebaut, fühlt sich nicht wie ein Programm an. (b) Desktop-Hülle mit eigenem Fenster (Tauri oder Electron): fühlt sich richtig an, größer, mehr Pflege. | **(b) mit einer schlanken Hülle,** nach den Messwerten aus R5 | Vor Phase 4 |
| E6 | **Wird das Wissensmodell für Nicht-Entwickler vereinfacht?** | (a) So lassen: Bereiche, Sammlungen, Quellen, Belege sichtbar. (b) Kern behalten, Oberfläche zeigt nur „Logbucheintrag“ und „Entscheidung“: ein Tag Konzept, wenig Code. (c) Kern verschlanken: großer Umbau, verliert die Stärke. | **(b)** | Vor Phase 3 |
| E7 | **Wie streng bleibt der Prozess?** | (a) Wie heute: jede Änderung über RFC, ADR, Milestone. (b) Zwei Spuren: Experimente frei auf `spike/`-Zweigen, nur Bleibendes bekommt Dokumente. (c) Doku nachträglich: schneller, verliert die Nachvollziehbarkeit. | **(b),** plus Kürzung der Pflichtlektüre | Phase 0 |
| E8 | **Bleibt Gemma 4 E2B als Xora und darf es in den Installer?** | (a) Ja, nach Lizenzprüfung. (b) Kein Modell bündeln, beim ersten Start mit Zustimmung laden: kleiner Installer, braucht Internet einmalig, ändert RFC-011 Abschnitt 11. (c) Anderes Modell. | **(b),** falls R6 Zweifel lässt, sonst (a) | Vor Phase 4 |
| E9 | **Bleibt der Messenger-Aufbau der Brücke?** | (a) Ja, vollständig. (b) Ja als Datenmodell, aber die erste Version zeigt nur „Heute“ und das Gespräch mit Xora. (c) Zurück zur reinen Missionsliste. | **(b)**. ADR-007 bleibt gültig, es ändert sich nur, was sichtbar ist | Vor Phase 3, nach R3 |
| E10 | **Wann kommen Testpersonen?** | (a) Erst mit Installer. (b) Jetzt, auf Olivers Rechner oder per Bildschirmfreigabe. | **(b)**. Jede Woche ohne fremde Augen vergrößert das Risiko, am Bedarf vorbeizubauen | Sofort |
| E11 | **CLA vor dem ersten fremden Beitrag?** | (a) Bei DCO bleiben (heutiger Stand in `CONTRIBUTING.md`): einfach, aber ein späterer Lizenzwechsel oder Doppellizenz braucht die Zustimmung aller. (b) CLA einführen: hält Geschäftsmodelle offen, schreckt manche Beitragende ab. | **(a) vorerst,** neu entscheiden, sobald ein bezahltes Angebot konkret wird | Vor dem öffentlichen Aufruf |
| E12 | **Bleibt `node:sqlite`?** | (a) Ja: keine nativen Abhängigkeiten, aber experimentell. (b) Wechsel auf eine stabile Bibliothek: natives Modul pro Plattform. | **(a),** aber Node-Version im Installer festnageln und die Entscheidung im Verpackungs-ADR festhalten | Vor Phase 4 |
| E13 | **Sprache der Doku?** | (a) Englisch wie heute: offen für Beitragende, für Oliver und Modelle doppelte Übersetzungsarbeit. (b) Entscheidungen auf Deutsch, öffentliche Doku auf Englisch. | **(a) für alles Öffentliche,** aber kürzer. Reviews und Entscheidungsnotizen wie dieses dürfen deutsch sein | Phase 0 |

---

## Was dieses Review nicht ist

Es ändert keinen Code und keine bestehenden Dokumente. Es gibt nichts frei: Jeder Vorschlag hier braucht nach RFC-008 seinen eigenen Weg (RFC, ADR oder Entscheidung des Auftraggebers). Wo ich Wettbewerber, Marktgrößen oder das Verhalten echter Nutzer einschätze, sind das Annahmen, die die Research-Pakete R1 bis R3 prüfen sollen.
