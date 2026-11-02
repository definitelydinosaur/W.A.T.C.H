
import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

import { ChatbotService } from './chatbot.service';

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

class ChatRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}

@Controller('chatbot')
export class ChatbotController {
  constructor(
    private readonly chatbotService: ChatbotService,
  ) {}

  @Post()
  async chat(@Body() body: ChatRequestDto) {
    console.log('Received chatbot request:', body);

    return this.chatbotService.sendMessage(
      body.question,
      body.history || [],
    );
  }
}
