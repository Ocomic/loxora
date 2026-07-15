# Demo Data Bundle

`fixtures/hackathon-demo-v1/manifest.json` is the versioned source of stable Project, navigation, Node, Source, Evidence, and prepared Proposal identifiers. The adjacent Markdown, TypeScript, and JSON files are curated raw inputs, not computed outputs or a prebuilt database.

The hierarchy is:

```text
identity-contract / Authentication Space / Token Contract Collection / Token Format
customer-portal / Authentication Space / Authentication Client Collection / Token Parser
```

V1 requires `customer_id`. V2 replaces it with `subject_id`; the unchanged Token Parser rejects it with HTTP 401. V3 restores compatible `customer_id` semantics. The customer-portal-owned Planned item defers retrying V2 until `subject_id` mapping and compatibility tests exist.

Runtime code consumes manifest structure generically and does not branch on Project names. Reset reads curated fixture content, then performs real Core registration, submission, review, relationship, assessment, rollback, restoration, plan, projection, Context, and MCP operations.
