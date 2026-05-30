import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runLookupMigrations } from '../../db/migrations.js';
import { lookupPool } from '../../db/vector-pool.js';
import { postgresVector, initDealMasteryIndex, initDDWorksheetIndex } from '../../memory/index.js';
import {
  dealMasterySearchTool,
  acronymLookupTool,
  industryMultipleLookupTool,
  ddChecklistSearchTool,
} from '../deal-mastery-tools.js';
import { knowledgeAgent } from '../../agents/knowledge-agent.js';

beforeAll(async () => {
  await runLookupMigrations();
});

afterAll(async () => {
  await lookupPool.end();
});

describe('lookup migrations', () => {
  it('M-1: knowledge_acronyms table exists after migration', async () => {
    const { rows } = await lookupPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'lookup_schema' AND table_name = 'knowledge_acronyms'
    `);
    expect(rows).toHaveLength(1);
  });

  it('M-2: knowledge_industry_multiples table exists after migration', async () => {
    const { rows } = await lookupPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'lookup_schema' AND table_name = 'knowledge_industry_multiples'
    `);
    expect(rows).toHaveLength(1);
  });
});

describe('pgvector indexes', () => {
  it('V-1: deal_mastery index exists after init', async () => {
    await initDealMasteryIndex();
    const existing = await postgresVector.listIndexes();
    expect(existing).toContain('deal_mastery');
  });

  it('V-2: dd_worksheet index exists after init', async () => {
    await initDDWorksheetIndex();
    const existing = await postgresVector.listIndexes();
    expect(existing).toContain('dd_worksheet');
  });
});

describe('dealMasterySearchTool', () => {
  it('D-1: returns results for a concept query', async () => {
    const result = await dealMasterySearchTool.execute!(
      { query: 'vendor finance strategy', topK: 3 },
      {}
    );
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it('D-2: each result includes content, key, type, pillar', async () => {
    const result = await dealMasterySearchTool.execute!({ query: 'cash on hand', topK: 1 }, {});
    const r = result.results[0];
    expect(r.content).toBeTruthy();
    expect(r.key).toBeTruthy();
    expect(['methodology', 'execution']).toContain(r.type);
    expect(r.pillar).toBeTruthy();
  });

  it('D-3: includePair=true returns sibling chunk for paired concepts', async () => {
    const result = await dealMasterySearchTool.execute!(
      { query: 'cash on hand', topK: 1, includePair: true },
      {}
    );
    const withPair = result.results.filter((r) => r.sibling !== undefined);
    expect(withPair.length).toBeGreaterThan(0);
    expect(withPair[0].sibling!.type).not.toBe(withPair[0].type);
    expect(withPair[0].sibling!.content).toBeTruthy();
  });

  it('D-4: filterPillarSlug restricts results to that pillar', async () => {
    const result = await dealMasterySearchTool.execute!(
      { query: 'business overview', topK: 5, filterPillarSlug: 'deal-analysis-business' },
      {}
    );
    expect(result.results.length).toBeGreaterThan(0);
    result.results.forEach((r) => expect(r.pillarSlug).toBe('deal-analysis-business'));
  });

  it('D-5: filterType=methodology returns only methodology chunks', async () => {
    const result = await dealMasterySearchTool.execute!(
      { query: 'vendor finance', topK: 5, filterType: 'methodology' },
      {}
    );
    result.results.forEach((r) => expect(r.type).toBe('methodology'));
  });
});

describe('acronymLookupTool', () => {
  it('A-1: returns expansion for known acronym EBITDA', async () => {
    const result = await acronymLookupTool.execute!({ acronym: 'EBITDA' }, {});
    expect(result.found).toBe(true);
    expect(result.expansion).toBeTruthy();
  });

  it('A-2: case-insensitive — ebitda matches EBITDA', async () => {
    const result = await acronymLookupTool.execute!({ acronym: 'ebitda' }, {});
    expect(result.found).toBe(true);
  });

  it('A-3: unknown acronym returns found=false', async () => {
    const result = await acronymLookupTool.execute!({ acronym: 'ZZUNKNOWNXYZ' }, {});
    expect(result.found).toBe(false);
    expect(result.expansion).toBeUndefined();
  });
});

describe('industryMultipleLookupTool', () => {
  it('IM-1: returns result for partial industry name "Software"', async () => {
    const result = await industryMultipleLookupTool.execute!({ industry: 'Software' }, {});
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].multiple).toBeGreaterThan(0);
  });

  it('IM-2: returns multiple matches for "Medical"', async () => {
    const result = await industryMultipleLookupTool.execute!({ industry: 'Medical' }, {});
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('IM-3: unknown industry returns empty results', async () => {
    const result = await industryMultipleLookupTool.execute!(
      { industry: 'ZzUnknownIndustryXyZ' },
      {}
    );
    expect(result.results).toHaveLength(0);
  });
});

describe('ddChecklistSearchTool', () => {
  it('DD-1: returns checklist items for a relevant query', async () => {
    const result = await ddChecklistSearchTool.execute!(
      { query: 'financial statements', topK: 3 },
      {}
    );
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('DD-2: each result has itemNumber and item text', async () => {
    const result = await ddChecklistSearchTool.execute!(
      { query: 'tax compliance ATO', topK: 1 },
      {}
    );
    const r = result.results[0];
    expect(r.itemNumber).toBeGreaterThan(0);
    expect(r.item).toBeTruthy();
  });

  it('DD-3: top result score for a relevant query is >= 0.5', async () => {
    const result = await ddChecklistSearchTool.execute!(
      { query: 'company structure vendor verification', topK: 1 },
      {}
    );
    expect(result.results[0].score).toBeGreaterThanOrEqual(0.5);
  });
});

describe('knowledge agent tools', () => {
  it('AG-1: agent has all 7 required tools registered', async () => {
    const tools = await knowledgeAgent.getToolsForExecution({});
    const toolIds = Object.values(tools).map((t: any) => t.id);
    expect(toolIds).toContain('deal-mastery-search');
    expect(toolIds).toContain('acronym-lookup');
    expect(toolIds).toContain('industry-multiple-lookup');
    expect(toolIds).toContain('dd-checklist-search');
    expect(toolIds).toContain('knowledge-ingest');
    expect(toolIds).toContain('knowledge-search');
    expect(toolIds).toContain('knowledge-delete');
  });
});
