# Local Demo Application API

The built-in Node server binds to `127.0.0.1:4173`, serves the Vite client and `/api` from one origin, and enables no CORS. Mutations require JSON and a valid same-origin request. Payloads are Zod-validated.

Routes cover demo status/reset/resume, Review Inbox decisions, Project/Space/Collection/Node/Evidence/Source reads, impact/rollback, Context Package construction, and MCP-proof metadata. Eligibility is returned as `availableActions`; clients do not infer lifecycle transitions.

Validation returns 400, missing records 404, stale/duplicate transitions 409, reset/database failures 503, and unexpected failures an opaque request ID. Responses never expose SQL, stacks, secrets, or absolute paths. Over-budget packages remain successful Core results.
