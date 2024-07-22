import { Inject, Injectable, OnApplicationShutdown, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Kafka, Consumer } from 'kafkajs';
import { BulkActionService } from 'src/action/bulk-action.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnApplicationShutdown {
  private readonly TOTAL_CONSUMERS = 6;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => BulkActionService))
    private readonly bulkActionService: BulkActionService
  ) {}

  private readonly consumers = [];

  private readonly kafka = new Kafka({
    brokers: this.configService.get('KAFKA_BROKERS').split(','),
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: this.configService.get('KAFKA_USERNAME'),
      password: this.configService.get('KAFKA_PASSWORD'),
    },
  });

  async onModuleInit() {
    try {
      const numberOfConsumers = this.TOTAL_CONSUMERS;
      for (let i = 0; i < numberOfConsumers; i++) {
        const consumer = this.kafka.consumer({ groupId: `my-group-2`, maxWaitTimeInMs: 10000 });
        await consumer.connect();
        this.consumers.push(consumer);
        await consumer.subscribe({ topic: 'bulk-action', fromBeginning: false });
        await consumer.run({
          eachBatchAutoResolve: true,
          eachMessage: async ({ message, heartbeat, partition }) => {
            await this.bulkActionService.bulkActionConsumer(message.value.toString(), partition);
            await heartbeat();
          }
        });
      }
    } catch (error) {
      console.error('Error connecting to Kafka:', error);
    }
  }

  async onApplicationShutdown() {
    try {
      for (const consumer of this.consumers) {
        await consumer.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting from Kafka:', error);
    }
  }
}
