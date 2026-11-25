import { describe, expect, it, jest } from '@jest/globals';
import { SupabaseClient } from '@supabase/supabase-js';
import { InstitutionsService } from '../institutions/institutions.service';
import { ProfileService } from './users.service';

describe('ProfileService', () => {
  it('creates a missing authenticated user profile before returning it', async () => {
    const userId = 'user-id';
    const profile = {
      id: userId,
      name: 'student',
      email: 'student@example.test',
      birthdate: null,
      country: null,
      institution_id: null,
      home_location_id: null,
      location_prompt_dismissed_at: null,
    };
    const maybeSingle = jest
      .fn<() => Promise<{ data: null; error: null }>>()
      .mockResolvedValue({ data: null, error: null });
    const single = jest
      .fn<() => Promise<{ data: typeof profile; error: null }>>()
      .mockResolvedValue({ data: profile, error: null });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle,
      insert: jest.fn().mockReturnThis(),
      single,
    };
    const getUserById = jest
      .fn<
        (id: string) => Promise<{
          data: {
            user: {
              id: string;
              email: string;
              user_metadata: { full_name: string };
            };
          };
          error: null;
        }>
      >()
      .mockResolvedValue({
        data: {
          user: {
            id: userId,
            email: 'Student@Example.Test',
            user_metadata: { full_name: 'student' },
          },
        },
        error: null,
      });
    const supabase = {
      from: jest.fn().mockReturnValue(query),
      auth: { admin: { getUserById } },
    } as unknown as SupabaseClient;
    const service = new ProfileService(supabase, {} as InstitutionsService);

    const result = await service.getProfile(userId);

    expect(getUserById).toHaveBeenCalledWith(userId);
    expect(query.insert).toHaveBeenCalledWith({
      id: userId,
      name: 'student',
      email: 'student@example.test',
      role: 'user',
    });
    expect(result.profile).toMatchObject(profile);
  });
});
