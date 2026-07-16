# Local Web UI

The React 19/Vite 8 UI is a local inspector and controller. It renders server/Core results without reimplementing Current selection, History order, severity, Assessment applicability, dependency traversal, freshness, or budgeting.

## Guided and Explore modes

Guided Demo presents nine steps, a persistent progress rail, contextual explanation, one dominant server-provided action, and revalidated result summaries. Explore retains free navigation through Projects, Spaces, Collections, Nodes, Review Inbox, Impact, Planned Knowledge, Context, Evidence, Sources, and MCP proof.

Only the presentation preference is stored in the browser. Canonical stage, action eligibility, receipt validity, Context readiness, and parity completion come from the local server. Direct or future URLs cannot grant unavailable operations.

## Human-first presentation

- Home leads with the project-memory problem and keeps diagnostics secondary.
- Review cards explain the decision and preserve Evidence access.
- Project Maps present `DependsOn` and `DependedOnBy` as relationship cards.
- Node views label Current, Historical, and Planned with text and semantic color.
- History renders Core lineage order as V1→V2→V3.
- Impact displays provider, reverse traversal, consumer, severity, both freshness values, and Evidence.
- Context shows counts, ordered entries, reasons, Evidence, and budget before normalized JSON.
- MCP proof compares fingerprints, Revisions, Evidence, paths, Assessments, budget, and warnings.
- Evidence and Source routes expose existing read APIs without fetching locators.

Technical identifiers, correlations, locators, fingerprints, omissions, and normalized JSON remain available through disclosures.

## Boundaries and accessibility

Browser-source tests forbid imports from Core, SQLite, MCP, Node APIs, server modules, or orchestration. The browser does not embed an MCP client.

The shell includes keyboard-visible focus, a skip link, semantic controls, active navigation, reduced-motion behavior, labeled state badges, and responsive guidance. The critical path is verified at 1280×720; presentation checks also cover 1440×900 and 1920×1080.
