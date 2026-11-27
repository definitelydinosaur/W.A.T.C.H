import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY environment variable.');
    }

    this.resend = new Resend(apiKey);
  }

  async sendTestEmail(): Promise<void> {
    try {
      const receiver = this.configService.get<string>('REPORT_EMAIL_RECEIVER');
      const from = this.configService.get<string>('RESEND_FROM_EMAIL');

      if (!receiver || !from) {
        throw new Error('Missing email configuration.');
      }

      const { error } = await this.resend.emails.send({
        from,
        to: receiver,
        subject: 'W.A.T.C.H. Email Integration Test',
        text: 'Email integration is working! W.A.T.C.H. can now send issue report notifications.',
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      console.error('Email sending failed:', error);
      throw new InternalServerErrorException('Failed to send email.');
    }
  }

  async sendReportNotification(report: {
    id: number;
    user_id: string;
    title: string;
    body: string;
    created_at: string;
  }): Promise<void> {
    const receiver = this.configService.get<string>('REPORT_EMAIL_RECEIVER');
    const from = this.configService.get<string>('RESEND_FROM_EMAIL');

    if (!receiver || !from) {
      throw new Error('Missing email configuration.');
    }

    try {
      const { error } = await this.resend.emails.send({
        from,
        to: receiver,
        subject: `W.A.T.C.H. New Issue Report #${report.id}`,
        text: `
A new issue report has been submitted through W.A.T.C.H.

Report ID: ${report.id}
Submitted At: ${report.created_at}
User ID: ${report.user_id}

Title:
${report.title}

Description:
${report.body}
        `,
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log(`Report notification sent for report #${report.id}`);
    } catch (error) {
      console.error(`Report email notification failed for #${report.id}:`, error);
      throw error;
    }
  }
}
