import {
  Body,
  Controller,
  Post,
  Delete,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';


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
  verifyOtp(@Body('email') email: string, @Body('token') token: string) {
    return this.authService.verifyRegistrationOtp(email, token);
  }

@Delete('delete-account')
deleteAccount(@Headers('authorization') authorization: string) {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new UnauthorizedException('Authentication token is required.');
  }

  const accessToken = authorization.substring(7);

  return this.authService.deleteAccount(accessToken);
}

}
