import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './common/config/env.config';
import * as cors from 'cors';
import { ExceptionsFilter } from './common/filter/execption-filter';

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
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(httpAdapter));

  await app.listen(port, '0.0.0.0', () =>
    console.log(`Server is running on port ${port} in ${env.NODE_ENV} mode`),
  );
}
bootstrap();
