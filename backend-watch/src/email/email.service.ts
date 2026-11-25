
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const email = this.configService.get<string>('GMAIL_USER');
    const password = this.configService.get<string>('GMAIL_APP_PASSWORD');

    if (!email || !password) {
      throw new Error('Missing Gmail environment variables.');
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: password,
      },
    });
  }

  async sendTestEmail(): Promise<void> {
    try {
      const receiver = this.configService.get<string>('GMAIL_RECEIVER');

      if (!receiver) {
        throw new Error('Missing GMAIL_RECEIVER environment variable.');
      }

      await this.transporter.sendMail({
        from: `"W.A.T.C.H. Reports" <${this.configService.get<string>('GMAIL_USER')}>`,
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
  const receiver = this.configService.get<string>('GMAIL_RECEIVER');

  if (!receiver) {
    throw new Error('Missing GMAIL_RECEIVER environment variable.');
  }

  await this.transporter.sendMail({
    from: `"W.A.T.C.H. Reports" <${this.configService.get<string>('GMAIL_USER')}>`,
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

}
