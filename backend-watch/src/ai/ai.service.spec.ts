import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { AiService } from './ai.service';

function createAiService(provider: Pick<AiProviderService, 'generateText'>) {
  const config = {
    get: () => undefined,
  } as unknown as ConfigService;
  return new AiService(config, provider as AiProviderService);
}

describe('AiService provider fallbacks', () => {
  it('uses a source-only fallback when official announcement classification fails', async () => {
    const generateText = jest
      .fn<AiProviderService['generateText']>()
      .mockRejectedValue(new Error('AI is not configured.'));
    const service = createAiService({ generateText });

    const result = await service.classifyLocalAnnouncement({
      text: 'Classes are suspended tomorrow due to heavy rain.',
      sourceName: 'Private person',
      city: 'Private City',
      postedAt: '2026-11-23T00:00:00Z',
    });

    expect(result.category).toBe('class_suspension');
    expect(result.effective_date).toBeNull();
    expect(result.affects_location).toBeNull();
    expect(result.summary).toContain('Original source notice');
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0]).not.toContain('Private person');
    expect(generateText.mock.calls[0][0]).not.toContain('Private City');
  });

  it('falls back to the original announcement text when summary generation fails', async () => {
    const generateText = jest
      .fn<AiProviderService['generateText']>()
      .mockRejectedValue(new Error('AI is not configured.'));
    const service = createAiService({ generateText });

    const result = await service.summarizeAnnouncement({
      text: 'Public notice: maintenance starts at 10pm. contact user@example.com',
      sourceUrl: 'https://official.example.test/post',
    });

    expect(result.aiUnavailable).toBe(true);
    expect(result.summary).toContain('Public notice');
    expect(generateText.mock.calls[0][0]).not.toContain(
      'official.example.test',
    );
    expect(generateText.mock.calls[0][0]).not.toContain('user@example.com');
  });

  it('returns a specific error instead of formatting when AI is unavailable', async () => {
    const service = createAiService({
      generateText: jest
        .fn<AiProviderService['generateText']>()
        .mockRejectedValue(
          new ServiceUnavailableException('AI is not configured.'),
        ),
    });

    await expect(
      service.formatSystemAnnouncement({
        rawText: 'System maintenance tomorrow 10pm to 12am, app may not work',
      }),
    ).rejects.toThrow('AI is not configured');
  });
});
