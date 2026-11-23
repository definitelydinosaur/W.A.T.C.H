import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly chatbotApiUrl: string | null;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    const apiUrl = configService.get<string>('CHATBOT_API_URL')?.trim();
    this.chatbotApiUrl = apiUrl ? apiUrl.replace(/\/+$/, '') : null;
  }

  async sendMessage(question: string, history: ChatMessage[] = []) {
    if (!this.chatbotApiUrl) {
      throw new ServiceUnavailableException(
        'The chatbot is currently unavailable. Try again later.',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.chatbotApiUrl}/chat`,
          { question, history },
          { timeout: 5000 },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        this.logger.warn(
          status
            ? `Chatbot service returned HTTP ${status}.`
            : `Chatbot service request failed (${error.code ?? 'network error'}).`,
        );
      } else {
        this.logger.warn('Chatbot service request failed.');
      }
      throw new ServiceUnavailableException(
        'The chatbot is currently unavailable. Try again later.',
      );
    }
  }
}
