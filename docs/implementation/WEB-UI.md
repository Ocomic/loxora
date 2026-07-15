# Local Web UI

The React 19/Vite 8 UI is a local inspector and controller. It renders server/Core results without reimplementing Current selection, History order, severity, assessment applicability, dependency traversal, freshness, or budgeting.

Screens include Home diagnostics, Review Inbox, Project Map, Space, Collection, Node Current/History/Planned tabs, Impact/rollback, Context Package inspector, and MCP proof. Current uses teal, Historical slate, Planned violet, warnings amber, and High impact red/orange. Each detail surface provides a parent path or breadcrumb; Project → Space → Collection → Node is four actions.

Browser-source boundary tests forbid imports from Core, SQLite, MCP, Node APIs, or server modules. The browser does not embed an MCP client; the proof command launches the real stdio process.
