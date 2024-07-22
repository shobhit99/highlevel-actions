import { Module } from '@nestjs/common';
import { LoggingService } from './logging.service';
import { ClickhouseModule } from 'src/clickhouse/clickhouse.module';

@Module({
  imports: [ClickhouseModule],
  providers: [LoggingService],
  exports: [LoggingService]
})
export class LoggingModule {}
