# Token-Efficient Knowledge Representation

**Status:** Research note  
**Last Updated:** July 2026

## Question

Could Loxora use a compact intermediate notation—similar to stenography, abbreviations, or a symbol language—to reduce token usage when exchanging project knowledge with language models?

## Initial assessment

The idea is plausible, but a manually designed shorthand is unlikely to be universally token-efficient.

Language models do not consume characters directly. They consume model-specific tokens. A symbol that appears visually compact may still use several tokens, while a common English phrase may already be represented efficiently by one token.

Therefore, character count is not a reliable proxy for token count.

## Existing adjacent approaches

### Prompt compression

Research systems such as LLMLingua, LongLLMLingua, and LLMLingua-2 remove low-information or redundant prompt content while trying to preserve task-relevant meaning.

This is currently a more mature direction than inventing a universal symbolic shorthand.

### Retrieval and selective context

Embeddings, vector search, graph traversal, metadata filters, and token-budgeted Context Packages reduce cost by selecting less knowledge rather than encoding all knowledge more densely.

This should remain Loxora's primary strategy.

### Structured intermediate representations

Compact schemas, typed identifiers, relation triples, references, and controlled vocabularies can reduce repetition when both sender and receiver understand the representation.

Example:

```text
P:game-a N:auth R:supersedes V:oauth2 E:ADR-017 S:canonical
```

Such a representation may be useful internally, but must be measured against each target model's tokenizer and comprehension quality.

### Learned representations

Embeddings and latent representations are compact for search and similarity, but they are not normally interpretable instructions that can simply replace textual context in an external model's prompt.

They help find knowledge; they do not automatically communicate the selected knowledge to a model.

## Risks of a custom shorthand

- Different models use different tokenizers.
- New symbols may cost more tokens than expected.
- Models may misunderstand unfamiliar notation.
- Compression may remove reasoning-critical details.
- A notation optimized for one model may perform poorly on another.
- Human readability and auditability may suffer.
- A permanent project format must not depend on one provider's tokenizer.

## Potential Loxora approach

Loxora should preserve full, human-readable canonical knowledge as the source representation.

A future Context Builder may generate temporary model-specific representations using multiple stages:

1. Retrieve only relevant knowledge.
2. Resolve current versus historical state.
3. Remove duplication.
4. Summarize to the task's required detail.
5. Replace repeated entities with stable local aliases where beneficial.
6. Optionally apply model-specific prompt compression.
7. Validate that critical facts and constraints remain present.

The compressed form should be treated as a temporary Context Package artifact, never as the only stored knowledge.

## Research proposal: Loxora Compact Context Notation

A future experiment could compare:

- full natural language,
- concise natural language,
- JSON,
- YAML,
- relation triples,
- a controlled compact notation,
- prompt compression,
- and combinations of retrieval plus compression.

Measure:

- actual tokens per target model,
- answer correctness,
- constraint retention,
- reasoning quality,
- latency,
- cost,
- cross-model portability,
- human readability.

## MVP decision

Do not make a custom shorthand part of the Build Week MVP.

For the MVP, use:

- selective retrieval,
- explicit lifecycle filtering,
- token-budgeted Context Packages,
- concise structured summaries,
- stable references to evidence and nodes.

The compact-notation idea remains a promising post-MVP research track and could become a Context Builder optimization if experiments show measurable cross-model value.
