import {
  IsString,
  IsOptional,
  IsEmail,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CalendlyLocationDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  join_url?: string;

  @IsOptional()
  @IsString()
  location?: string;
}

export class CalendlyScheduledEventDto {
  @IsString()
  uri: string;

  @IsString()
  name: string;

  @IsString()
  start_time: string;

  @IsString()
  end_time: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendlyLocationDto)
  location?: CalendlyLocationDto;
}

export class CalendlyTrackingDto {
  @IsOptional()
  @IsString()
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  utm_source?: string;

  @IsOptional()
  @IsString()
  utm_medium?: string;

  @IsOptional()
  @IsString()
  utm_content?: string;

  @IsOptional()
  @IsString()
  utm_term?: string;
}

export class CalendlyQuestionAnswerDto {
  @IsString()
  question: string;

  @IsString()
  answer: string;

  @IsOptional()
  @IsNumber()
  position?: number;
}

import { IsNumber } from 'class-validator';

export class CalendlyInviteePayloadDto {
  @IsString()
  uri: string;

  @IsString()
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  cancel_url?: string;

  @IsOptional()
  @IsString()
  reschedule_url?: string;

  @IsString()
  created_at: string;

  @ValidateNested()
  @Type(() => CalendlyScheduledEventDto)
  scheduled_event: CalendlyScheduledEventDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendlyTrackingDto)
  tracking?: CalendlyTrackingDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CalendlyQuestionAnswerDto)
  questions_and_answers?: CalendlyQuestionAnswerDto[];
}

export class CalendlyWebhookPayloadDto {
  @IsString()
  event: string; // invitee.created, invitee.canceled

  @IsString()
  created_at: string;

  @IsOptional()
  @IsString()
  created_by?: string;

  @ValidateNested()
  @Type(() => CalendlyInviteePayloadDto)
  payload: CalendlyInviteePayloadDto;
}

// Response types for internal use
export interface CalendlyWebhookResult {
  success: boolean;
  introductionId?: string;
  message: string;
}
