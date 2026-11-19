import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SupabaseAuthGuard } from '../supabase-auth.guard';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('verify-otp')
  verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyRegistrationOtp(
      verifyOtpDto.email,
      verifyOtpDto.token,
    );
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfileRole(request.user.id);
  }
}
