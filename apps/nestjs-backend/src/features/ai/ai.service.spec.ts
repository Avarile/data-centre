import { LLMProviderType } from '@teable/openapi';
import { describe, expect, it } from 'vitest';
import { ModelCapabilityService } from './service/model-capability.service';

const openAIProviderName = 'custom-openai';
const openRouterProviderName = 'custom-openrouter';
const gptImage2Model = 'gpt-image-2';
const openRouterModel = `openai/${gptImage2Model}`;
const imageGenerationTag = 'image-generation';

const modelResolverService = {
  parseModelKey: (modelKey: string) => {
    const [type, model, name] = modelKey.split('@');
    return { type, model, name };
  },
};

const service = Object.create(ModelCapabilityService.prototype) as ModelCapabilityService;
(service as never as Record<string, unknown>).modelResolverService = modelResolverService;

describe('AiService.getModelTags', () => {
  it('does not infer tags for direct OpenAI GPT image models without explicit config', async () => {
    const tags = await service.getModelTags(
      `${LLMProviderType.OPENAI}@${gptImage2Model}@${openAIProviderName}`,
      [
        {
          type: LLMProviderType.OPENAI,
          name: openAIProviderName,
          models: gptImage2Model,
        },
      ]
    );

    expect(tags).toEqual([]);
  });

  it('returns explicit direct OpenAI GPT image tags without inference', async () => {
    const tags = await service.getModelTags(
      `${LLMProviderType.OPENAI}@${gptImage2Model}@${openAIProviderName}`,
      [
        {
          type: LLMProviderType.OPENAI,
          name: openAIProviderName,
          models: gptImage2Model,
          modelConfigs: {
            [gptImage2Model]: {
              tags: [imageGenerationTag],
            },
          },
        },
      ]
    );

    expect(tags).toEqual([imageGenerationTag]);
  });

  it('does not infer tags for OpenRouter models without explicit config', async () => {
    const tags = await service.getModelTags(
      `${LLMProviderType.OPENROUTER}@${openRouterModel}@${openRouterProviderName}`,
      [
        {
          type: LLMProviderType.OPENROUTER,
          name: openRouterProviderName,
          models: openRouterModel,
        },
      ]
    );

    expect(tags).toEqual([]);
  });
});
