# Knowledge Base Skill

Use this skill when working with the knowledge base: ingesting documents, searching for information, or managing stored knowledge.

## When to use

- User asks a question that might be answered by stored knowledge → `knowledge-search` first
- User wants to add information, documents, or notes → `knowledge-ingest`
- User wants to remove a document → `knowledge-delete` (confirm first)
- Answering a question you are uncertain about → always search before guessing

## Tools

### knowledge-ingest

Chunks, embeds, and stores a document.

```
title    — short label for the document
content  — full text (min 10 chars)
source   — optional: URL, filename, author
tags     — optional: topic array for filtering
```

Returns `materialId` (UUID) and `chunksCreated`. Save the `materialId` in working memory if the user may want to delete this document later.

### knowledge-search

Semantic similarity search over stored chunks.

```
query         — natural language question
topK          — 1–20, default 5
filterSource  — restrict to one source
filterTags    — restrict to chunks with ALL these tags
```

Always search before answering factual questions. Quote the `content` field and cite `title` / `source` when presenting results.

### knowledge-delete

Removes all chunks for a `materialId`.

```
materialId — UUID returned by knowledge-ingest
```

**Always confirm with the user before calling this tool.** Tell them which document will be deleted and how many chunks.

## Best practices

1. **Search before answering**: run `knowledge-search` before answering any factual question.
2. **Cite sources**: include `title` and `source` when presenting retrieved content.
3. **Chunk awareness**: search returns individual chunks — synthesise across multiple results when the answer spans several passages.
4. **Tag strategy**: suggest meaningful tags during ingestion to enable precise filtered searches later.
5. **Working memory**: after ingestion, update `context.lastIngestedMaterialId` and `context.recentSources` so the user can reference "that document I just added".
