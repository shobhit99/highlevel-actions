import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Kafka } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnApplicationShutdown {
  constructor(private readonly configService: ConfigService) {}

  private readonly kafka = new Kafka({
    brokers: this.configService.get('KAFKA_BROKERS').split(','),
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: this.configService.get('KAFKA_USERNAME'),
      password: this.configService.get('KAFKA_PASSWORD'),
    },
  });

  private readonly producer = this.kafka.producer();

  async onModuleInit() {
    try {
      await this.producer.connect();
    } catch (error) {
      console.error('Error connecting to Kafka:', error);
    }
  }

  async onApplicationShutdown() {
    try {
      await this.producer.disconnect();
    } catch (error) {
      console.error('Error disconnecting from Kafka:', error);
    }
  }

  async sendMessage(topic: string, messages: { key: string, value: string }[] = []) {
    await this.producer.send({
      topic,
      messages,
    });
  }
}
