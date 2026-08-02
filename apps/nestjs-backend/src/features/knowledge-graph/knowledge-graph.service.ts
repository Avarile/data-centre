/* eslint-disable @typescript-eslint/naming-convention */
import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { IFilter, ILinkCellValue } from '@teable/core';
import { and, FieldKeyType, FieldType, HttpErrorCode, isEmpty } from '@teable/core';
import type {
  IGetKnowledgeGraphNodeVo,
  IGetKnowledgeGraphVo,
  KnowledgeDetailTier,
} from '@teable/openapi';
import { KNOWLEDGE_GRAPH_VERSION, KNOWLEDGE_NODE_PREFIX, TYPE_NODE_PREFIX } from '@teable/openapi';
// A value import, not `import type`: IKnowledgeConfig is referenced from a
// decorated constructor parameter, so it must survive into decorator metadata.
import { IKnowledgeConfig, KnowledgeConfig } from '../../configs/knowledge.config';
import { CustomHttpException } from '../../custom.exception';
import { PermissionService } from '../auth/permission.service';
import { RecordService } from '../record/record.service';
import type { IKnowledgeRow, IKnowledgeTypeRow } from './knowledge-graph.assembler';
import { assembleKnowledgeGraph } from './knowledge-graph.assembler';
import type { IFieldSpec, IResolvedField } from './types';
import { KNOWLEDGE_FIELD, KNOWLEDGE_TYPE_FIELD_TYPES, PARENT_TYPE_FIELD_TYPES } from './types';

const TITLE_TYPES = [FieldType.SingleLineText, FieldType.LongText] as const;
const CONTEXT_TYPES = [FieldType.LongText, FieldType.SingleLineText] as const;

/** Fields needed to assemble the graph. `context` is excluded on purpose: the
 *  bodies are what would make the payload unbounded. */
const GRAPH_TYPE_SPECS: IFieldSpec[] = [
  { name: KNOWLEDGE_FIELD.title, types: TITLE_TYPES, required: true },
  { name: KNOWLEDGE_FIELD.deletedAt, types: [FieldType.Date], required: true },
  {
    name: KNOWLEDGE_FIELD.parentType,
    types: PARENT_TYPE_FIELD_TYPES,
    required: false,
    singleValued: true,
  },
];

const GRAPH_KNOWLEDGE_SPECS: IFieldSpec[] = [
  { name: KNOWLEDGE_FIELD.title, types: TITLE_TYPES, required: true },
  { name: KNOWLEDGE_FIELD.deletedAt, types: [FieldType.Date], required: true },
  {
    name: KNOWLEDGE_FIELD.knowledgeType,
    types: KNOWLEDGE_TYPE_FIELD_TYPES,
    required: false,
    singleValued: true,
  },
  { name: KNOWLEDGE_FIELD.relatedKnowledge, types: [FieldType.Link], required: false },
];

/** The detail endpoint is the only place `context` is read. */
const DETAIL_SPECS: IFieldSpec[] = [
  { name: KNOWLEDGE_FIELD.title, types: TITLE_TYPES, required: true },
  { name: KNOWLEDGE_FIELD.context, types: CONTEXT_TYPES, required: false },
  {
    name: KNOWLEDGE_FIELD.knowledgeType,
    types: KNOWLEDGE_TYPE_FIELD_TYPES,
    required: false,
    singleValued: true,
  },
  { name: KNOWLEDGE_FIELD.relatedKnowledge, types: [FieldType.Link], required: false },
];

/** Reads the linked recordId out of a single-valued link cell. Both
 *  knowledge_type and parent_type are asserted single-valued in resolveFields,
 *  so there is no multi-value case to silently drop. */
const extractLinkRecordId = (raw: unknown): string | null => {
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'object' && 'id' in (raw as object)) {
    return (raw as ILinkCellValue).id;
  }
  return null;
};

/** Reads every linked recordId out of a multi-valued link cell. */
const extractRelatedRecordIds = (raw: unknown): string[] => {
  if (raw == null) {
    return [];
  }
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .filter((v): v is ILinkCellValue => typeof v === 'object' && v !== null && 'id' in v)
    .map((v) => v.id);
};

@Injectable()
export class KnowledgeGraphService {
  constructor(
    private readonly recordService: RecordService,
    private readonly permissionService: PermissionService,
    @KnowledgeConfig() private readonly knowledgeConfig: IKnowledgeConfig
  ) {}

  async getGraph(baseId: string): Promise<IGetKnowledgeGraphVo> {
    const { knowledgeTableId, knowledgeTypeTableId, maxKnowledgeNodes, maxLinks } =
      this.knowledgeConfig;
    await this.assertTablesInBase(baseId, [knowledgeTableId, knowledgeTypeTableId]);

    const types = await this.readTypes(knowledgeTypeTableId);
    const knowledges = await this.readKnowledges(knowledgeTableId);

    const graph = assembleKnowledgeGraph(types, knowledges, {
      maxKnowledgeNodes,
      maxLinks,
      coreLabel: 'knowledge_core',
      unclassifiedLabel: 'Unclassified',
    });

    const digest = createHash('sha1').update(JSON.stringify(graph)).digest('hex').slice(0, 16);

    return {
      version: KNOWLEDGE_GRAPH_VERSION,
      etag: `"kg${KNOWLEDGE_GRAPH_VERSION}-${digest}"`,
      ...graph,
    };
  }

