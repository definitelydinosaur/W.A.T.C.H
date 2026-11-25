
import {
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { EmailService } from './email.service';

@Controller('email')
@UseGuards(SupabaseAuthGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('test')
  async testEmail() {
    await this.emailService.sendTestEmail();

    return {
      success: true,
      message: 'Test email sent successfully.',
    };
  }
}
