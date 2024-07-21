import { Module, forwardRef } from '@nestjs/common';
import { BulkActionService } from './bulk-action.service';
import { BulkActionController } from './bulk-action.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkAction } from './entities/bulk-action.entity';
import { Account } from 'src/account/entities/account.entity';
import { AccountModule } from 'src/account/account.module';
import { KafkaModule } from 'src/kafka/kafka.module';

@Module({
  imports: [TypeOrmModule.forFeature([BulkAction]), AccountModule, KafkaModule],
  providers: [BulkActionService],
  exports: [BulkActionService],
  controllers: [BulkActionController]
})
export class BulkActionModule {}