  async getNode(baseId: string, nodeId: string): Promise<IGetKnowledgeGraphNodeVo> {
    const { knowledgeTableId, knowledgeTypeTableId } = this.knowledgeConfig;
    await this.assertTablesInBase(baseId, [knowledgeTableId, knowledgeTypeTableId]);

    const { tier, recordId, tableId } = this.parseNodeId(nodeId);
    const fields = await this.resolveFields(tableId, DETAIL_SPECS);
    const titleField = this.required(fields, KNOWLEDGE_FIELD.title, tableId);
    const contextField = fields.get(KNOWLEDGE_FIELD.context);
    const knowledgeTypeField = fields.get(KNOWLEDGE_FIELD.knowledgeType);
    const relatedKnowledgeField = fields.get(KNOWLEDGE_FIELD.relatedKnowledge);

    const projection = [
      titleField.id,
      contextField?.id,
      knowledgeTypeField?.id,
      relatedKnowledgeField?.id,
    ].filter((id): id is string => Boolean(id));

    // fieldKeyType is MANDATORY here: getRecord defaults it to Name, which
    // would make every `record.fields[field.id]` lookup return undefined.
    const record = await this.recordService.getRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
      projection,
    });

    // The chain needs the whole type table, not one record: it walks parents.
    // Acceptable on this path — it serves one record at a time and already
    // reads `context`, the largest column in either table.
    const types = await this.readTypes(knowledgeTypeTableId);
    const byRecordId = new Map(types.map((t) => [t.recordId, t]));

    const chainFrom = (startRecordId: string | null): { id: string; label: string }[] => {
      const chain: { id: string; label: string }[] = [];
      const seen = new Set<string>();
      let current = startRecordId;
      while (current && !seen.has(current)) {
        seen.add(current);
        const node = byRecordId.get(current);
        if (!node) break;
        chain.unshift({ id: `${TYPE_NODE_PREFIX}${node.recordId}`, label: node.title });
        current = node.parentRecordId;
      }
      return chain;
    };

    const typeRecordId = knowledgeTypeField
      ? extractLinkRecordId(record.fields[knowledgeTypeField.id])
      : null;

    const ancestors =
      tier === 'knowledge'
        ? chainFrom(typeRecordId)
        : chainFrom(byRecordId.get(recordId)?.parentRecordId ?? null);
    const parent = ancestors[ancestors.length - 1] ?? null;

    const relatedCount =
      tier === 'knowledge' && relatedKnowledgeField
        ? extractRelatedRecordIds(record.fields[relatedKnowledgeField.id]).length
        : 0;

    return {
      id: nodeId,
      recordId: record.id,
      tier,
      label: (record.fields[titleField.id] as string | undefined) ?? '',
      context: contextField ? (record.fields[contextField.id] as string | undefined) ?? null : null,
      parentId: parent?.id ?? null,
      parentLabel: parent?.label ?? null,
      ancestors,
      relatedCount,
      createdTime: record.createdTime ?? null,
      lastModifiedTime: record.lastModifiedTime ?? null,
    };
  }

  /**
   * `type:` and `kn:` are the only prefixes with a backing record. The
   * synthetic `core` and `type:__unclassified__` nodes deliberately 404.
   */
  private parseNodeId(nodeId: string): {
    tier: KnowledgeDetailTier;
    recordId: string;
    tableId: string;
  } {
    const { knowledgeTableId, knowledgeTypeTableId } = this.knowledgeConfig;

    if (nodeId.startsWith(TYPE_NODE_PREFIX)) {
      const recordId = nodeId.slice(TYPE_NODE_PREFIX.length);
      if (recordId && !recordId.startsWith('__')) {
        return { tier: 'type', recordId, tableId: knowledgeTypeTableId };
      }
    }
    if (nodeId.startsWith(KNOWLEDGE_NODE_PREFIX)) {
      const recordId = nodeId.slice(KNOWLEDGE_NODE_PREFIX.length);
      if (recordId) {
        return { tier: 'knowledge', recordId, tableId: knowledgeTableId };
      }
    }

    throw new CustomHttpException(`Node ${nodeId} has no backing record`, HttpErrorCode.NOT_FOUND);
  }

  private async readTypes(tableId: string): Promise<IKnowledgeTypeRow[]> {
    const fields = await this.resolveFields(tableId, GRAPH_TYPE_SPECS);
    const titleField = this.required(fields, KNOWLEDGE_FIELD.title, tableId);
    const deletedAtField = this.required(fields, KNOWLEDGE_FIELD.deletedAt, tableId);
    const parentField = fields.get(KNOWLEDGE_FIELD.parentType);

    const projection = parentField ? [titleField.id, parentField.id] : [titleField.id];
    const rows = await this.readRows(tableId, projection, deletedAtField.id);

    return rows.map((row) => ({
      recordId: row.id,
      // dbRecord2RecordFields drops cells that convert to null, so the key can
      // be absent rather than null — never assume it exists.
      title: (row.fields[titleField.id] as string | undefined) ?? '',
      parentRecordId: parentField ? extractLinkRecordId(row.fields[parentField.id]) : null,
    }));
  }

  private async readKnowledges(tableId: string): Promise<IKnowledgeRow[]> {
    const fields = await this.resolveFields(tableId, GRAPH_KNOWLEDGE_SPECS);
    const titleField = this.required(fields, KNOWLEDGE_FIELD.title, tableId);
    const deletedAtField = this.required(fields, KNOWLEDGE_FIELD.deletedAt, tableId);
    const knowledgeTypeField = fields.get(KNOWLEDGE_FIELD.knowledgeType);
    const relatedKnowledgeField = fields.get(KNOWLEDGE_FIELD.relatedKnowledge);

    const projection = [titleField.id, knowledgeTypeField?.id, relatedKnowledgeField?.id].filter(
      (id): id is string => Boolean(id)
    );
    const rows = await this.readRows(tableId, projection, deletedAtField.id);

    return rows.map((row) => ({
      recordId: row.id,
      title: (row.fields[titleField.id] as string | undefined) ?? '',
      typeRecordId: knowledgeTypeField
        ? extractLinkRecordId(row.fields[knowledgeTypeField.id])
        : null,
      relatedRecordIds: relatedKnowledgeField
        ? extractRelatedRecordIds(row.fields[relatedKnowledgeField.id])
        : [],
    }));
  }

  /**
   * One SQL statement per table. `take` is the budget plus one: fetching a
   * single row beyond the cap is how truncation is detected without a COUNT(*).
   *
   * Only ever reached from the controller path — getRecordsFields resolves the
   * current user from request-scoped CLS storage and throws outside a request.
   */
  private async readRows(tableId: string, projection: string[], deletedAtFieldId: string) {
    const notDeleted: IFilter = {
      conjunction: and.value,
      filterSet: [{ fieldId: deletedAtFieldId, operator: isEmpty.value, value: null }],
    };

    return this.recordService.getRecordsFields(
      tableId,
      {
        fieldKeyType: FieldKeyType.Id,
        projection,
        filter: notDeleted,
        // The graph is a base-wide taxonomy, not a view.
        ignoreViewQuery: true,
        take: this.knowledgeConfig.maxKnowledgeNodes + 1,
      },
      true
    );
  }

  /**
   * Resolves field ids by name and asserts each against its expected type. A
   * wrong assumption here otherwise surfaces as an opaque 400 from the filter
   * layer or a silently empty graph, so it fails loudly instead.
   */
  private async resolveFields(
    tableId: string,
    specs: IFieldSpec[]
  ): Promise<Map<string, IResolvedField>> {
    const fields = await this.recordService.getFieldsByProjection(tableId);
    const byName = new Map(fields.map((f) => [f.name, f]));
    const resolved = new Map<string, IResolvedField>();

    for (const spec of specs) {
      const field = byName.get(spec.name);
      if (!field) {
        if (spec.required) {
          throw new CustomHttpException(
            `Table ${tableId} has no field named "${spec.name}"`,
            HttpErrorCode.NOT_FOUND
          );
        }
        continue;
      }
      if (!spec.types.includes(field.type)) {
        throw new CustomHttpException(
          `Field "${spec.name}" on table ${tableId} is ${field.type}, expected one of ${spec.types.join(', ')}`,
          HttpErrorCode.VALIDATION_ERROR
        );
      }
      if (spec.singleValued && field.isMultipleCellValue) {
        throw new CustomHttpException(
          `Field "${spec.name}" on table ${tableId} is multi-valued; a knowledge belongs to exactly one type`,
          HttpErrorCode.VALIDATION_ERROR
        );
      }
      resolved.set(spec.name, {
        id: field.id,
        name: field.name,
        type: field.type,
        isMultipleCellValue: Boolean(field.isMultipleCellValue),
      });
    }
    return resolved;
  }

  private required(
    fields: Map<string, IResolvedField>,
    name: string,
    tableId: string
  ): IResolvedField {
    const field = fields.get(name);
    if (!field) {
      throw new CustomHttpException(
        `Table ${tableId} has no field named "${name}"`,
        HttpErrorCode.NOT_FOUND
      );
    }
    return field;
  }

  /**
   * The configured tables must belong to the base in the route, otherwise any
   * member of any base could read the knowledge tables through their own base.
   *
   * getUpperIdByTableId throws NOT_FOUND itself when the table is missing or
   * soft-deleted, so only the ownership comparison is left to do here.
   */
  private async assertTablesInBase(baseId: string, tableIds: string[]): Promise<void> {
    for (const tableId of tableIds) {
      const { baseId: owner } = await this.permissionService.getUpperIdByTableId(tableId);
      if (owner !== baseId) {
        throw new CustomHttpException(
          `Knowledge table ${tableId} does not belong to base ${baseId}`,
          HttpErrorCode.NOT_FOUND
        );
      }
    }
  }
}
