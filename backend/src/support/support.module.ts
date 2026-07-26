import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { CaptchaService } from './captcha.service';
import { TypingService } from './typing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
  providers: [SupportService, CaptchaService, TypingService],
  exports: [SupportService, TypingService],
})
export class SupportModule {}
