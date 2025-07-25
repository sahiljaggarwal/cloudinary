import {
  Controller,
  Get,
  Header,
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
import { isTransformedImage } from 'src/common/common';

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
  @Header('Cache-Control', 'public, max-age=86400')
  serveFile(@Param('key') key: string, @Res() res: Response) {
    if (isTransformedImage(key)) {
      const cdnUrl = `https://${env.TRANSFORMED_CLOUDFRONT_DOMAIN}/${key}`;
      return res.redirect(302, cdnUrl);
    } else {
      const cdnUrl = `https://${env.ORIGINAL_CLOUDFRONT_DOMAIN}/${key}`;
      return res.redirect(302, cdnUrl);
    }
  }
}
