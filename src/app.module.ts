import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { RecordModule } from './api/record/record.module';
import { OrderModule } from './api/order/order.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfig } from './app.config';
import { CacheHelperModule } from './api/common/utils/cache/cache-helper.module';

@Module({
  imports: [
    CacheModule.register({ isGlobal: true, ttl: 60000, max: 500 }),
    CacheHelperModule,
    MongooseModule.forRoot(AppConfig.mongoUrl),
    RecordModule,
    OrderModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
