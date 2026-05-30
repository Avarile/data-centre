import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { gateway } from '../provider.js';
import { postgresVector } from '../memory/index.js';
import { lookupPool } from '../db/vector-pool.js';

const DIMENSION = 1536;
const unitVector = new Array<number>(DIMENSION).fill(1 / Math.sqrt(DIMENSION));

async function embedText(text: string): Promise<number[]> {
  const model = gateway.textEmbeddingModel('openai/text-embedding-3-small');
  const { embeddings } = await model.doEmbed({ values: [text] });
  return Array.from(embeddings[0]);
}

const siblingSchema = z.object({
  id: z.string(),
  content: z.string(),
  type: z.enum(['methodology', 'execution']),
});

const dealMasteryResultSchema = z.object({
  id: z.string(),
  score: z.number(),
  content: z.string(),
  key: z.string(),
  type: z.enum(['methodology', 'execution']),
  pillar: z.string(),
  pillarSlug: z.string(),
  pairId: z.string(),
  day: z.number(),
  aliases: z.array(z.string()),
  hasPair: z.boolean(),
  sibling: siblingSchema.optional(),
});

type DealMasteryResult = z.infer<typeof dealMasteryResultSchema>;

function mapRawToDealResult(r: any): DealMasteryResult {
  return {
    id: r.id,
    score: r.score ?? 0,
    content: (r.metadata?.content as string) ?? '',
    key: (r.metadata?.key as string) ?? '',
    type: (r.metadata?.type as 'methodology' | 'execution') ?? 'methodology',
    pillar: (r.metadata?.pillar as string) ?? '',
    pillarSlug: (r.metadata?.pillarSlug as string) ?? '',
    pairId: (r.metadata?.pairId as string) ?? '',
    day: (r.metadata?.day as number) ?? 0,
    aliases: (r.metadata?.aliases as string[]) ?? [],
    hasPair: (r.metadata?.hasPair as boolean) ?? false,
  };
}

// ─────────────────────────────────────────────
// Tool: deal-mastery-search
// ─────────────────────────────────────────────
export const dealMasterySearchTool = createTool({
  id: 'deal-mastery-search',
  description:
    'Search the Deal Mastery knowledge base for M&A concepts, strategies, and frameworks. ' +
    'Set includePair=true to also retrieve the complementary Methodology or Execution chunk for each result — ' +
    'use this when the user needs a complete picture (both the "why" and the "how"). ' +
    'Optionally filter by pillarSlug (e.g. "deal-strategies-pre-deal") or type ("methodology" | "execution").',
  inputSchema: z.object({
    query: z.string().describe('Natural language question or keyword phrase'),
    topK: z.number().int().min(1).max(10).optional().default(5),
    includePair: z
      .boolean()
      .optional()
      .default(false)
      .describe('Fetch the sibling Methodology/Execution chunk for each paired result'),
    filterPillarSlug: z
      .string()
      .optional()
      .describe('Restrict to a pillar, e.g. "deal-strategies-pre-deal", "deal-analysis-business"'),
    filterType: z
      .enum(['methodology', 'execution'])
      .optional()
      .describe('Restrict to only methodology or only execution chunks'),
  }),
  outputSchema: z.object({
    results: z.array(dealMasteryResultSchema),
    totalFound: z.number(),
  }),
  execute: async ({ query, topK, includePair, filterPillarSlug, filterType }) => {
    const queryVector = await embedText(query);

    const filter: Record<string, unknown> = {};
    if (filterPillarSlug) filter['pillarSlug'] = filterPillarSlug;
    if (filterType) filter['type'] = filterType;

    const raw = await postgresVector.query({
      indexName: 'deal_mastery',
      queryVector,
      topK: topK ?? 5,
      filter: Object.keys(filter).length ? filter : undefined,
      includeVector: false,
    });

    const results: DealMasteryResult[] = raw.map(mapRawToDealResult);

    if (includePair && results.length > 0) {
      const pairCandidates = results.filter((r) => r.hasPair);

      const siblings = await Promise.all(
        pairCandidates.map(async (hit) => {
          const sibRaw = await postgresVector.query({
            indexName: 'deal_mastery',
            queryVector: unitVector,
            topK: 2,
            filter: { pairId: hit.pairId },
            includeVector: false,
          });
          return sibRaw.find((s) => s.metadata?.type !== hit.type) ?? null;
        })
      );

      for (let i = 0; i < results.length; i++) {
        const candIdx = pairCandidates.findIndex((c) => c.id === results[i].id);
        const sib = candIdx >= 0 ? siblings[candIdx] : null;
        if (sib) {
          results[i] = {
            ...results[i],
            sibling: {
              id: sib.id,
              content: (sib.metadata?.content as string) ?? '',
              type: (sib.metadata?.type as 'methodology' | 'execution') ?? 'execution',
            },
          };
        }
      }
    }

    return { results, totalFound: results.length };
  },
});

