import { z } from 'zod';
import { createToolCallAccuracyScorerCode } from '@mastra/evals/scorers/prebuilt';
import { createScorer } from '@mastra/core/evals';
import {
  getAssistantMessageFromRunOutput,
  getUserMessageFromRunInput,
} from '@mastra/evals/scorers/utils';
import { gateway } from '../provider';

export const knowledgeToolCallScorer = createToolCallAccuracyScorerCode({
  expectedTool: 'knowledge-search',
  strictMode: false,
});

export const sourceAttributionScorer = createScorer({
  id: 'source-attribution-scorer',
  name: 'Source Attribution',
  description: 'Checks that the agent cites title and source in its answer',
  type: 'agent',
  judge: {
    model: gateway('anthropic/claude-haiku-4.5'),
    instructions:
      'You are an expert evaluator. Determine whether the assistant response cites a document title and source when presenting retrieved knowledge. ' +
      'Return only the structured JSON matching the provided schema.',
  },
})
  .preprocess(({ run }) => ({
    assistantText: getAssistantMessageFromRunOutput(run.output) || '',
  }))
  .analyze({
    description: 'Detect whether the response includes source attribution',
    outputSchema: z.object({
      citesTitleOrSource: z.boolean(),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
Evaluate whether the assistant response includes attribution to a document title or source.

Assistant response:
"""
${results.preprocessStepResult.assistantText}
"""

Return JSON:
{
  "citesTitleOrSource": boolean,
  "explanation": string
}
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return r.citesTitleOrSource ? 1 : 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Source attribution: citesTitleOrSource=${r.citesTitleOrSource ?? false}. Score=${score}. ${r.explanation ?? ''}`;
  });

export const hallucinationScorer = createScorer({
  id: 'hallucination-scorer',
  name: 'Hallucination Detection',
  description: 'Detects facts in the response not grounded in retrieved chunks',
  type: 'agent',
  judge: {
    model: gateway('anthropic/claude-haiku-4.5'),
    instructions:
      'You are an expert fact-checker. Identify whether the assistant response introduces factual claims that are NOT present in the provided retrieved context. ' +
      'Return only the structured JSON matching the provided schema.',
  },
})
  .preprocess(({ run }) => ({
    userText: getUserMessageFromRunInput(run.input) || '',
    assistantText: getAssistantMessageFromRunOutput(run.output) || '',
  }))
  .analyze({
    description: 'Check for hallucinated facts beyond retrieved context',
    outputSchema: z.object({
      hallucinated: z.boolean(),
      confidence: z.number().min(0).max(1).default(1),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
You are evaluating whether an AI assistant hallucinated facts when answering a knowledge base query.

User question: """${results.preprocessStepResult.userText}"""

Assistant answer: """${results.preprocessStepResult.assistantText}"""

Determine if the assistant introduced facts that could not have come from a knowledge base search (e.g., specific numbers, dates, names, or claims stated with certainty that aren't cited).

Return JSON:
{
  "hallucinated": boolean,
  "confidence": number,
  "explanation": string
}
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    if (!r.hallucinated) return 1;
    return Math.max(0, 1 - (r.confidence ?? 1));
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Hallucination: hallucinated=${r.hallucinated ?? false}, confidence=${r.confidence ?? 0}. Score=${score}. ${r.explanation ?? ''}`;
  });

export const knowledgeScorers = {
  knowledgeToolCallScorer,
  sourceAttributionScorer,
  hallucinationScorer,
};
