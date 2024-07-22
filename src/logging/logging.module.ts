import { Module } from '@nestjs/common';
import { LoggingService } from './logging.service';
import { ClickhouseModule } from 'src/clickhouse/clickhouse.module';
import { LoggingController } from './logging.controller';

@Module({
  imports: [ClickhouseModule],
  providers: [LoggingService],
  exports: [LoggingService],
  controllers: [LoggingController]
})
export class LoggingModule {}
