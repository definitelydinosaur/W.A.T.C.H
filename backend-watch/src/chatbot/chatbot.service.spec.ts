import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';
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

  it('starts without a chatbot URL and returns a friendly unavailable error', async () => {
    const httpService = {
      post: jest.fn(),
    } as unknown as HttpService;
    const configService = {
      get: () => undefined,
    } as unknown as ConfigService;
    const optionalService = new ChatbotService(httpService, configService);

    await expect(optionalService.sendMessage('Hello')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('applies a short timeout when the chatbot URL is configured', async () => {
    const httpService = {
      post: jest.fn().mockReturnValue(of({ data: { success: true } })),
    } as unknown as HttpService;
    const configService = {
      get: () => 'https://chatbot.example.test',
    } as unknown as ConfigService;
    const configuredService = new ChatbotService(httpService, configService);

    await expect(configuredService.sendMessage('Hello')).resolves.toEqual({
      success: true,
    });
    expect(httpService.post).toHaveBeenCalledWith(
      'https://chatbot.example.test/chat',
      { question: 'Hello', history: [] },
      { timeout: 5000 },
    );
  });
});
