/* eslint-disable @typescript-eslint/naming-convention */
import type { INestApplication } from '@nestjs/common';
import { FieldKeyType, FieldType, Relationship } from '@teable/core';
import type { ITableFullVo } from '@teable/openapi';
import {
  GET_KNOWLEDGE_GRAPH,
  getKnowledgeGraph,
  getKnowledgeGraphNode,
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

describe('KnowledgeGraph (e2e)', () => {
  let app: INestApplication;
  let cfg: IKnowledgeConfig;
  let original: Pick<IKnowledgeConfig, 'knowledgeTableId' | 'knowledgeTypeTableId'>;
  let typeTable: ITableFullVo;
  let knowledgeTable: ITableFullVo;
  let alphaTypeId = '';
  let betaTypeId = '';
  let activeKnowledgeId = '';

  const baseId = globalThis.testConfig.baseId;

  beforeAll(async () => {
    // initApp() is memoized on globalThis and takes no arguments, so
    // Test.createTestingModule().overrideProvider(...) is unreachable from here.
    app = (await initApp()).app;

    typeTable = await createTable(baseId, { name: 'knowledge_type', fields: TAXONOMY_FIELDS });
    knowledgeTable = await createTable(baseId, { name: 'knowledges', fields: TAXONOMY_FIELDS });

    // The link field needs both tables to exist, so it cannot be inline above.
    await createField(knowledgeTable.id, {
      name: 'knowledge_type',
      type: FieldType.Link,
      options: { relationship: Relationship.ManyOne, foreignTableId: typeTable.id },
    });
    await createField(typeTable.id, {
      name: 'parent_type',
      type: FieldType.Link,
      options: { relationship: Relationship.ManyOne, foreignTableId: typeTable.id },
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
        { fields: { title: 'k-active', knowledge_type: { id: alphaTypeId }, is_active: true } },
        { fields: { title: 'k-inactive', knowledge_type: { id: betaTypeId }, is_active: false } },
        { fields: { title: 'k-unset', knowledge_type: { id: alphaTypeId } } },
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
    expect(data.version).toBe(2);
    expect(data.etag).toMatch(/^"kg2-[0-9a-f]{16}"$/);

    expect(data.stats).toEqual({
      typeCount: 3, // Alpha + Beta + unclassified
      knowledgeCount: 4, // five rows, one soft-deleted
      orphanCount: 1,
      nodeCount: 8,
      // Unchanged from the flat count: Beta's core-type link becomes a
      // type-parent link under Alpha instead, so the total stays 7.
      linkCount: 7,
      truncated: false,
      cyclesDropped: 0,
      maxDepth: 1, // Beta nests one level under Alpha
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
    expect(labels).toContain('k-active');
    expect(labels).toContain('k-inactive');
    expect(labels).toContain('k-unset');
  });

  it('buckets an unlinked knowledge under the unclassified node', async () => {
    const { data } = await getKnowledgeGraph(baseId);

    const orphan = data.nodes.find((n) => n.label === 'k-orphan');
    expect(orphan?.typeId).toBe(UNCLASSIFIED_TYPE_NODE_ID);
    expect(data.nodes.filter((n) => n.id === UNCLASSIFIED_TYPE_NODE_ID)).toHaveLength(1);
    expect(
      data.links.filter((l) => l.source === 'core' && l.target === UNCLASSIFIED_TYPE_NODE_ID)
    ).toHaveLength(1);
  });

  it('serves node detail with the context body and timestamps', async () => {
    const { data } = await getKnowledgeGraphNode(baseId, `kn:${activeKnowledgeId}`);

    expect(data.recordId).toBe(activeKnowledgeId);
    expect(data.tier).toBe('knowledge');
    expect(data.label).toBe('k-active');
    expect(data.parentId).toBe(`type:${alphaTypeId}`);
    expect(data.ancestors).toEqual([{ id: `type:${alphaTypeId}`, label: 'Alpha' }]);
    expect(data.createdTime).not.toBeNull();
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
