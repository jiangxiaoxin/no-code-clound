import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | StreamableFile
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | StreamableFile> {
    console.log('ResponseInterceptor 执行0000');
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) {
          return data;
        }
        return {
          code: 0,
          message: 'ok',
          data: (data ?? null) as T,
        };
      }),
    );
  }
}
