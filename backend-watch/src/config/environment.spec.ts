import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails fast with required variable names and no values', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      validateEnvironment({
        SUPABASE_URL: '',
        SUPABASE_SERVICE_KEY: '',
        AI_API_KEY: 'must-not-be-printed',
      }),
    ).toThrow(
      'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY',
    );
    expect(error).toHaveBeenCalledWith(
      'Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY',
    );
    expect(error.mock.calls.flat().join(' ')).not.toContain(
      'must-not-be-printed',
    );
  });

  it('allows missing optional credentials and AI key without failing startup', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});

    expect(() =>
      validateEnvironment({
        SUPABASE_URL: 'https://supabase.example.test',
        SUPABASE_SERVICE_KEY: 'test-service-key',
      }),
    ).not.toThrow();
    expect(info.mock.calls.flat().join(' ')).toContain('AI_API_KEY');
    expect(info.mock.calls.flat().join(' ')).toContain('CHATBOT_API_URL');
  });

  it('accepts either Supabase service key variable', () => {
    expect(() =>
      validateEnvironment({
        SUPABASE_URL: 'https://supabase.example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        AI_PROVIDER: 'gemini',
        AI_API_KEY: 'test-ai-key',
      }),
    ).not.toThrow();
  });
});
