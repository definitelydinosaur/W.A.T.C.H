
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly chatbotApiUrl: string | null;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    const apiUrl = configService
      .get<string>('CHATBOT_API_URL')
      ?.trim();

    this.chatbotApiUrl = apiUrl
      ? apiUrl.replace(/\/+$/, '')
      : null;
  }

  // Normal RAG chatbot
  async sendMessage(
    question: string,
    history: ChatMessage[] = [],
  ) {
    if (!this.chatbotApiUrl) {
      throw new ServiceUnavailableException(
        'The chatbot is currently unavailable. Try again later.',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.chatbotApiUrl}/chat`,
          {
            question,
            history,
          },
          {
            timeout: 15000,
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      this.handleChatbotError(error);
    }
  }

  // AI Report Analyst
  async analyzeReport(
    message: string,
    history: ChatMessage[] = [],
  ) {
    if (!this.chatbotApiUrl) {
      throw new ServiceUnavailableException(
        'The reporting assistant is currently unavailable. Try again later.',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.chatbotApiUrl}/analyze-report`,
          {
            message,
            history,
          },
          {
            timeout: 30000,
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      this.handleChatbotError(error);
    }
  }

  // Shared error handling
  private handleChatbotError(error: unknown): never {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data;

    this.logger.error(
      `Chatbot API Error:
      Status: ${status ?? 'No response'}
      Code: ${error.code ?? 'Unknown'}
      Response: ${JSON.stringify(responseData ?? error.message)}`,
    );
  } else {
    this.logger.error(
      'Unexpected chatbot error:',
      error instanceof Error ? error.stack : String(error),
    );
  }

  throw new ServiceUnavailableException(
    'The chatbot is currently unavailable. Try again later.',
  );
}
}
