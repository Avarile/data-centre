/* eslint-disable @typescript-eslint/naming-convention */
import type { INestApplication } from '@nestjs/common';
import { FieldKeyType, FieldType, Relationship } from '@teable/core';
import type { ITableFullVo } from '@teable/openapi';
import {
  GET_KNOWLEDGE_GRAPH,
  getKnowledgeGraph,
  getKnowledgeGraphNode,
  KNOWLEDGE_NODE_PREFIX,
  UNCLASSIFIED_TYPE_NODE_ID,
  urlBuilder,
} from '@teable/openapi';
import type { IKnowledgeConfig } from '../src/configs/knowledge.config';
import { knowledgeConfig } from '../src/configs/knowledge.config';
import { createNewUserAxios } from './utils/axios-instance/new-user';
import { getError } from './utils/get-error';
import {
  createBase,
  createField,
  createRecords,
  createTable,
  initApp,
  permanentDeleteBase,
  permanentDeleteTable,
  updateRecordByApi,
} from './utils/init-app';

const TAXONOMY_FIELDS = [
  { name: 'title', type: FieldType.SingleLineText },
  { name: 'context', type: FieldType.LongText },
  { name: 'is_active', type: FieldType.Checkbox },
  { name: 'deleted_at', type: FieldType.Date },
];

/** Fixture record titles, which double as the labels assertions match on. */
const K_ACTIVE = 'k-active';
const K_INACTIVE = 'k-inactive';
const K_UNSET = 'k-unset';

