import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiSuccessResponse } from 'src/common/response/api-success-reponse';
import { MetadataService } from './meta-data.service';
import { AppsService } from 'src/common/config/apps.service';

@Controller('meta-data')
export class MetaDataController {
  constructor(
    private readonly metaDataService: MetadataService,
    private readonly appsService: AppsService,
  ) {}

  @Post('update-metadata')
  @HttpCode(HttpStatus.ACCEPTED)
  async updateMetadata(
    @Body() updateDto: { newKey: string },
    @Req() req: Request,
  ) {
    const apiKey = req.headers['x-api-key'] as string;
    console.log('api key ', apiKey);
    const appName = this.appsService.findAppNameByKey(apiKey);
    console.log('app name ', appName);

    if (!appName) {
      throw new BadRequestException('Invalid API key');
    }

    const { newKey } = updateDto;

    if (!apiKey || !newKey) {
      throw new BadRequestException('Both oldKey and newKey are required');
    }

    if (apiKey === newKey) {
      throw new BadRequestException('Old and new keys cannot be same');
    }

    const jobId = await this.metaDataService.initiateMetadataUpdate(
      appName,
      newKey,
      apiKey,
    );

    return new ApiSuccessResponse(true, 202, 'Metadata update initiated', {
      jobId: jobId,
      message: 'Update process started in background',
    });
  }

  @Get('update-status/:jobId')
  async getUpdateStatus(@Param('jobId') jobId: string) {
    const status = await this.metaDataService.getUpdateStatus(jobId);
    return new ApiSuccessResponse(true, 200, 'Status retrieved', status);
  }
}
