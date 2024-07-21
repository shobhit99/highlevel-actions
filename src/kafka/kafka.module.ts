import { Module, forwardRef } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer/kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer/kafka-consumer.service';
import { BulkActionModule } from 'src/action/bulk-action.module';

@Module({
  imports: [forwardRef(() => BulkActionModule)],
  providers: [KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService, KafkaConsumerService],
})
export class KafkaModule {}
