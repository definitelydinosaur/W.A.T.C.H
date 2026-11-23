import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AiProviderService } from './ai-provider.service';

function createProvider(config: Record<string, string | undefined>) {
  const service = new AiProviderService({
    get: (name: string) => config[name],
  } as ConfigService);
  return service;
}

describe('AiProviderService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses Gemini default model and JSON response mode', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200 },
      ),
    );
    const provider = createProvider({ AI_API_KEY: 'test-key' });

    await expect(provider.generateText('short prompt')).resolves.toBe(
      '{"ok":true}',
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
        body: expect.stringContaining('"responseMimeType":"application/json"'),
      }),
    );
  });

  it('uses OpenAI-compatible JSON mode for Groq', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        { status: 200 },
      ),
    );
    const provider = createProvider({
      AI_PROVIDER: 'groq',
      AI_API_KEY: 'test-key',
      AI_MODEL: 'test-model',
    });

    await expect(provider.generateText('short prompt')).resolves.toBe(
      '{"ok":true}',
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining(
          '"response_format":{"type":"json_object"}',
        ),
      }),
    );
  });

  it('retries rate limits and gives a specific error after the retry limit', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('', { status: 429 }));
    const provider = createProvider({
      AI_API_KEY: 'test-key',
    });

    await expect(provider.generateText('short prompt')).rejects.toThrow(
      'gemini rate limit reached (HTTP 429)',
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('reports missing AI configuration without calling a provider', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    const provider = createProvider({});

    await expect(provider.generateText('short prompt')).rejects.toThrow(
      'AI is not configured',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
