import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    console.warn('=====error', exception);

    res.status(status).json({
      code: status,
      message: this.exceptionMessage(exception),
      data: null,
    });
  }

  private exceptionMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      return this.httpExceptionMessage(exception);
    }
    if (typeof exception === 'string' && exception) {
      return exception;
    }

    const record = this.asRecord(exception);
    const fromSql =
      record.sqlMessage ||
      record.driverError?.sqlMessage ||
      record.driverError?.message;
    if (fromSql) {
      return fromSql;
    }
    if (typeof record.message === 'string' && record.message) {
      return record.message;
    }
    if (exception instanceof Error && exception.message) {
      return exception.message;
    }
    return String(exception);
  }

  private httpExceptionMessage(exception: HttpException): string {
    const payload = exception.getResponse();
    if (typeof payload === 'string' && payload) {
      return payload;
    }
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const raw = (payload as { message: unknown }).message;
      if (Array.isArray(raw)) {
        const parts = raw.map((item) => String(item)).filter(Boolean);
        if (parts.length) {
          return parts.join('; ');
        }
      } else if (raw !== undefined && raw !== null && String(raw)) {
        return String(raw);
      }
    }
    return exception.message;
  }

  private asRecord(exception: unknown): {
    message?: string;
    sqlMessage?: string;
    driverError?: { sqlMessage?: string; message?: string };
  } {
    if (!exception || typeof exception !== 'object') {
      return {};
    }
    return exception as {
      message?: string;
      sqlMessage?: string;
      driverError?: { sqlMessage?: string; message?: string };
    };
  }
}
