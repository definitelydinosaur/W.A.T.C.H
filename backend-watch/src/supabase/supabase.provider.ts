import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

export const SupabaseProvider = {
  provide: SUPABASE_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const supabaseUrl = configService.get<string>('SUPABASE_URL')?.trim();
    const supabaseKey =
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
      configService.get<string>('SUPABASE_SERVICE_KEY')?.trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase environment variables. Set SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY in your .env file.',
      );
    }

    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  },
};
