import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  async sendTestEmail(): Promise<void> {
    const { email, receiver, transporter } = this.getMailConfiguration();

    try {
      await transporter.sendMail({
        from: `"W.A.T.C.H. Reports" <${email}>`,
        to: receiver,
        subject: 'W.A.T.C.H. Email Integration Test',
        text: 'Email integration is working! W.A.T.C.H. can now send issue report notifications.',
      });
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
    const { email, receiver, transporter } = this.getMailConfiguration();

    await transporter.sendMail({
      from: `"W.A.T.C.H. Reports" <${email}>`,
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
  }

  private getMailConfiguration() {
    const email = this.configService.get<string>('GMAIL_USER')?.trim();
    const password = this.configService
      .get<string>('GMAIL_APP_PASSWORD')
      ?.trim();
    const receiver = this.configService.get<string>('GMAIL_RECEIVER')?.trim();

    if (!email || !password || !receiver) {
      const missing = [
        !email ? 'GMAIL_USER' : null,
        !password ? 'GMAIL_APP_PASSWORD' : null,
        !receiver ? 'GMAIL_RECEIVER' : null,
      ].filter((name): name is string => name !== null);
      throw new ServiceUnavailableException(
        `Email notifications are not configured. Set ${missing.join(', ')} in the backend environment to enable email.`,
      );
    }

    let transporter = this.transporter;
    if (!transporter) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: email,
          pass: password,
        },
      });
      this.transporter = transporter;
    }

    return { email, receiver, transporter };
  }
}
