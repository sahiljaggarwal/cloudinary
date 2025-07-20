import {
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';
import { S3ServiceException } from '@aws-sdk/client-s3'; // S3 base error class

type MyResponseObj = {
  statusCode: number;
  success: boolean;
  timestamp: string;
  path: string;
  message: string | object;
};

@Catch()
export class ExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const myResponseObj: MyResponseObj = {
      statusCode: 500,
      success: false,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Internal Server Error',
    };

    console.error('[Exception]', exception);

    if (exception instanceof HttpException) {
      myResponseObj.statusCode = exception.getStatus();
      myResponseObj.message = exception.getResponse();
    }

    // Prisma Errors
    else if (
      exception instanceof PrismaClientValidationError ||
      exception instanceof PrismaClientKnownRequestError
    ) {
      myResponseObj.statusCode = 422;
      myResponseObj.message = exception.message.replace(/\n/g, ' ');
    }

    // AWS S3 Errors
    else if (
      exception instanceof S3ServiceException ||
      (typeof exception === 'object' &&
        exception !== null &&
        'name' in exception &&
        typeof (exception as any).name === 'string' &&
        (exception as any).name.includes('S3'))
    ) {
      myResponseObj.statusCode = 502;
      myResponseObj.message =
        'Error while processing file with S3. Please try again later.';
    }

    // Other Error
    else if (exception instanceof Error) {
      myResponseObj.statusCode = HttpStatus.BAD_REQUEST;
      myResponseObj.message = exception.message;
    }

    // Send response
    response.status(myResponseObj.statusCode).json(myResponseObj);

    // Optionally call parent catch (can be skipped if not needed)
    super.catch(exception, host);
  }
}
