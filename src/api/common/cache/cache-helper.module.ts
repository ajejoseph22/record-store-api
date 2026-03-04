import { Global, Module } from '@nestjs/common';
import { CacheHelper } from './cache.helper';

@Global()
@Module({
  providers: [CacheHelper],
  exports: [CacheHelper],
})
export class CacheHelperModule {}
