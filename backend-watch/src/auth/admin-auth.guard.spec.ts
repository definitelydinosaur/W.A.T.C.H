import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AdminAuthGuard } from './admin-auth.guard';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('AdminAuthGuard', () => {
  const request = {
    headers: { authorization: 'Bearer user-session-token' },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  const config = {
    get: (name: string) =>
      name === 'SUPABASE_URL'
        ? 'https://example.supabase.co'
        : 'server-only-key',
  } as ConfigService;
  const createClientMock = jest.mocked(createClient);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a valid non-admin user with 403 after checking is_admin()', async () => {
    const client = {
      auth: {
        getUser: jest
          .fn<() => Promise<{ data: { user: { id: string } }; error: null }>>()
          .mockResolvedValue({
            data: { user: { id: 'regular-user-id' } },
            error: null,
          }),
      },
      rpc: jest
        .fn<(functionName: string) => Promise<{ data: boolean; error: null }>>()
        .mockResolvedValue({
          data: false,
          error: null,
        }),
    };
    createClientMock.mockReturnValue(client as never);

    const guard = new AdminAuthGuard(config);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.rpc).toHaveBeenCalledWith('is_admin');
    expect(request).not.toHaveProperty('user');
  });

  it('allows an authenticated admin and attaches the verified user ID', async () => {
    const client = {
      auth: {
        getUser: jest
          .fn<() => Promise<{ data: { user: { id: string } }; error: null }>>()
          .mockResolvedValue({
            data: { user: { id: 'admin-user-id' } },
            error: null,
          }),
      },
      rpc: jest
        .fn<(functionName: string) => Promise<{ data: boolean; error: null }>>()
        .mockResolvedValue({
          data: true,
          error: null,
        }),
    };
    createClientMock.mockReturnValue(client as never);

    const guard = new AdminAuthGuard(config);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty('user', { id: 'admin-user-id' });
  });
});
