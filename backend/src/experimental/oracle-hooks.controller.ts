import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { Feature } from '../feature-flags/feature.decorator';
import { DeprecatedApi } from '../common/versioning/deprecated-api.decorator';
import { ExperimentalAccessLogInterceptor } from './experimental-access-log.interceptor';

@DeprecatedApi()
@Controller('experimental/oracle-hooks')
@Feature('experimental.oracleHooks')
@UseInterceptors(ExperimentalAccessLogInterceptor)
export class OracleHooksController {
  @Post('ingest')
  ingest(@Body() body: Record<string, unknown>) {
    return {
      accepted: true,
      receivedKeys: Object.keys(body || {}),
    };
  }
}
