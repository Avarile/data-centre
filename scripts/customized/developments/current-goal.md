1. Run the audit (scripts/customized/knowledge-graph/audit-knowledge-type-titles.ts). It must report 0. Non-zero means records will silently lose their type in the conversion, unrecoverably.
2. Run Task 4, the field migration (plan §Task 4 has the exact field JSON).
3. Only then deploy. The backend now 400s on a plain-text knowledge_type — deploying first takes the graph down.

The finding that justified the whole final-review pass

Ten scoped reviews missed it. listKnowledgesByType filtered the Link column with a title. I confirmed it independently in the server: a Link routes to the JSON filter adapter, whose is handler is jsonb_extract_path_text(cell,'id') = ? — it matches the record id, never the title.

The moment your migration ran, the AI agent's type-filtered search would have returned zero rows with no error and told users "there is no knowledge of that type". Dormant until the migration, then silently wrong — to an LLM.

This was the one item my design doc flagged as "needs a running instance to verify". It didn't. Reading the filter adapter settled it. That's a planning error on my part, now fixed and recorded in the doc.

Other things worth knowing

- My plan's force values were wrong. The sweep measured outward bias 0.186 with them — the radial star creeping back. Retuned to 0.005/180, giving 0.067/0.078/0.118 across three scales. I reproduced both numbers.
- My colour formula was wrong. It clamped at depth 3, so a depth-3 type and its child rendered identically. Replaced with asymptotic decay that never collides and makes "a type is lighter than its own knowledges" provable rather than eyeballed.
- My plan's test commands were wrong — every one said jest; this repo has only vitest. Caught pre-flight, before any subagent tripped on it.
- Fixing the getNode/assembler parentage split also moved the assembler from 495 → 403 lines, closing the file-size item Task 10 correctly identified as needing a real split.

Deferred, none blocking

Triaged in the ledger. The two you may care about: truncated.links is computed and published but never shown, so budget-dropped relations are invisible in the UI; and siblingCount now says "14 sibling knowledges" where it counts 3 child types plus 10 knowledges — the label became wrong when nesting arrived. Both one-liners.

One durability note: the cross-layer agreement test uses a hand-written replica of getNode's chainFrom rather than calling it. Correct today, but a future edit could diverge without failing the test.

Two deviations I made

I did not delete the SDD workspace, which the process calls for. It's gitignored, so deleting it would destroy the ledger and eleven task reports — including your three pre-flight rulings and the deferred list — none of which exist in git. It's at .superpowers/sdd/2026-08-02-knowledge-graph-v2/; delete it whenever you like.

I also committed plan and design-doc corrections as I went (adb62e3, 367e419, 214d42e, 2aa4dcf) so the documents match what was actually built.

Nothing is merged — the branch is yours. Say the word and I'll run finishing-a-development-branch to work through the integration options.
