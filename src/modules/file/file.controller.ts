import {
  BadRequestException,
  Controller,
  Get,
  Head,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileService } from './file.service';
import { GetFileDto } from './dto/get-file.dto';
import { ApiSuccessResponse } from 'src/common/response/api-success-reponse';
import { Request, Response } from 'express';
import { env } from 'src/common/config/env.config';
import { Readable } from 'stream';
import { isTransformedImage, parseKeyParams } from 'src/common/common';
import { RedisService } from '../redis/redis.service';
import { ApiKeyGaurd } from 'src/common/gaurds/api-key.guide';
import { APPS } from 'src/common/config/apps.config';

@Controller('file')
@UseGuards(ApiKeyGaurd)
export class FileController {
  constructor(
    private readonly fileService: FileService,
    private readonly redisService: RedisService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: UploadFileDto,
    @Req() req: Request,
    @Query() query: { height: string; width: string; quality: string },
  ) {
    const Key = req.headers['x-api-key'] as string;
    const appName = Object.keys(APPS).find((name) => APPS[name].key === Key);

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
      Key,
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
    const appName = Object.keys(APPS).find((name) => APPS[name].key === apiKey);

    if (!appName) {
      return res.status(401).send('Invalid API key');
    }

    const cdnUrl = `https://${env.TRANSFORMED_CLOUDFRONT_DOMAIN}/${appName}/${key}`;

    return res.redirect(302, cdnUrl);
  }

  // @Get('transform')
  // @HttpCode(HttpStatus.OK)
  // async getTransformedFile(@Query() query: GetFileDto) {
  //   const url = await this.fileService.handleTransformedImage(query);
  //   return new ApiSuccessResponse(true, 200, url);
  // }

  // @Get('serve/:key')
  // @Header('Cache-Control', 'public, max-age=86400')
  // async serveFile(
  //   @Res() res: Response,
  //   @Param('key') key: string,
  //   @Query('height') height?: string,
  //   @Query('width') width?: string,
  //   @Query('quality') quality?: string,
  // ) {
  //   const isFiltered = !!(height || width || quality);
  //   const defaultHeight = '800';
  //   const defaultWidth = '600';
  //   const defaultQuality = '80';

  //   const finalHeight = height || defaultHeight;
  //   const finalWidth = width || defaultWidth;
  //   const finalQuality = quality || defaultQuality;

  //   const transformedKey = isFiltered
  //     ? this.fileService.getTransformedKey(
  //         key,
  //         finalHeight,
  //         finalWidth,
  //         finalQuality,
  //       )
  //     : key; // no filters → use original key for Redis

  //   // STEP 1: Check in Redis
  //   const redisBuffer = await this.redisService.getBuffer(transformedKey);
  //   if (redisBuffer) {
  //     console.log('search from redis');
  //     const stream = Readable.from(redisBuffer);
  //     res.setHeader('Content-Type', 'image/webp');
  //     return stream.pipe(res);
  //   }

  //   if (isFiltered) {
  //     try {
  //       const s3Stream =
  //         await this.fileService.serveFromTransformedDirect(transformedKey);
  //       const buffer = await this.fileService.streamToBuffer(s3Stream);
  //       await this.redisService.setBuffer(transformedKey, buffer);

  //       console.log('✅ Served from Transformed S3');
  //       const stream = Readable.from(buffer);
  //       res.setHeader('Content-Type', 'image/webp');
  //       return stream.pipe(res);
  //     } catch (err) {
  //       console.log('❌ Transform S3 failed:', err?.message);
  //     }
  //   }

  //   // STEP 3: Not in Transformed Bucket → Fetch Original → Transform → Cache → Serve
  //   try {
  //     const transformedBuffer = await this.fileService.transformAndUpload({
  //       key,
  //       height: finalHeight,
  //       width: finalWidth,
  //       quality: finalQuality,
  //     });

  //     await this.redisService.setBuffer(transformedKey, transformedBuffer);
  //     console.log('✅ Transformed from Original and cached in Redis');
  //     return Readable.from(transformedBuffer).pipe(
  //       res.setHeader('Content-Type', 'image/webp'),
  //     );
  //   } catch (err) {
  //     console.error(
  //       '❌ Failed to fetch/transform original image:',
  //       err?.message || err,
  //     );
  //     return res.status(404).send('Image not found or transformation failed');
  //   }
  // }

  @Get('originals')
  @HttpCode(HttpStatus.OK)
  async getOriginalBucketImages(@Headers('x-api-key') apiKey: string) {
    const appName = Object.keys(APPS).find((name) => APPS[name].key === apiKey);

    if (!appName) throw new Error('Invalid API key');

    const response = await this.fileService.getOriginalImagesByApiKey(appName);
    return new ApiSuccessResponse(
      true,
      200,
      'Fetch original images ',
      response,
    );
  }

  @Get('transforms')
  @HttpCode(HttpStatus.OK)
  async getTransformsBucketImages(
    @Headers('x-api-key') apiKey: string,
    @Query() query: { limit?: string; nextToken?: string },
  ) {
    const appName = Object.keys(APPS).find((name) => APPS[name].key === apiKey);

    if (!appName) throw new Error('Invalid API key');

    const limit = query.limit ? parseInt(query.limit) : 10;
    if (limit < 1 || limit > 100)
      throw new BadRequestException('Limit must be between 1 and 100');

    const response = await this.fileService.getTransformsImagesByApiKey(
      appName,
      limit,
      query.nextToken,
    );
    return new ApiSuccessResponse(
      true,
      200,
      'Fetch transforms images ',
      response,
    );
  }
}
