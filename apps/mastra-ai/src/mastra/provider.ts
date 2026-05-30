import { createGateway } from '@ai-sdk/gateway';
import { env } from './env';

// Shared Vercel AI Gateway provider instance.
// Configure AI_GATEWAY_API_KEY in .env.
// Provider keys (OpenAI, Anthropic, etc.) are managed in your Vercel project settings.
export const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
