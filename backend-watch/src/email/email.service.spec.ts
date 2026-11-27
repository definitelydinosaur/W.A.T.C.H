import { describe, expect, it } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const createConfig = (values: Record<string, string | undefined> = {}) =>
    ({
      get: (name: string) => values[name],
    }) as ConfigService;

  it('can be constructed when optional email credentials are absent', () => {
    expect(() => new EmailService(createConfig())).not.toThrow();
  });

  it('reports missing email configuration when email sending is requested', async () => {
    const service = new EmailService(createConfig());
    await expect(service.sendTestEmail()).rejects.toThrow(
      new ServiceUnavailableException(
        'Email notifications are not configured. Set GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_RECEIVER in the backend environment to enable email.',
      ),
    );
  });
});
