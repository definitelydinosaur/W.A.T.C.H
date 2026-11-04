import {
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SUPABASE_CLIENT } from '../../supabase/supabase.provider';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

type AuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: { full_name?: string };
};

@Injectable()
export class AuthService {
  private readonly profiles: SupabaseClient;

  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabaseClient: SupabaseClient,
    configService: ConfigService,
  ) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL')?.trim();
    const supabaseKey = (
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      configService.get<string>('SUPABASE_SERVICE_KEY')
    )?.trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase environment variables. Set SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY in your .env file.',
      );
    }

    // Sign-in stores a user session on the shared client. Profile reads and
    // writes stay on this client so they keep using the service role.
    this.profiles = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  async register(registerDto: RegisterDto) {
    const { fullName, password } = registerDto;
    const email = registerDto.email.trim().toLowerCase();

    // 1. Check whether a verified profile already exists
    const { data: existingUser, error: checkError } = await this.supabaseClient
      .from('user_info')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (checkError) {
      throw new InternalServerErrorException(
        'Unable to verify email availability.',
      );
    }

    if (existingUser) {
      throw new ConflictException(
        'This email is already registered. Please log in instead.',
      );
    }

    // 2. Create account in Supabase Authentication
    const { data, error } = await this.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const user = data.user;

    if (!user) {
      throw new BadRequestException('User registration failed.');
    }

    // 3. Detect an existing Auth account
    if (user.identities && user.identities.length === 0) {
      throw new ConflictException(
        'This email is already registered. Please log in instead.',
      );
    }

    // IMPORTANT:
    // Do not insert into user_info yet.
    // Profile creation happens after successful OTP verification.

    return {
      message: 'Registration successful. Please verify your email.',
      userId: user.id,
    };
  }

  // 4. Verify OTP and create user profile
  async verifyRegistrationOtp(email: string, token: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await this.supabaseClient.auth.verifyOtp({
      email: normalizedEmail,
      token: token.trim(),
      type: 'signup',
    });

    if (error) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const user = data.user;

    if (!user || !user.email_confirmed_at) {
      throw new BadRequestException('Email verification was unsuccessful.');
    }

    const { error: profileError } = await this.saveProfile(
      user.id,
      fullName,
      email,
    );

    if (profileError) {
      throw new BadRequestException(profileError);
    }

    return {
      message: 'Email verified and account created successfully.',
      userId: user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async verifyRegistrationOtp(email: string, token: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await this.supabaseClient.auth.verifyOtp({
      email: normalizedEmail,
      token: token.trim(),
      type: 'signup',
    });

    if (error) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const user = data.user;
    if (!user?.email_confirmed_at) {
      throw new BadRequestException('Email verification was unsuccessful.');
    }

    const name = this.profileName(user, normalizedEmail);
    const { error: profileError } = await this.saveProfile(
      user.id,
      name,
      normalizedEmail,
    );

    if (profileError) {
      throw new BadRequestException(
        'Email verified, but your account profile could not be created. Please try logging in.',
      );
    }

    if (!data.session) {
      return {
        message: 'Email verified and account created successfully.',
        userId: user.id,
      };
    }

    return {
      message: 'Email verified and account created successfully.',
      userId: user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const { password } = loginDto;
    const { data, error } = await this.supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const user = data.user;

    if (!user || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const profile = await this.loadOrCreateProfile(user);

    if (!profile) {
      throw new UnauthorizedException(
        'Your account profile is not yet available. Please complete email verification.',
      );
    }

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: profile.name ?? user.email?.split('@')[0],
      },
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  private profileName(user: AuthUser, email: string) {
    const fullName = user.user_metadata?.full_name?.trim();
    return fullName || email.split('@')[0] || 'User';
  }

  private async saveProfile(id: string, name: string, email: string) {
    const { error } = await this.profiles.from('user_info').upsert(
      {
        id,
        name,
        email,
        role: 'user',
      },
      { onConflict: 'id' },
    );

    return { error: error?.message };
  }

  private async loadOrCreateProfile(user: AuthUser) {
    const { data: profile, error: profileError } = await this.profiles
      .from('user_info')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()
      .overrideTypes<{ name: string | null }, { merge: false }>();

    if (profileError) {
      throw new BadRequestException('Unable to load your account profile.');
    }

    if (profile) {
      return profile;
    }

    if (!user.email_confirmed_at) {
      throw new UnauthorizedException(
        'Your account profile is not yet available. Please complete email verification.',
      );
    }

    const email = user.email?.trim().toLowerCase() ?? '';
    const { error } = await this.saveProfile(
      user.id,
      this.profileName(user, email),
      email,
    );

    if (error) {
      throw new BadRequestException('Unable to load your account profile.');
    }

    return { name: this.profileName(user, email) };
  }
}