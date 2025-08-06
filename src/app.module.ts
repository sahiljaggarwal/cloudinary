import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './common/config/env.config';
import { FileModule } from './modules/file/file.module';
import { QueueModule } from './modules/queues/queue.module';
import { MetaDataModule } from './modules/meta-data/meta-data.module';
import { AppsService } from './common/config/apps.service';

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
    QueueModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppsService],
})
export class AppModule {}
