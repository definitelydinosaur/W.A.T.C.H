import {
  BadRequestException,
  UnauthorizedException,
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
    const { fullName, email, password } = registerDto;

    const { data, error } = await this.supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const user = data.user;

    if (!user) {
      throw new BadRequestException('User registration failed');
    }

    const { error: profileError } = await this.supabaseClient
      .from('user_info')
      .insert({
      id: user.id,
      name: fullName,
      email,
      role: 'user',
    });

    if (profileError) {
      throw new BadRequestException(profileError.message);
    }

    return {
      message: 'Registration successful',
      userId: user.id,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const { data, error } = await this.supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const user = data.user;
if (error) {
  throw new UnauthorizedException('Invalid email or password');
}

if (!user || !data.session) {
  throw new UnauthorizedException('Invalid email or password');
}
return {
  message: 'Login successful',
  user: {
    id: user.id,
    email: user.email,
  },
  accessToken: data.session.access_token,
  refreshToken: data.session.refresh_token,
  expiresIn: data.session.expires_in,
};
  }

}




















