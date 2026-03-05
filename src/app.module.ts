import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { RecordModule } from './api/record/record.module';
import { OrderModule } from './api/order/order.module';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheHelperModule } from './api/common/cache/cache-helper.module';
import { randomUUID } from 'crypto';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { colorize: true, singleLine: true },
              }
            : undefined,
        genReqId: (req) =>
          (req.headers['x-request-id'] as string) || randomUUID(),
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        autoLogging: {
          ignore: (req) =>
            ['/swagger', '/health'].some((p) => req.url?.startsWith(p)),
        },
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        if (!config.MONGO_URL) {
          throw new Error('MONGO_URL environment variable is required');
        }
        return config;
      },
    }),
    CacheModule.register({ isGlobal: true, ttl: 60000, max: 500 }),
    CacheHelperModule,
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URL'),
      }),
      inject: [ConfigService],
    }),
    RecordModule,
    OrderModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
