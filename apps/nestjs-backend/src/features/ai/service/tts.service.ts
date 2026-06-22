import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import type { Response } from 'express';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  async tts(text: string, response: Response): Promise<void> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL';
    const modelId = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2';

    if (!apiKey) {
      this.logger.warn('[tts] ELEVENLABS_API_KEY is not set');
      if (!response.headersSent) {
        response.status(503).json({ error: 'TTS service not configured' });
      }
      return;
    }

    // Abort the upstream TTS request when the client disconnects (M1).
    const controller = new AbortController();
    response.on('close', () => controller.abort());

    try {
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({ text, model_id: modelId }),
          signal: controller.signal,
        }
      );

      if (!upstream.ok) {
        const errorBody = await upstream.text();
        this.logger.error(
          `[tts] ElevenLabs error — HTTP ${upstream.status} | voice=${voiceId} model=${modelId} | body=${errorBody}`
        );
        if (!response.headersSent) {
          response
            .status(502)
            .json({ error: 'TTS upstream error', detail: `HTTP ${upstream.status}` });
        }
        return;
      }

      response.setHeader('Content-Type', 'audio/mpeg');
      response.setHeader('Transfer-Encoding', 'chunked');
      Readable.fromWeb(upstream.body as import('stream/web').ReadableStream).pipe(response);
    } catch (err) {
      // Client disconnected — the abort is expected.
      if (controller.signal.aborted) return;
      const detail = (err as Error).message;
      this.logger.error(`[tts] fetch error — ${detail} | voice=${voiceId} model=${modelId}`);
      if (!response.headersSent) {
        response.status(502).json({ error: 'TTS upstream error', detail });
      }
    }
  }
}
