import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BulkActionModule } from './action/bulk-action.module';
import { KafkaModule } from './kafka/kafka.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AccountModule } from './account/account.module';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
  imports: [
    // CacheModule.registerAsync({
    //   isGlobal: true,
    //   useFactory: async (configService: ConfigService) => ({
    //     store: await redisStore({
    //       socket: {
    //         host: configService.get<string>('REDIS_HOST'),
    //         port: configService.get<number>('REDIS_PORT'),
    //       },
    //       password: configService.get<string>('REDIS_PASSWORD'),
    //     }),
    //   }),
    //   inject: [ConfigService],
    // }),
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
    BulkActionModule, KafkaModule, AccountModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
