/**
 * The shape both of this feature's hierarchies share: a record, its label, and
 * a pointer at its parent.
 *
 * `knowledge_type.parent_type` and `knowledge.knowledge_parent` are the same
 * edge in two different tables, so they get the same engine rather than two
 * copies of cycle-breaking that can drift apart. Nothing below is
 * type-specific.
 *
 * Declared here rather than in the assembler so this module states its own
 * input contract: the assembler's row types conform to it, not the reverse.
 */
export interface IHierarchyRow {
  recordId: string;
  title: string;
  parentRecordId: string | null;
}

/**
 * A parent pointer is user data, so A->B->A and A->A are both reachable, and a
 * naive walk up the chain would loop forever.
 *
 * Rows are visited in the caller's sorted order and the edge that CLOSES a
 * cycle is cut, which makes the outcome deterministic: the same edge goes on
 * every run. That matters beyond tidiness — getGraph hashes the whole payload
 * into the ETag, so a nondeterministic break would churn the ETag between two
 * identical requests.
 *
 * Shared by the assembler (`assembleKnowledgeGraph`) and the detail endpoint
 * (`KnowledgeGraphService#getNode`'s ancestor walk) so both layers resolve the
 * exact same parent for a record — before this was split out, `getNode` walked
 * `parentRecordId` directly with only a `seen` loop-guard, so for a cycle it
 * could report a different (and even self-including) ancestor chain than the
 * graph endpoint. Callers MUST sort with the same comparator (see
 * `byTitleThenId`) before calling this, or the two layers can still disagree
 * on which edge gets cut.
 */
export const breakCycles = (sortedRows: readonly IHierarchyRow[]) => {
  const known = new Set(sortedRows.map((row) => row.recordId));
  const parentOf = new Map<string, string | null>();
  let cyclesDropped = 0;

  for (const row of sortedRows) {
    const parent = row.parentRecordId;
    if (parent === row.recordId) {
      // Self-parent: a cycle of length one.
      parentOf.set(row.recordId, null);
      cyclesDropped++;
      continue;
    }
    // A parent that no longer resolves is a root, not a dropped cycle — the
    // same treatment an unresolvable knowledge_type already gets. Callers pass
    // the rows they intend to emit, so this is also what makes a parent lost
    // to the node budget degrade into "this record is a root".
    parentOf.set(row.recordId, parent && known.has(parent) ? parent : null);
  }

  for (const row of sortedRows) {
    const seen = new Set<string>([row.recordId]);
    let current = parentOf.get(row.recordId) ?? null;
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
 *  legend indents by depth and needs parents to precede their children.
 *
 *  Generic in the row type so a caller gets its own rows back, not a widened
 *  `IHierarchyRow` it would have to cast: the knowledge pass needs
 *  `typeRecordId` off the far side of this call. */
export const orderDepthFirst = <T extends IHierarchyRow>(
  sortedRows: readonly T[],
  parentOf: ReadonlyMap<string, string | null>
): T[] => {
  const childrenOf = new Map<string | null, T[]>();
  for (const row of sortedRows) {
    const parent = parentOf.get(row.recordId) ?? null;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(row);
    else childrenOf.set(parent, [row]);
  }
  const out: T[] = [];
  const walk = (parent: string | null) => {
    for (const child of childrenOf.get(parent) ?? []) {
      out.push(child);
      walk(child.recordId);
    }
  };
  walk(null);
  return out;
};
