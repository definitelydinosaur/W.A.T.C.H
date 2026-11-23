import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type AiProvider = 'gemini' | 'groq' | 'openrouter' | 'anthropic';

const DEFAULT_MODELS: Partial<Record<AiProvider, string>> = {
  gemini: 'gemini-3.5-flash-lite',
};

const DEFAULT_BASE_URLS: Record<AiProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly config: ConfigService) {}

  async generateText(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('AI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI is not configured. Add AI_API_KEY to the backend environment.',
      );
    }

    const providerValue =
      this.config.get<string>('AI_PROVIDER')?.trim().toLowerCase() || 'gemini';
    if (
      !['gemini', 'groq', 'openrouter', 'anthropic'].includes(providerValue)
    ) {
      throw new ServiceUnavailableException(
        'Unsupported AI_PROVIDER. Choose gemini, groq, openrouter, or anthropic.',
      );
    }
    const provider = providerValue as AiProvider;
    const model =
      this.config.get<string>('AI_MODEL')?.trim() || DEFAULT_MODELS[provider];
    if (!model) {
      throw new ServiceUnavailableException(
        `AI_MODEL is required when AI_PROVIDER is ${provider}.`,
      );
    }

    const baseUrl = (
      this.config.get<string>('AI_BASE_URL')?.trim() ||
      DEFAULT_BASE_URLS[provider]
    ).replace(/\/+$/, '');
    const request = this.createRequest(
      provider,
      model,
      apiKey,
      prompt,
      baseUrl,
    );
    const response = await this.fetchWithRetry(
      request.url,
      request.init,
      provider,
    );
    if (!response.ok) {
      const status = response.status;
      this.logger.warn(`${provider} returned HTTP ${status}.`);
      if (status === 401 || status === 403) {
        throw new ServiceUnavailableException(
          `AI provider rejected its credentials (HTTP ${status}). Check AI_API_KEY and the provider account.`,
        );
      }
      if (status === 404) {
        throw new ServiceUnavailableException(
          `AI model or endpoint was not found (HTTP 404). Check AI_PROVIDER, AI_MODEL, and AI_BASE_URL.`,
        );
      }
      throw new ServiceUnavailableException(
        `${provider} rejected the AI request (HTTP ${status}). Check the model and provider settings.`,
      );
    }

    const body: unknown = await response.json();
    const text = this.extractText(provider, body);
    if (!text) {
      throw new ServiceUnavailableException(
        'AI provider returned no text. The request may have been blocked by a safety filter.',
      );
    }
    return text;
  }

  private createRequest(
    provider: AiProvider,
    model: string,
    apiKey: string,
    prompt: string,
    baseUrl: string,
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    let url: string;
    let body: Record<string, unknown>;

    if (provider === 'gemini') {
      url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
      headers['x-goog-api-key'] = apiKey;
      body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 1200,
        },
      };
    } else if (provider === 'anthropic') {
      url = `${baseUrl}/messages`;
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model,
        max_tokens: 1200,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      };
    } else {
      url = `${baseUrl}/chat/completions`;
      headers.Authorization = `Bearer ${apiKey}`;
      body = {
        model,
        ...(provider === 'groq'
          ? { max_completion_tokens: 1200 }
          : { max_tokens: 1200 }),
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      };
    }

    return {
      url,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      } satisfies RequestInit,
    };
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    provider: AiProvider,
  ) {
    let lastFailure: 'network' | 'rate_limit' | 'server' = 'network';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(20_000),
        });
        if (
          response.status !== 429 &&
          (response.status < 500 || response.status > 599)
        ) {
          return response;
        }
        lastFailure = response.status === 429 ? 'rate_limit' : 'server';
        if (attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const delay = Number.isFinite(retryAfter)
            ? Math.min(Math.max(retryAfter * 1000, 0), 3000)
            : 300 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch {
        lastFailure = 'network';
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 300 * 2 ** attempt),
          );
        }
      }
    }
    if (lastFailure === 'rate_limit') {
      throw new ServiceUnavailableException(
        `${provider} rate limit reached (HTTP 429). Wait briefly, then retry.`,
      );
    }
    if (lastFailure === 'server') {
      throw new ServiceUnavailableException(
        `${provider} is temporarily unavailable after repeated server errors. Retry later.`,
      );
    }
    throw new ServiceUnavailableException(
      `${provider} could not be reached or timed out after retries.`,
    );
  }

  private extractText(provider: AiProvider, value: unknown) {
    if (!value || typeof value !== 'object') return null;
    const result = value as Record<string, unknown>;
    if (provider === 'gemini') {
      const candidates = result.candidates;
      if (!Array.isArray(candidates)) return null;
      const content = candidates[0]?.content;
      if (!content || typeof content !== 'object') return null;
      const parts = (content as Record<string, unknown>).parts;
      if (!Array.isArray(parts)) return null;
      return parts
        .map((part) =>
          part && typeof part === 'object'
            ? (part as Record<string, unknown>).text
            : null,
        )
        .filter((part): part is string => typeof part === 'string')
        .join('\n');
    }
    if (provider === 'anthropic') {
      const content = result.content;
      if (!Array.isArray(content)) return null;
      return content
        .filter(
          (part) =>
            part &&
            typeof part === 'object' &&
            (part as Record<string, unknown>).type === 'text',
        )
        .map((part) => (part as Record<string, unknown>).text)
        .filter((part): part is string => typeof part === 'string')
        .join('\n');
    }
    const choices = result.choices;
    if (!Array.isArray(choices)) return null;
    const message = choices[0]?.message;
    if (!message || typeof message !== 'object') return null;
    const content = (message as Record<string, unknown>).content;
    return typeof content === 'string' ? content : null;
  }
}
