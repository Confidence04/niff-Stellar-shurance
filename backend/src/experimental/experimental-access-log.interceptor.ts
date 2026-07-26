import { Injectable, NestInterceptor, ExecutionContext, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class ExperimentalAccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ExperimentalAccessLogInterceptor.name);

  intercept(context: ExecutionContext, next: any): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent');
    const timestamp = new Date().toISOString();

    this.logger.log(`[experimental-endpoint] ${method} ${url}`, {
      caller_ip: ip,
      caller_user_agent: userAgent,
      timestamp,
    });

    return next.handle();
  }
}
