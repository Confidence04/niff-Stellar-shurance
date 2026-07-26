import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { CaptchaService } from './captcha.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [PrismaModule, MaintenanceModule],
  controllers: [SupportController],
  providers: [SupportService, CaptchaService],
  exports: [SupportService],
})
export class SupportModule {}
