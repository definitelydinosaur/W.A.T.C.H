import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthService } from './auth.service';
import { SupabaseProvider } from '../../supabase/supabase.provider';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('AuthService', () => {
  const config = {
    get: (name: string) =>
      name === 'SUPABASE_URL'
        ? 'https://example.supabase.co'
        : 'service-role-key',
  } as ConfigService;
  const createClientMock = jest.mocked(createClient);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps login sessions off the shared privileged client', async () => {
    const sharedClientSignIn = jest.fn();
    const sharedClient = { auth: { signInWithPassword: sharedClientSignIn } };
    const signInWithPassword = jest
      .fn<
        (credentials: { email: string; password: string }) => Promise<{
          data: {
            user: {
              id: string;
              email: string;
              email_confirmed_at: string;
            };
            session: {
              access_token: string;
              refresh_token: string;
              expires_in: number;
            };
          };
          error: null;
        }>
      >()
      .mockResolvedValue({
        data: {
          user: {
            id: 'user-id',
            email: 'user@example.com',
            email_confirmed_at: '2026-01-01T00:00:00.000Z',
          },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      });
    const authClient = {
      auth: { signInWithPassword },
    };
    const profileQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn(),
      overrideTypes: jest
        .fn<
          () => Promise<{
            data: { name: string; role: string };
            error: null;
          }>
        >()
        .mockResolvedValue({
          data: { name: 'User', role: 'user' },
          error: null,
        }),
    };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    profileQuery.maybeSingle.mockReturnValue(profileQuery);
    const profilesClient = {
      from: jest.fn().mockReturnValue(profileQuery),
    };
    createClientMock
      .mockReturnValueOnce(sharedClient as never)
      .mockReturnValueOnce(authClient as never)
      .mockReturnValueOnce(profilesClient as never);

    SupabaseProvider.useFactory(config);
    const service = new AuthService(config);
    await service.login({ email: 'user@example.com', password: 'password' });

    expect(createClientMock).toHaveBeenCalledTimes(3);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password',
    });
    expect(sharedClientSignIn).not.toHaveBeenCalled();
    expect(profilesClient.from).toHaveBeenCalledWith('user_info');
  });
});
