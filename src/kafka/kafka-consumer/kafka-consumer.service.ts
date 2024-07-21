import { Inject, Injectable, OnApplicationShutdown, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Kafka, Consumer } from 'kafkajs';
import { BulkActionService } from 'src/action/bulk-action.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => BulkActionService))
    private readonly bulkActionService: BulkActionService
  ) {}

  private readonly kafka = new Kafka({
    brokers: this.configService.get('KAFKA_BROKERS').split(','),
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: this.configService.get('KAFKA_USERNAME'),
      password: this.configService.get('KAFKA_PASSWORD'),
    },
  });

  private readonly consumer: Consumer = this.kafka.consumer({ groupId: 'my-group-2', maxWaitTimeInMs: 10000 });

  async onModuleInit() {
    try {
      await this.consumer.connect();
      await this.subscribeToBulkAction();
    } catch (error) {
      console.error('Error connecting to Kafka:', error);
    }
  }

  private async subscribeToBulkAction() {
    await this.consumer.subscribe({ topic: 'bulk-action', fromBeginning: false });

    await this.consumer.run({
      eachBatchAutoResolve: true,
      eachMessage: async ({ message, heartbeat }) => {
        await this.bulkActionService.bulkActionConsumer(message.value.toString());
        await heartbeat();
      }
    });
  }

  async onApplicationShutdown() {
    try {
      await this.consumer.disconnect();
    } catch (error) {
      console.error('Error disconnecting from Kafka:', error);
    }
  }

  // async consume(topic: string, fromBeginning: boolean = true) {
  //   await this.consumer.subscribe({ topic, fromBeginning });
  // }
}
