import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AppsService } from 'src/common/config/apps.service';
import { env } from 'src/common/config/env.config';
import { ApiKeyGaurd } from 'src/common/gaurds/api-key.guide';
import { ApiSuccessResponse } from 'src/common/response/api-success-reponse';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileService } from './file.service';

@Controller('file')
@UseGuards(ApiKeyGaurd)
export class FileController {
  constructor(
    private readonly fileService: FileService,
    private readonly appsService: AppsService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: UploadFileDto,
    @Query() query: { height: string; width: string; quality: string },
    @Headers('x-api-key') apiKey: string,
  ) {
    const appName = this.appsService.findAppNameByKey(apiKey);

    const transformOptions = {
      height: query.height ? parseInt(query.height) : 800,
      width: query.width ? parseInt(query.width) : 600,
      quality: query.quality ? parseInt(query.quality) : 80,
    };

    if (!appName) throw new Error('Invalid API key');
    const { key } = await this.fileService.uploadTransformFile(
      file,
      appName,
      transformOptions,
      apiKey,
    );
    return new ApiSuccessResponse(true, 200, 'File uploaded successfully', {
      key,
    });
  }

  @Get('serve/:key')
  @Header('Cache-Control', 'public, max-age=86400')
  async serveFile(
    @Param('key') key: string,
    @Res() res: Response,
    @Headers('x-api-key') apiKey: string,
  ) {
    const appName = this.appsService.findAppNameByKey(apiKey);
    if (!appName) {
      return res.status(401).send('Invalid API key');
    }

    const cdnUrl = `https://${env.TRANSFORMED_CLOUDFRONT_DOMAIN}/${appName}/${key}`;

    return res.redirect(302, cdnUrl);
  }

  @Get('transforms')
  @HttpCode(HttpStatus.OK)
  async getTransformsBucketImages(
    @Headers('x-api-key') apiKey: string,
    @Query() query: { limit?: string; nextToken?: string },
  ) {
    const appName = this.appsService.findAppNameByKey(apiKey);

    if (!appName) throw new Error('Invalid API key');

    const limit = query.limit ? parseInt(query.limit) : 10;
    if (limit < 1 || limit > 100)
      throw new BadRequestException('Limit must be between 1 and 100');

    let continuationToken: string | undefined = undefined;
    if (query.nextToken) {
      try {
        continuationToken = query.nextToken;
      } catch (err) {
        throw new BadRequestException('Invalid nextToken encoding');
      }
    }
    console.log('Original token:', query.nextToken);
    console.log('Decoded token:', continuationToken);
    const response = await this.fileService.getTransformsImagesByApiKey(
      appName,
      limit,
      continuationToken,
    );
    return new ApiSuccessResponse(
      true,
      200,
      'Fetch transforms images ',
      response,
    );
  }

  @Delete('delete')
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Query('image-key') imagekey: string,
    @Headers('x-api-key') apiKey: string,
  ) {
    const appName = this.appsService.findAppNameByKey(apiKey);
    const result = await this.fileService.deleteFile(imagekey, apiKey, appName);
    return new ApiSuccessResponse(
      true,
      200,
      'File deleted successfully',
      result,
    );
  }

  @Get('originals')
  @HttpCode(HttpStatus.OK)
  async getOriginalBucketImages(@Headers('x-api-key') apiKey: string) {
    const appName = this.appsService.findAppNameByKey(apiKey);

    if (!appName) throw new Error('Invalid API key');

    const response = await this.fileService.getOriginalImagesByApiKey(appName);
    return new ApiSuccessResponse(
      true,
      200,
      'Fetch original images ',
      response,
    );
  }
}
