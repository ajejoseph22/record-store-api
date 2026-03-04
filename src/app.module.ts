import { Module } from '@nestjs/common';
import { RecordModule } from './api/record.module';
import { OrderModule } from './api/order.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfig } from './app.config';

@Module({
  imports: [
    MongooseModule.forRoot(AppConfig.mongoUrl),
    RecordModule,
    OrderModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
