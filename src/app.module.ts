import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './common/config/env.config';
import { FileModule } from './modules/file/file.module';
import { MetaDataModule } from './modules/meta-data/meta-data.module';
import { AppsService } from './common/config/apps.service';
import { AudioModule } from './modules/audio/audio.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate(config) {
        const parsed = envSchema.safeParse(config);
        if (!parsed.success) {
          throw new Error(
            'Invalid environment variables: ' +
              JSON.stringify(parsed.error.format(), null, 2),
          );
        }
        return parsed.data;
      },
    }),
    FileModule,
    MetaDataModule,
    AudioModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppsService],
})
export class AppModule {}
