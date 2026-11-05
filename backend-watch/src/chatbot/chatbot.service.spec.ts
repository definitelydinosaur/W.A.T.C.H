import { beforeEach, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { ChatbotService } from './chatbot.service';

describe('ChatbotService', () => {
  let service: ChatbotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        {
          provide: HttpService,
          useValue: {
            post: () => null,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: () => 'http://localhost:8000',
          },
        },
      ],
    }).compile();

    service = module.get<ChatbotService>(ChatbotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
