import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileService } from './file.service';
import { GetFileDto } from './dto/get-file.dto';
import { ApiSuccessResponse } from 'src/common/response/api-success-reponse';

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: UploadFileDto) {
    const { key } = await this.fileService.uploadOriginalFile(file);
    return new ApiSuccessResponse(true, 200, 'File uploaded successfully', {
      key,
    });
  }

  @Get('transform')
  async getTransformedFile(@Query() query: GetFileDto) {
    const url = await this.fileService.handleTransformedImage(query);
    return new ApiSuccessResponse(true, 200, url);
  }
}
