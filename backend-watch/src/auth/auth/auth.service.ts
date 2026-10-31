
import {
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  Inject,
  Injectable,
} from '@nestjs/common';

import { SUPABASE_CLIENT } from '../../supabase/supabase.provider';
import { SupabaseClient } from '@supabase/supabase-js';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabaseClient: SupabaseClient,
  ) {}

  async register(registerDto: RegisterDto) {
    const { fullName, password } = registerDto;
    const email = registerDto.email.trim().toLowerCase();

    // 1. Check whether a verified profile already exists
    const { data: existingUser, error: checkError } =
      await this.supabaseClient
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

    const { data, error } =
      await this.supabaseClient.auth.verifyOtp({
        email: normalizedEmail,
        token: token.trim(),
        type: 'signup',
      });

    if (error) {
      throw new BadRequestException(
        'Invalid or expired verification code.',
      );
    }

    const user = data.user;

    if (!user || !user.email_confirmed_at) {
      throw new BadRequestException(
        'Email verification was unsuccessful.',
      );
    }

    // 5. Create profile only after successful verification
    const { error: profileError } = await this.supabaseClient
      .from('user_info')
      .upsert(
        {
          id: user.id,
          name: user.user_metadata?.full_name,
          email: normalizedEmail,
          role: 'user',
        },
        {
          onConflict: 'id',
          ignoreDuplicates: true,
        },
      );

    if (profileError) {
  console.error('PROFILE CREATION ERROR:', profileError);

  throw new InternalServerErrorException({
    message: 'Email verified, but profile creation failed.',
    details: profileError.message,
    code: profileError.code,
  });
}

    if (!data.session) {
      throw new UnauthorizedException(
        'Email was verified, but no login session was created. Please log in.',
      );
    }

    return {
      message: 'Email verified and account created successfully.',
      userId: user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const { data, error } =
      await this.supabaseClient.auth.signInWithPassword({
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

    const { data: profile, error: profileError } =
      await this.supabaseClient
        .from('user_info')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()
        .overrideTypes<{ name: string | null }, { merge: false }>();

    if (profileError) {
      throw new BadRequestException(
        'Unable to load your account profile.',
      );
    }

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
}
