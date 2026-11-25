
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

class AnalyzeReportRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

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

  // Normal RAG chatbot
  @Post()
  async chat(@Body() body: ChatRequestDto) {
    return this.chatbotService.sendMessage(
      body.question,
      body.history || [],
    );
  }

  // AI Report Analyst
  @Post('analyze-report')
  async analyzeReport(
    @Body() body: AnalyzeReportRequestDto,
  ) {
    return this.chatbotService.analyzeReport(
      body.message,
      body.history || [],
    );
  }
}
