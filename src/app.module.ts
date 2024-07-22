import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BulkActionModule } from './action/bulk-action.module';
import { KafkaModule } from './kafka/kafka.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AccountModule } from './account/account.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ClickHouseModule } from '@md03/nestjs-clickhouse';
import { ClickhouseModule } from './clickhouse/clickhouse.module';
import { LoggingModule } from './logging/logging.module';
import { SupabaseModule } from './supabase/supabase.module';
import { PusherModule } from './pusher/pusher.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ClickHouseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        host: configService.get<string>('CLICKHOUSE_HOST'),
        username: configService.get<string>('CLICKHOUSE_USERNAME'),
        password: configService.get<string>('CLICKHOUSE_PASSWORD'),
      }),
      inject: [ConfigService],
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USER'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          autoLoadEntities: true,
          namingStrategy: new SnakeNamingStrategy(),
        } as TypeOrmModuleOptions
      },
      inject: [ConfigService],
    }),
    BulkActionModule, KafkaModule, AccountModule, ClickhouseModule, LoggingModule, SupabaseModule, PusherModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
