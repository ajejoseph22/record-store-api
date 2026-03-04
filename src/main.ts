import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LogLevel, ValidationPipe } from '@nestjs/common';
import { LoggingExceptionFilter } from './api/common/filters/logging-exception.filter';

type LogLevelKey = 'debug' | 'info';

const LOG_LEVELS: Record<LogLevelKey, LogLevel[]> = {
  debug: ['debug', 'log', 'warn', 'error', 'verbose'],
  info: ['log', 'warn', 'error'],
};

async function bootstrap() {
  const level = process.env.LOG_LEVEL || 'info';
  const app = await NestFactory.create(AppModule, {
    logger: LOG_LEVELS[level as LogLevelKey] ?? LOG_LEVELS.info,
  });

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new LoggingExceptionFilter(httpAdapter));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  // Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Record Store API')
    .setDescription(
      'API for managing a record store inventory and orders. Supports CRUD operations on records with MusicBrainz integration for tracklist metadata, and order management with transactional stock control.',
    )
    .setVersion('1.0')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, swaggerDocument);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
bootstrap();
