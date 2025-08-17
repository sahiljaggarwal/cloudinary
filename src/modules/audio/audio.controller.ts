import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  Param,
  Headers,
  Res,
  Req,
  HttpException,
  HttpStatus,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
import { AudioService } from './audio.service';
import { ApiKeyGaurd } from 'src/common/gaurds/api-key.guide';

@Controller('audio')
@UseGuards(ApiKeyGaurd)
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAudio(
    @UploadedFile() file: any,
    @Body() body: { title?: string; author?: string },
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    try {
      const audioMetadata = await this.audioService.uploadAudio(
        file,
        body.title || file.originalname || 'audio',
        body.author || 'Unknown',
      );
      return { success: true, data: audioMetadata };
    } catch (error) {
      throw new HttpException(
        'Upload failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stream/:id')
  async streamAudio(
    @Param('id') id: string,
    @Headers('range') range: string,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    try {
      return await this.audioService.streamAudio(id, range, res, req);
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new HttpException('Audio file not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Streaming failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('info/:id')
  async getAudioInfo(@Param('id') id: string) {
    try {
      const audioInfo = await this.audioService.getAudioInfo(id);
      return { success: true, data: audioInfo };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch audio info',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('cdn/:id')
  async redirectToCdn(@Param('id') id: string, @Res() res: Response) {
    const redirectUrl = this.audioService.getCdnUrl(id);
    console.log(`Redirecting to CDN URL: ${redirectUrl}`);
    return res.redirect(redirectUrl);
  }

  @Get('cdn-proxy/:id')
  async proxyCdn(
    @Param('id') id: string,
    @Headers('range') range: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return await this.audioService.proxyCdn(id, range, res);
    } catch (error) {
      console.error('CloudFront proxy error:', error);
      throw new HttpException(
        'CDN proxy failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