// ─────────────────────────────────────────────
// Tool: acronym-lookup
// ─────────────────────────────────────────────
export const acronymLookupTool = createTool({
  id: 'acronym-lookup',
  description:
    'Look up what a business or M&A acronym stands for. Case-insensitive exact match. ' +
    'Examples: EBITDA, LOI, APA, DCF, LBO, CIM, FDD.',
  inputSchema: z.object({
    acronym: z.string().describe('The acronym to expand, e.g. "EBITDA"'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    acronym: z.string(),
    expansion: z.string().optional(),
  }),
  execute: async ({ acronym }) => {
    const { rows } = await lookupPool.query<{ acronym: string; expansion: string }>(
      `SELECT acronym, expansion
       FROM lookup_schema.knowledge_acronyms
       WHERE UPPER(acronym) = UPPER($1)
       LIMIT 1`,
      [acronym]
    );
    if (rows.length === 0) return { found: false, acronym };
    return { found: true, acronym: rows[0].acronym, expansion: rows[0].expansion };
  },
});

// ─────────────────────────────────────────────
// Tool: industry-multiple-lookup
// ─────────────────────────────────────────────
export const industryMultipleLookupTool = createTool({
  id: 'industry-multiple-lookup',
  description:
    'Look up the EV/EBITDA valuation multiple for an industry. ' +
    'Accepts partial names (e.g. "SaaS", "Medical", "Retail"). Returns up to 5 closest matches.',
  inputSchema: z.object({
    industry: z.string().describe('Full or partial industry name'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        industry: z.string(),
        multiple: z.number(),
        yearRange: z.string().optional(),
      })
    ),
  }),
  execute: async ({ industry }) => {
    const { rows } = await lookupPool.query<{
      industry: string;
      multiple: string;
      year_range: string;
    }>(
      `SELECT industry, multiple, year_range
       FROM lookup_schema.knowledge_industry_multiples
       WHERE industry ILIKE $1
       ORDER BY industry
       LIMIT 5`,
      [`%${industry}%`]
    );
    return {
      results: rows.map((r) => ({
        industry: r.industry,
        multiple: parseFloat(r.multiple),
        yearRange: r.year_range ?? undefined,
      })),
    };
  },
});

// ─────────────────────────────────────────────
// Tool: dd-checklist-search
// ─────────────────────────────────────────────
export const ddChecklistSearchTool = createTool({
  id: 'dd-checklist-search',
  description:
    'Search the Due Diligence worksheet checklist for relevant items. ' +
    'Use for queries about what to check during deal discovery: ' +
    '"tax", "financial statements", "employee entitlements", "contracts", etc.',
  inputSchema: z.object({
    query: z.string().describe('Search phrase for due diligence items'),
    topK: z.number().int().min(1).max(20).optional().default(10),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        score: z.number(),
        itemNumber: z.number(),
        item: z.string(),
      })
    ),
    totalFound: z.number(),
  }),
  execute: async ({ query, topK }) => {
    const queryVector = await embedText(query);
    const raw = await postgresVector.query({
      indexName: 'dd_worksheet',
      queryVector,
      topK: topK ?? 10,
      includeVector: false,
    });
    const results = raw.map((r) => ({
      id: r.id,
      score: r.score ?? 0,
      itemNumber: (r.metadata?.itemNumber as number) ?? 0,
      item: (r.metadata?.item as string) ?? '',
    }));
    return { results, totalFound: results.length };
  },
});
