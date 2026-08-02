import type { IKnowledgeTypeRow } from './knowledge-graph.assembler';

/**
 * `parent_type` is user data, so A->B->A and A->A are both reachable, and a
 * naive walk up the chain would loop forever.
 *
 * Types are visited in the caller's sorted order and the edge that CLOSES a
 * cycle is cut, which makes the outcome deterministic: the same edge goes on
 * every run. That matters beyond tidiness — getGraph hashes the whole payload
 * into the ETag, so a nondeterministic break would churn the ETag between two
 * identical requests.
 *
 * Shared by the assembler (`assembleKnowledgeGraph`) and the detail endpoint
 * (`KnowledgeGraphService#getNode`'s `chainFrom`) so both layers resolve the
 * exact same parent for a type — before this was split out, `getNode` walked
 * `parentRecordId` directly with only a `seen` loop-guard, so for a cycle it
 * could report a different (and even self-including) ancestor chain than the
 * graph endpoint. Callers MUST sort with the same comparator (see
 * `byTitleThenId`) before calling this, or the two layers can still disagree
 * on which edge gets cut.
 */
export const breakCycles = (sortedTypes: IKnowledgeTypeRow[]) => {
  const known = new Set(sortedTypes.map((t) => t.recordId));
  const parentOf = new Map<string, string | null>();
  let cyclesDropped = 0;

  for (const type of sortedTypes) {
    const parent = type.parentRecordId;
    if (parent === type.recordId) {
      // Self-parent: a cycle of length one.
      parentOf.set(type.recordId, null);
      cyclesDropped++;
      continue;
    }
    // A parent that no longer resolves is a root, not a dropped cycle — the
    // same treatment an unresolvable knowledge_type already gets.
    parentOf.set(type.recordId, parent && known.has(parent) ? parent : null);
  }

  for (const type of sortedTypes) {
    const seen = new Set<string>([type.recordId]);
    let current = parentOf.get(type.recordId) ?? null;
    while (current) {
      if (seen.has(current)) {
        parentOf.set(current, null);
        cyclesDropped++;
        break;
      }
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
  }

  return { parentOf, cyclesDropped };
};

/** One memoised walk up the now-acyclic parent map. Safe to recurse: the depth
 *  is the tree's, and breakCycles guarantees termination. */
export const resolveHierarchy = (parentOf: ReadonlyMap<string, string | null>) => {
  const depthOf = new Map<string, number>();
  const rootOf = new Map<string, string>();

  const resolve = (recordId: string): { depth: number; root: string } => {
    const cached = depthOf.get(recordId);
    if (cached !== undefined) {
      return { depth: cached, root: rootOf.get(recordId) as string };
    }
    const parent = parentOf.get(recordId) ?? null;
    const result =
      parent === null
        ? { depth: 0, root: recordId }
        : (() => {
            const up = resolve(parent);
            return { depth: up.depth + 1, root: up.root };
          })();
    depthOf.set(recordId, result.depth);
    rootOf.set(recordId, result.root);
    return result;
  };

  for (const recordId of parentOf.keys()) {
    resolve(recordId);
  }
  return { depthOf, rootOf };
};

/** Depth-first over the parent map: roots by title, then each subtree. The
 *  legend indents by depth and needs parents to precede their children. */
export const orderDepthFirst = (
  sortedTypes: IKnowledgeTypeRow[],
  parentOf: ReadonlyMap<string, string | null>
): IKnowledgeTypeRow[] => {
  const childrenOf = new Map<string | null, IKnowledgeTypeRow[]>();
  for (const type of sortedTypes) {
    const parent = parentOf.get(type.recordId) ?? null;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(type);
    else childrenOf.set(parent, [type]);
  }
  const out: IKnowledgeTypeRow[] = [];
  const walk = (parent: string | null) => {
    for (const child of childrenOf.get(parent) ?? []) {
      out.push(child);
      walk(child.recordId);
    }
  };
  walk(null);
  return out;
};
