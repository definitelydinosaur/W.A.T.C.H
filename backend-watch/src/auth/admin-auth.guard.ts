import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { Request } from 'express';

type AdminRequest = Request & { user: { id: string } };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('A valid admin session is required.');
    }

    const supabaseUrl = this.config.get<string>('SUPABASE_URL')?.trim();
    const serviceKey =
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
      this.config.get<string>('SUPABASE_SERVICE_KEY')?.trim();
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase server credentials are not configured.');
    }

    const token = authorization.slice(7);
    const client = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Admin session is invalid or expired.');
    }

    const roleResult = await client.rpc('is_admin');
    const isAdmin: unknown = roleResult.data;
    if (roleResult.error) {
      throw new ForbiddenException('Admin role could not be verified.');
    }
    if (isAdmin !== true) {
      throw new ForbiddenException('Administrator role is required.');
    }

    request.user = { id: data.user.id };
    return true;
  }
}
