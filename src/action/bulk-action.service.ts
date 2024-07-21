import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { BulkAction } from './entities/bulk-action.entity';
import { DataSource, EntityManager, Repository, getManager } from 'typeorm';
import { AccountService } from 'src/account/account.service';
import { ICreateBulkAction } from './bulk-action.interface';
import { v4 as uuidv4 } from 'uuid';
import { KafkaProducerService } from 'src/kafka/kafka-producer/kafka-producer.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Redis } from 'ioredis';

@Injectable()
export class BulkActionService {
    private readonly BATCH_SIZE = 10;
    private readonly BATCH_CACHE_KEY_PREFIX = 'bulk_action_batch_';
    private readonly BATCH_CACHE_KEY_DETAILS_PREFIX = 'bulk_action_batch_details_';
    private readonly redisClient: Redis
    private readonly entityManager: EntityManager

    constructor(private readonly configService: ConfigService,
        @InjectRepository(BulkAction)
        private readonly bulkActionRepository: Repository<BulkAction>,
        private readonly accountService: AccountService,
        private readonly kafkaProducerService: KafkaProducerService,
        private readonly dataSource: DataSource
    ) {
        this.redisClient = new Redis(this.configService.get<string>('REDIS_CONNECTION_STRING'));
        this.entityManager = this.dataSource.createEntityManager();
    }

    async createBulkAction(acitonDetails: ICreateBulkAction) {
        const account = await this.accountService.getAccount(acitonDetails.account_id);

        if (!account) {
            throw new UnauthorizedException('Account not found');
        }

        const actionId = uuidv4();

        const bulkAction = this.bulkActionRepository.create({
            actionType: acitonDetails.action_type,
            actionId,
            account,
            isCompleted: false,
            isScheduled: false,
            entity: acitonDetails.entity,
            totalRecords: acitonDetails.records.length,
        });
        await this.bulkActionRepository.save(bulkAction);

        const messages = [];
        let currentDateTime = new Date().toLocaleString();
        console.log('Current Date and Time:', currentDateTime);
        for (const record of acitonDetails.records) {
            const dataToQueue = {
                actionId,
                accountId: account.id,
                record
            };
            messages.push({ key: actionId, value: JSON.stringify(dataToQueue) });

            // Send messages in batches of 100
            if (messages.length === 100) {
                await this.kafkaProducerService.sendMessage('bulk-action', messages);
                messages.length = 0; // Clear the array for the next batch
            }
        }
        // Send any remaining messages after the loop
        if (messages.length > 0) {
            await this.kafkaProducerService.sendMessage('bulk-action', messages);
        }
        currentDateTime = new Date().toLocaleString();
        console.log('Current Date and Time:', currentDateTime);

        return {
            message: "Bulk action created successfully",
            data: {
                actionId
            }
        };
    }

    async bulkUpdateRecords(entity: string, records: any[]) {
        const updateIdentifier = 'id';
        const updateFields = records.reduce((acc, record) => {
            Object.keys(record).forEach(field => {
                if (field !== updateIdentifier) {
                    if (!acc[field]) {
                        acc[field] = `CASE `;
                    }
                    acc[field] += `WHEN ${updateIdentifier} = $${acc.paramCount} THEN $${acc.paramCount + 1} `;
                    acc.paramCount += 2;
                }
            });
            return acc;
        }, { paramCount: 1 });

        const setClauses = Object.keys(updateFields)
            .filter(key => key !== 'paramCount')
            .map(field => `"${field}" = ${updateFields[field]} ELSE "${field}" END`);

        const inClauseStart = updateFields.paramCount;
        const query = `UPDATE "${entity}" SET ${setClauses.join(', ')} WHERE ${updateIdentifier} IN (${records.map((_, i) => `$${inClauseStart + i}`).join(', ')}) RETURNING ${updateIdentifier}, (xmax::text::int > 0) as updated`;

        const parameters = [];
        records.forEach(record => {
            Object.keys(record).forEach(field => {
                if (field !== updateIdentifier) {
                    parameters.push(record[updateIdentifier]);
                    parameters.push(record[field]);
                }
            });
        });

        records.forEach(record => {
            parameters.push(record[updateIdentifier]);
        });

        try {
            // const rawQuery = query.replace(/\$\d+/g, (match) => {
            //     const index = parseInt(match.slice(1)) - 1;
            //     return typeof parameters[index] === 'string' ? `'${parameters[index]}'` : parameters[index];
            // });
            // console.log('Raw SQL query:', rawQuery);

            const result = await this.entityManager.query(query, parameters);
            console.log({ result: JSON.stringify(result) });
            
            const updatedCount = result[0].length;
            const skippedCount = records.length - updatedCount;
            
            return {
                updatedCount,
                skippedCount,
                failureCount: 0 // All rows were processed without errors
            };
        } catch (error) {
            console.error('Bulk update failed:', error);
            return {
                updatedCount: 0,
                skippedCount: 0,
                failureCount: records.length
            };
        }
    }

    async bulkActionConsumer(message: any) {
        message = JSON.parse(message)
        const cacheKey = `${this.BATCH_CACHE_KEY_PREFIX}_${message.actionId}`;
        await this.redisClient.rpush(cacheKey, JSON.stringify(message.record));
        const cacheListLength = await this.redisClient.llen(cacheKey)
        if (cacheListLength >= this.BATCH_SIZE) {
            const batchRecordsStringified = await this.redisClient.lrange(cacheKey, 0, -1)
            const batchRecords = batchRecordsStringified.map(record => JSON.parse(record))
            const batchDetails = await this.getBatchDetails(message.actionId)
            const output = await this.bulkUpdateRecords(batchDetails.entity, batchRecords)
            await this.redisClient.del(cacheKey)
        }
    }


    async getBatchDetails(batchId: string) {
        const cacheKey = `${this.BATCH_CACHE_KEY_DETAILS_PREFIX}_${batchId}`
        let bulkAction: any = await this.redisClient.get(cacheKey)

        if (bulkAction) {
            return JSON.parse(bulkAction)
        }

        bulkAction = await this.bulkActionRepository.findOne({ where: { actionId: batchId } });
        await this.redisClient.set(cacheKey, JSON.stringify(bulkAction))
        return bulkAction;
    }

    async getBulkActions(accountId: number) {
        return this.bulkActionRepository.find({ where: { account: { id: accountId } } });
    }
}
