import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './common/config/env.config';
import * as cors from 'cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isDev = env.NODE_ENV === 'development';
  const port = env.PORT ?? 3001;
  if (isDev) {
    const { setupSwagger } = await import('./common/config/swagger');
    setupSwagger(app);
  }

  app.use(
    cors({
      origin: ['*', 'http://localhost:3000'],
    }),
  );
  app.setGlobalPrefix('api/');

  await app.listen(port, () =>
    console.log(`Server is running on port ${port} in ${env.NODE_ENV} mode`),
  );
}
bootstrap();
