import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileService } from './file.service';
import { GetFileDto } from './dto/get-file.dto';
import { ApiSuccessResponse } from 'src/common/response/api-success-reponse';
import { Response } from 'express';
import { env } from 'src/common/config/env.config';
import { Readable } from 'stream';

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: UploadFileDto) {
    const { key } = await this.fileService.uploadOriginalFile(file);
    return new ApiSuccessResponse(true, 200, 'File uploaded successfully', {
      key,
    });
  }

  @Get('transform')
  @HttpCode(HttpStatus.OK)
  async getTransformedFile(@Query() query: GetFileDto) {
    const url = await this.fileService.handleTransformedImage(query);
    return new ApiSuccessResponse(true, 200, url);
  }

  @Get('serve/:key')
  async serveFile(
    @Param('key') key: string,
    @Query() query: GetFileDto,
    @Res() res: Response,
  ) {
    const hasFilters =
      query.width !== undefined ||
      query.height !== undefined ||
      query.quality !== undefined;

    let stream: Readable;
    if (hasFilters) {
      // transform / resize
      const safeQuery: GetFileDto = {
        key,
        width: query.width ?? '0',
        height: query.height ?? '0',
        quality: query.quality ?? '80',
      };
      console.log('with filter called');
      stream = await this.fileService.serveTransformedFile(key, safeQuery);
    } else {
      // serve unchanged file
      console.log('without filter called');
      stream = await this.fileService.serveFromTransformedDirect(key);
    }

    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000',
    });
    stream.pipe(res);
  }
}
