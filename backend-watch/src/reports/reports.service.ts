
import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { EmailService } from '../email/email.service';

@Injectable()
export class ReportsService {
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
      console.error('Report insertion failed:', error);
      throw new InternalServerErrorException(
        'Failed to submit your report.',
      );
    }

    // 2. Send email notification after successful insertion.
    try {
      await this.emailService.sendReportNotification(data);
    } catch (error) {
      // The report is already saved, so don't lose it.
      console.error('Report email notification failed:', error);
    }

    return {
      success: true,
      message: 'Report submitted successfully.',
      report: data,
    };
  }
}
