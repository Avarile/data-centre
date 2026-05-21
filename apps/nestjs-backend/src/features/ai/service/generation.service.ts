import { Injectable, Logger } from '@nestjs/common';
import { Task } from '@teable/openapi';
import type { IAiGenerateRo } from '@teable/openapi';
import type { ModelMessage } from 'ai';
import { generateText, streamText } from 'ai';
import type { Response } from 'express';
import { ChatFileService } from '../../chat-file/chat-file.service';
import { runGeneralInfoAgent } from '../agents/general-agents';
import type { AgentInput } from '../agents/general-agents';
import { runIngestionAgent } from '../agents/ingestion-agent';
import { getTaskModelKey } from '../util';
import { AiConfigService } from './ai-config.service';
import { ModelCapabilityService } from './model-capability.service';
import { ModelResolverService } from './model-resolver.service';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly aiConfigService: AiConfigService,
    private readonly modelResolverService: ModelResolverService,
    private readonly modelCapabilityService: ModelCapabilityService,
    private readonly chatFileService: ChatFileService
  ) {}

  private async injectFileContext(
    prompt: string,
    fileTokens: string[] | undefined
  ): Promise<string> {
    if (!fileTokens?.length) return prompt;
    const context = await this.chatFileService.buildFileContext(fileTokens);
    if (!context) return prompt;
    return `<file_context>\n${context}\n</file_context>\n\n${prompt}`;
  }

  private async injectFileContextToMessages(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    fileTokens: string[] | undefined
  ): Promise<ModelMessage[]> {
    if (!fileTokens?.length) return messages as ModelMessage[];
    const context = await this.chatFileService.buildFileContext(fileTokens);
    if (!context) return messages as ModelMessage[];

    const result: Array<{ role: 'user' | 'assistant'; content: string }> = [...messages];
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].role === 'user') {
        result[i] = {
          role: 'user',
          content: `${result[i].content}\n\n<file_context>\n${context}\n</file_context>`,
        };
        break;
      }
    }
    return result as ModelMessage[];
  }

  async generateStream(
    baseId: string,
    aiGenerateRo: IAiGenerateRo,
    response: Response
  ): Promise<void> {
    try {
      const {
        prompt,
        messages,
        fileTokens,
        modelKey: _modelKey,
        task = Task.Coding,
      } = aiGenerateRo;
      const config = await this.aiConfigService.getAIConfig(baseId);
      const modelKey = _modelKey ?? getTaskModelKey(config, task);
      if (!modelKey) throw new Error('Model key is not set');

      const modelInstance = await this.modelResolverService.getModelInstance(
        modelKey,
        config.llmProviders
      );

      // Only use the tool-calling agent when the model explicitly supports tool use.
      // Sending tools to a model that doesn't support them causes a 500 from the gateway.
      const tags = await this.modelCapabilityService.getModelTags(modelKey, config.llmProviders);
      const supportsTools = tags.includes('tool-use');

      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

      if (supportsTools) {
        let input: AgentInput;
        if (messages?.length) {
          input = { messages: await this.injectFileContextToMessages(messages, fileTokens) };
        } else {
          input = { prompt: await this.injectFileContext(prompt ?? '', fileTokens) };
        }

        const result = await runGeneralInfoAgent(modelInstance, input);

        let totalText = 0;
        for await (const chunk of result.textStream) {
          if (chunk) {
            totalText += chunk.length;
            response.write(chunk);
          }
        }
        if (totalText === 0) {
          response.write(
            'I searched the database but could not find any records matching your query. ' +
              'Please try rephrasing your question or provide more specific terms.'
          );
        }
      } else {
        let streamInput: Parameters<typeof streamText>[0];
        if (messages?.length) {
          const hydratedMessages = await this.injectFileContextToMessages(messages, fileTokens);
          streamInput = { model: modelInstance, messages: hydratedMessages };
        } else {
          streamInput = {
            model: modelInstance,
            prompt: await this.injectFileContext(prompt ?? '', fileTokens),
          };
        }

        const result = streamText(streamInput);
        for await (const chunk of result.textStream) {
          if (chunk) response.write(chunk);
        }
      }

      response.end();
    } catch (err) {
      if (!response.headersSent) throw err;
      this.logger.error(`[generateStream] Error after headers sent: ${(err as Error).message}`);
      response.end();
    }
  }

  async ingestStream(
    baseId: string,
    files: { buffer: Buffer; mimetype: string; originalname: string }[],
    targetTable: string,
    description: string | undefined,
    response: Response
  ): Promise<void> {
    try {
      const config = await this.aiConfigService.getAIConfig(baseId);
      const modelKey = getTaskModelKey(config, Task.Coding);
      if (!modelKey) throw new Error('Model key is not set');

      const modelInstance = await this.modelResolverService.getModelInstance(
        modelKey,
        config.llmProviders
      );

      const fileParts = await Promise.all(
        files.map(async (f) => {
          const text = await this.chatFileService.extractTextFromBuffer(f.buffer, f.mimetype);
          return text ? `--- File: ${f.originalname} ---\n${text}` : null;
        })
      );
      const fileContext = fileParts.filter(Boolean).join('\n\n');

      const descriptionLine = description ? `\nAdditional instructions: ${description}` : '';
      const prompt =
        `Ingest the following file content into the table named "${targetTable}".${descriptionLine}\n\n` +
        `<file_context>\n${fileContext}\n</file_context>`;

      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

      const result = await runIngestionAgent(modelInstance, { prompt });

      let totalText = 0;
      for await (const chunk of result.textStream) {
        if (chunk) {
          totalText += chunk.length;
          response.write(chunk);
        }
      }
      if (totalText === 0) {
        response.write('Ingestion completed but the agent produced no output. Please try again.');
      }

      response.end();
    } catch (err) {
      if (!response.headersSent) throw err;
      this.logger.error(`[ingestStream] Error after headers sent: ${(err as Error).message}`);
      response.end();
    }
  }

  async generateText(baseId: string, aiGenerateRo: IAiGenerateRo) {
    const { prompt, modelKey: _modelKey, task = Task.Coding } = aiGenerateRo;
    const config = await this.aiConfigService.getAIConfig(baseId);
    const modelKey = _modelKey ?? getTaskModelKey(config, task);
    if (!modelKey) throw new Error('Model key is not set');
    const modelInstance = await this.modelResolverService.getModelInstance(
      modelKey,
      config.llmProviders
    );

    const { text } = await generateText({
      model: modelInstance,
      prompt,
    });
    return text;
  }
}
