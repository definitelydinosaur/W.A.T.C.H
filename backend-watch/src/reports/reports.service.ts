
import {
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { EmailService } from '../email/email.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient,
    private readonly emailService: EmailService,
  ) {}

  async submitReport(
    userId: string,
    title: string,
    body: string,
  ) {
    // 1. Save the report first.
    const { data, error } = await this.supabase
      .from('user_reports')
      .insert({
        user_id: userId,
        title,
        body,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Report insertion failed:', error);
      throw new InternalServerErrorException(
        'Failed to submit your report.',
      );
    }

    // 2. Send email notification independently.
    void this.emailService
      .sendReportNotification(data)
      .catch((error) => {
        this.logger.error(
          `Report email notification failed for #${data.id}:`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    // 3. Return immediately without waiting for email delivery.
    return {
      success: true,
      message: 'Report submitted successfully.',
      report: data,
    };
  }
}