describe('KnowledgeGraph (e2e)', () => {
  let app: INestApplication;
  let cfg: IKnowledgeConfig;
  let original: Pick<IKnowledgeConfig, 'knowledgeTableId' | 'knowledgeTypeTableId'>;
  let typeTable: ITableFullVo;
  let knowledgeTable: ITableFullVo;
  let alphaTypeId = '';
  let betaTypeId = '';
  let activeKnowledgeId = '';
  let inactiveKnowledgeId = '';
  let unsetKnowledgeId = '';

  const baseId = globalThis.testConfig.baseId;

  beforeAll(async () => {
    // initApp() is memoized on globalThis and takes no arguments, so
    // Test.createTestingModule().overrideProvider(...) is unreachable from here.
    app = (await initApp()).app;

    // `records: []` is load-bearing: createTable seeds three blank rows when
    // records is omitted, and blank rows are real records to the graph — they
    // arrive as untitled types and untyped (so unclassified) knowledges, which
    // shifts every count in the stats snapshot below.
    typeTable = await createTable(baseId, {
      name: 'knowledge_type',
      fields: TAXONOMY_FIELDS,
      records: [],
    });
    knowledgeTable = await createTable(baseId, {
      name: 'knowledges',
      fields: TAXONOMY_FIELDS,
      records: [],
    });

    // The link field needs both tables to exist, so it cannot be inline above.
    await createField(knowledgeTable.id, {
      name: 'knowledge_type',
      type: FieldType.Link,
      options: { relationship: Relationship.ManyOne, foreignTableId: typeTable.id },
    });
    // Every self-referencing link below is isOneWay: true, and that is
    // load-bearing rather than stylistic — for two independent reasons.
    //
    // 1. A two-way self-link auto-creates a symmetric field named after the
    //    SOURCE table (see generateSymmetricField), so a two-way `parent_type`
    //    puts a multi-valued field literally called `knowledge_type` on the
    //    type table. DETAIL_SPECS resolves `knowledge_type` by name, finds that
    //    one, and fails the node endpoint with a 400. Reproduced against the
    //    live base on 2026-08-14; production works around it by renaming that
    //    symmetric field to `child_types` straight after creation.
    //
    // 2. Writing a cell on a two-way self-link created moments earlier in this
    //    same setup silently no-ops: the PATCH returns 200 and bumps
    //    lastModifiedTime, but the cell reads back empty, so the fixture seeds
    //    nothing and every nesting assertion fails against a flat graph. Note
    //    this is specific to a freshly created field — the same write against
    //    the live base's long-established two-way `knowledge_parent` persists
    //    correctly, so it looks like a race in symmetric-field setup rather
    //    than a blanket rule. One-way sidesteps it entirely.
    //
    // One-way is also what the v2 design doc specified for parent_type in the
    // first place: children are derived by inverting the parent map, so the
    // symmetric side was never needed. The backend reads only the ManyOne side,
    // so one-way here exercises exactly the same code path production does.
    await createField(typeTable.id, {
      name: 'parent_type',
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: typeTable.id,
        isOneWay: true,
      },
    });
    await createField(knowledgeTable.id, {
      name: 'related_knowledge',
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: knowledgeTable.id,
        isOneWay: true,
      },
    });
    // Nested knowledge: the same self-link shape as parent_type, on the other
    // table. The assembler reads only this ManyOne side and derives children.
    await createField(knowledgeTable.id, {
      name: 'knowledge_parent',
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: knowledgeTable.id,
        isOneWay: true,
      },
    });

    const types = await createRecords(typeTable.id, {
      fieldKeyType: FieldKeyType.Name,
      records: [{ fields: { title: 'Alpha' } }, { fields: { title: 'Beta' } }],
    });
    alphaTypeId = types.records[0].id;
    betaTypeId = types.records[1].id;

    // Beta nests under Alpha: parent_type can only be set once both records exist.
    await updateRecordByApi(
      typeTable.id,
      betaTypeId,
      'parent_type',
      { id: alphaTypeId },
      200,
      FieldKeyType.Name
    );

    const knowledges = await createRecords(knowledgeTable.id, {
      fieldKeyType: FieldKeyType.Name,
      records: [
        // is_active true / false / never set — all three must survive.
        { fields: { title: K_ACTIVE, knowledge_type: { id: alphaTypeId }, is_active: true } },
        { fields: { title: K_INACTIVE, knowledge_type: { id: betaTypeId }, is_active: false } },
        { fields: { title: K_UNSET, knowledge_type: { id: alphaTypeId } } },
        // No link at all — must land under the synthetic unclassified bucket.
        { fields: { title: 'k-orphan', context: 'a lonely note' } },
        // Soft-deleted — must disappear entirely.
        {
          fields: {
            title: 'k-deleted',
            knowledge_type: { id: alphaTypeId },
            deleted_at: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
    });
    activeKnowledgeId = knowledges.records[0].id;
    inactiveKnowledgeId = knowledges.records[1].id;
    unsetKnowledgeId = knowledges.records[2].id;

    // related_knowledge is self-referencing, so — like parent_type — it can
    // only be set once both ends already exist. Written from k-active's side
    // only: the assembler canonicalises each unordered pair and emits one
    // undirected edge, so one direction on record is all the graph needs.
    await updateRecordByApi(
      knowledgeTable.id,
      activeKnowledgeId,
      'related_knowledge',
      [{ id: inactiveKnowledgeId }],
      200,
      FieldKeyType.Name
    );

    // k-unset nests under k-inactive, which is typed Beta — while k-unset's own
    // knowledge_type is Alpha. Deliberately mismatched: it is what pins the
    // anchor rule, that a nested record takes its branch from the ROOT of its
    // knowledge chain rather than from its own type.
    await updateRecordByApi(
      knowledgeTable.id,
      unsetKnowledgeId,
      'knowledge_parent',
      { id: inactiveKnowledgeId },
      200,
      FieldKeyType.Name
    );

    // The config is read once at module init and ConfigModule caches it, so
    // mutating process.env after boot does nothing. registerAs returns a plain
    // mutable object held by the DI container — that is the only seam that
    // works, and afterAll restores it because specs share one app instance.
    cfg = app.get<IKnowledgeConfig>(knowledgeConfig.KEY);
    original = {
      knowledgeTableId: cfg.knowledgeTableId,
      knowledgeTypeTableId: cfg.knowledgeTypeTableId,
    };
    cfg.knowledgeTableId = knowledgeTable.id;
    cfg.knowledgeTypeTableId = typeTable.id;
  });

  afterAll(async () => {
    if (cfg) {
      Object.assign(cfg, original);
    }
    await permanentDeleteTable(baseId, knowledgeTable.id);
    await permanentDeleteTable(baseId, typeTable.id);
  });

  it('assembles the 3-tier star with the expected counts', async () => {
    const { data } = await getKnowledgeGraph(baseId);

    expect(data.nodes[0].id).toBe('core');
    expect(data.nodes[0].tier).toBe('core');
    expect(data.version).toBe(3);
    expect(data.etag).toMatch(/^"kg3-[0-9a-f]{16}"$/);

    expect(data.stats).toEqual({
      typeCount: 3, // Alpha + Beta + unclassified
      knowledgeCount: 4, // five rows, one soft-deleted
      orphanCount: 1, // k-orphan; k-unset is nested, so it is never an orphan
      nodeCount: 8,
      // 7 structural links (core->Alpha, Alpha->Beta type-parent, core->
      // unclassified, one type-knowledge link per ROOT knowledge — k-active,
      // k-inactive, k-orphan — and one knowledge-parent link for k-unset) +
      // 1 knowledge-knowledge link for the k-active<->k-inactive relation.
      linkCount: 8,
      truncated: { nodes: false, links: false },
      cyclesDropped: 0,
      maxDepth: 1, // Beta nests one level under Alpha
      maxKnowledgeDepth: 1, // k-unset nests one level under k-inactive
      knowledgeCyclesDropped: 0,
      relationCount: 1, // the single k-active<->k-inactive relation
      danglingRelations: 0,
    });

    const typeLabels = data.nodes.filter((n) => n.tier === 'type').map((n) => n.label);
    expect(typeLabels).toContain('Alpha');
    expect(typeLabels).toContain('Beta');
  });

  it('nests a child type under its parent', async () => {
    const { data } = await getKnowledgeGraph(baseId);
    const beta = data.nodes.find((n) => n.recordId === betaTypeId);

    expect(beta).toMatchObject({ parentId: `type:${alphaTypeId}`, depth: 1 });
    expect(data.links.some((l) => l.tier === 'type-parent')).toBe(true);
  });

  it('excludes soft-deleted rows', async () => {
    const { data } = await getKnowledgeGraph(baseId);

    expect(data.nodes.map((n) => n.label)).not.toContain('k-deleted');
  });

  it('keeps rows regardless of is_active', async () => {
    const { data } = await getKnowledgeGraph(baseId);
    const labels = data.nodes.map((n) => n.label);

    // Pins the decision that the graph never reads is_active. If someone later
    // reintroduces an is_active predicate, this is the assertion that fails.
    expect(labels).toContain(K_ACTIVE);
    expect(labels).toContain(K_INACTIVE);
    expect(labels).toContain(K_UNSET);
  });

  it('buckets an unlinked knowledge under the unclassified node', async () => {
    const { data } = await getKnowledgeGraph(baseId);

    const orphan = data.nodes.find((n) => n.label === 'k-orphan');
    expect(orphan?.parentId).toBe(UNCLASSIFIED_TYPE_NODE_ID);
    expect(data.nodes.filter((n) => n.id === UNCLASSIFIED_TYPE_NODE_ID)).toHaveLength(1);
    expect(
      data.links.filter((l) => l.source === 'core' && l.target === UNCLASSIFIED_TYPE_NODE_ID)
    ).toHaveLength(1);
  });

  it('serves node detail with the context body and timestamps', async () => {
    const { data } = await getKnowledgeGraphNode(baseId, `kn:${activeKnowledgeId}`);

    expect(data.recordId).toBe(activeKnowledgeId);
    expect(data.tier).toBe('knowledge');
    expect(data.label).toBe(K_ACTIVE);
    expect(data.parentId).toBe(`type:${alphaTypeId}`);
    expect(data.ancestors).toEqual([{ id: `type:${alphaTypeId}`, label: 'Alpha' }]);
    expect(data.createdTime).not.toBeNull();
    // k-active <-> k-inactive is the one related_knowledge relation in the fixture.
    expect(data.relatedCount).toBe(1);
  });

  it('emits a knowledge-knowledge link for a related_knowledge relation', async () => {
    const { data } = await getKnowledgeGraph(baseId);

    const relationLinks = data.links.filter((l) => l.tier === 'knowledge-knowledge');
    expect(relationLinks).toHaveLength(1);

    const endpoints = [relationLinks[0].source, relationLinks[0].target].sort();
    const expectedEndpoints = [
      `${KNOWLEDGE_NODE_PREFIX}${activeKnowledgeId}`,
      `${KNOWLEDGE_NODE_PREFIX}${inactiveKnowledgeId}`,
    ].sort();
    expect(endpoints).toEqual(expectedEndpoints);

    expect(data.stats.relationCount).toBe(1);
    expect(data.stats.danglingRelations).toBe(0);
  });

  it('nests a knowledge under another knowledge and anchors it on the root branch', async () => {
    const { data } = await getKnowledgeGraph(baseId);
    const nested = data.nodes.find((n) => n.label === K_UNSET);

    expect(nested).toMatchObject({
      parentId: `${KNOWLEDGE_NODE_PREFIX}${inactiveKnowledgeId}`,
      // Beta sits at depth 1, its knowledges at 2, and k-unset one deeper.
      depth: 3,
      // Filed under Alpha, but nested under a Beta-typed parent whose root is
      // Alpha — so the branch resolves to Alpha either way. What this pins is
      // that rootTypeId stays a TYPE id and never becomes the parent's kn: id.
      rootTypeId: `type:${alphaTypeId}`,
    });

    const parentLinks = data.links.filter((l) => l.tier === 'knowledge-parent');
    expect(parentLinks).toEqual([
      {
        source: `${KNOWLEDGE_NODE_PREFIX}${inactiveKnowledgeId}`,
        target: `${KNOWLEDGE_NODE_PREFIX}${unsetKnowledgeId}`,
        tier: 'knowledge-parent',
        value: 1,
        distance: expect.any(Number),
      },
    ]);
    // And it draws no type edge of its own — exactly one structural edge each.
    expect(
      data.links.filter((l) => l.tier === 'type-knowledge' && l.target.endsWith(unsetKnowledgeId))
    ).toHaveLength(0);
  });

  it('spans both hierarchies in a nested knowledge breadcrumb', async () => {
    const { data } = await getKnowledgeGraphNode(baseId, `kn:${unsetKnowledgeId}`);

    expect(data.parentId).toBe(`${KNOWLEDGE_NODE_PREFIX}${inactiveKnowledgeId}`);
    expect(data.parentLabel).toBe(K_INACTIVE);
    // Type chain of the ROOT knowledge first, then the knowledge chain: the
    // same anchor the graph endpoint uses for rootTypeId, so the breadcrumb and
    // the node colour cannot disagree about which branch this belongs to.
    expect(data.ancestors).toEqual([
      { id: `type:${alphaTypeId}`, label: 'Alpha' },
      { id: `type:${betaTypeId}`, label: 'Beta' },
      { id: `${KNOWLEDGE_NODE_PREFIX}${inactiveKnowledgeId}`, label: K_INACTIVE },
    ]);
  });

  it('builds a root-first ancestor chain for a nested type', async () => {
    const { data } = await getKnowledgeGraphNode(baseId, `type:${betaTypeId}`);

    expect(data.tier).toBe('type');
    expect(data.parentId).toBe(`type:${alphaTypeId}`);
    expect(data.parentLabel).toBe('Alpha');
    expect(data.ancestors).toEqual([{ id: `type:${alphaTypeId}`, label: 'Alpha' }]);
    expect(data.relatedCount).toBe(0);
  });

  it('reports an empty ancestor chain for a root type', async () => {
    const { data } = await getKnowledgeGraphNode(baseId, `type:${alphaTypeId}`);

    expect(data.parentId).toBeNull();
    expect(data.parentLabel).toBeNull();
    expect(data.ancestors).toEqual([]);
  });

  it('404s for synthetic nodes that have no backing record', async () => {
    const coreError = await getError(() => getKnowledgeGraphNode(baseId, 'core'));
    expect(coreError?.status).toBe(404);

    const unclassifiedError = await getError(() =>
      getKnowledgeGraphNode(baseId, UNCLASSIFIED_TYPE_NODE_ID)
    );
    expect(unclassifiedError?.status).toBe(404);
  });

  it('404s when the configured tables belong to another base', async () => {
    const otherBase = await createBase({ spaceId: globalThis.testConfig.spaceId });
    try {
      const error = await getError(() => getKnowledgeGraph(otherBase.id));
      expect(error?.status).toBe(404);
    } finally {
      await permanentDeleteBase(otherBase.id);
    }
  });

  it('403s for a user who is not a member of the base', async () => {
    const strangerAxios = await createNewUserAxios({
      email: 'knowledge-graph-stranger@test.com',
      password: 'TestPassword123!',
    });

    // Distinct from the 404 above: this is the guard rejecting the caller,
    // not the service rejecting the table ownership.
    const error = await getError(() =>
      strangerAxios.get(urlBuilder(GET_KNOWLEDGE_GRAPH, { baseId }))
    );
    expect(error?.status).toBe(403);
  });
});
