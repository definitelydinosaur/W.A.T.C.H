import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';

@Injectable()
export class ChatbotService {
  private readonly chatbotApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.chatbotApiUrl =
      this.configService.get<string>('CHATBOT_API_URL') ||
      'http://127.0.0.1:8000';
  }

  async sendMessage(question: string, history: any[] = []) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.chatbotApiUrl}/chat`,
          {
            question,
            history,
          },
        ),
      );

      return response.data;

    } catch (error: unknown) {
      const errorDetails = isAxiosError(error)
        ? error.response?.data || error.message
        : error instanceof Error
          ? error.message
          : String(error);

      console.error(
        'Chatbot API error:',
        JSON.stringify(errorDetails, null, 2),
      );

      if (isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw new ServiceUnavailableException(
          'The chatbot service is currently unavailable.',
        );
      }

      throw new InternalServerErrorException(
        'Failed to process chatbot request.',
      );
    }
  }
}