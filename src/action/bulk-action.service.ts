import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { BulkAction } from './entities/bulk-action.entity';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AccountService } from 'src/account/account.service';
import { ICreateBulkAction } from './bulk-action.interface';
import { v4 as uuidv4 } from 'uuid';
import { KafkaProducerService } from 'src/kafka/kafka-producer/kafka-producer.service';
import { Redis } from 'ioredis';
import { Interval } from '@nestjs/schedule';
import { BulkActionStatus } from './bulk-action.enum';
import { LoggingService } from 'src/logging/logging.service';
import { CronJob } from 'cron';
import { SupabaseService } from 'src/supabase/supabase.service';
import { PusherService } from 'src/pusher/pusher.service';

@Injectable()
export class BulkActionService {
    private readonly CONSUMER_BATCH_SIZE_UNTIL_PROCESSING = 100;
    private readonly PRODUCER_BATCH_SIZE = 200;
    private readonly BATCH_CACHE_KEY_PREFIX = 'bulk_action_batch';
    private readonly BULK_ACTION_CACHE_KEY_DETAILS_PREFIX = 'bulk_action_batch_details';
    private readonly BATCH_STATS_PREFIX = 'bulk_action_stats';
    private readonly redisClient: Redis
    private readonly entityManager: EntityManager

    constructor(private readonly configService: ConfigService,
        @InjectRepository(BulkAction)
        private readonly bulkActionRepository: Repository<BulkAction>,
        private readonly accountService: AccountService,
        private readonly kafkaProducerService: KafkaProducerService,
        private readonly dataSource: DataSource,
        private readonly loggingService: LoggingService,
        private readonly supabaseService: SupabaseService,
        private readonly pusherService: PusherService
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
        const {uniqueRecords, skippedRecords} = this.deDuplicateRecords(acitonDetails.records, actionId)

        const bulkAction = this.bulkActionRepository.create({
            actionType: acitonDetails.action_type,
            actionId,
            account,
            status: BulkActionStatus.PENDING,
            isScheduled: acitonDetails.is_scheduled,
            scheduledTime: acitonDetails.scheduled_time,
            entity: acitonDetails.entity,
            totalRecords: acitonDetails.records.length,
            skippedCount: skippedRecords.length
        });
        await this.bulkActionRepository.save(bulkAction);

        // this should ideally go in the entity subscriber
        this.pusherService.trigger("bulk-action", 'new-bulk-action', {
            bulkAction
        })

        if (bulkAction.isScheduled) {
            return this.scheduleBulkAction(bulkAction, uniqueRecords)
        }
        
        this.pushRecordsToKafka(uniqueRecords, actionId, account);

        return {
            message: "Bulk action created successfully",
            data: {
                actionId
            }
        };
    }

    private deDuplicateRecords(records, actionId) {
        const recordsMapper = {}
        const uniqueRecords = []
        const skippedRecords = []
        for (const record of records) {
            if (!recordsMapper[record.email]) {
                recordsMapper[record.email] = true
                uniqueRecords.push(record)
            } else {
                skippedRecords.push(record)
            }
        }
        this.loggingService.writeSkippedRecords(skippedRecords, actionId)
        return { uniqueRecords, skippedRecords }
    }

    private async scheduleBulkAction(bulkAction: BulkAction, records: any[]) {
        const scheduledDate = bulkAction.scheduledTime;
        const jsonFilePath = `${bulkAction.actionId}.json`;
        const jsonData = JSON.stringify(records)
        try {
            const { url } = await this.supabaseService.uploadFileAndGetPresignedUrl(jsonFilePath, jsonData, scheduledDate);

            const job = new CronJob(new Date(scheduledDate), async () => {
                console.log("Running scheduled job for actionId", bulkAction.actionId)
                console.log("Fetching file from supabase", url)
                const response = await fetch(url);
                const records = await response.json();
                await this.pushRecordsToKafka(records, bulkAction.actionId, bulkAction.account.id);
            });
            job.start();
            this.bulkActionRepository.update({ actionId: bulkAction.actionId }, { status: BulkActionStatus.SCHEDULED });
            this.pusherService.trigger("bulk-action", 'bulk-action-scheduled', {
                bulkAction: {
                    ...bulkAction,
                    status: BulkActionStatus.SCHEDULED
                }
            })
            return {
                message: "Bulk action scheduled successfully",
                data: {
                    actionId: bulkAction.actionId
                }
            }
        } catch (error) {
            throw new Error('Error scheduling bulk action: ' + error.message);
        }
    }

    async pushRecordsToKafka(records, actionId, account) {
        const messages = [];
        for (const record of records) {
            const dataToQueue = {
                actionId,
                accountId: account.id,
                record
            };
            messages.push({ value: JSON.stringify(dataToQueue) });

            if (messages.length === this.PRODUCER_BATCH_SIZE) {
                await this.kafkaProducerService.sendMessage('bulk-action', messages);
                this.loggingService.writeQueuedLogs(actionId, messages);
                messages.length = 0; // Clear the array for the next batch
            }
        }
        // Send any remaining messages after the loop
        if (messages.length > 0) {
            await this.kafkaProducerService.sendMessage('bulk-action', messages);
            this.loggingService.writeQueuedLogs(actionId, messages);
        }

        // records are pushed to kafka, so it is safe to mark the bulk action as in progress
        await this.bulkActionRepository.update({ actionId }, { status: BulkActionStatus.IN_PROGRESS });
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
            const result = await this.entityManager.query(query, parameters);
            
            const updatedCount = result[0].length;
            const skippedCount = records.length - updatedCount;
            
            // Let's say even if there was no data to be updated, we still consider it as an update
            return {
                updatedCount,
                skippedCount,
                failureCount: 0
            };
        } catch (error) {
            return {
                updatedCount: 0,
                skippedCount: 0,
                failureCount: records.length
            };
        }
    }

    async getBulkActionStats(actionId: string) {
        const cacheKey = `${this.BATCH_STATS_PREFIX}_${actionId}`;
        const stringifiedStats = await this.redisClient.get(cacheKey);
        return stringifiedStats ? JSON.parse(stringifiedStats) : { updatedCount: 0, failureCount: 0, totalProcessed: 0, batchId: '' };
    }

    async setBulkActionStats(actionId: string, stats: { updatedCount: number, failureCount: number, totalProcessed: number, batchId: string }) {
        const cacheKey = `${this.BATCH_STATS_PREFIX}_${actionId}`;
        return this.redisClient.set(cacheKey, JSON.stringify(stats));
    }

    async bulkActionConsumer(message: any, partition: number) {
        message = JSON.parse(message)
        const cacheKey = `${this.BATCH_CACHE_KEY_PREFIX}_${message.actionId}_${partition}`;
        await this.redisClient.rpush(cacheKey, JSON.stringify(message.record));
        const cacheListLength = await this.redisClient.llen(cacheKey)
        if (cacheListLength >= this.CONSUMER_BATCH_SIZE_UNTIL_PROCESSING) {
            await this.processBatchForConsumer(cacheKey, message.actionId)
        }
    }

    private async checkAndMarkBatchAsCompleted(actionId: string) {
        const stats = await this.getBulkActionStats(actionId)
        const bulkActionDetails = await this.getBulkActionDetails(actionId)
        const totalRecords = bulkActionDetails.totalRecords
        const skippedCount = bulkActionDetails.skippedCount
        if (stats.totalProcessed === totalRecords - (skippedCount || 0)) {
            console.log(`Marking batch ${actionId} as complete at ${new Date().toLocaleString()}`);
            await this.bulkActionRepository.update({ actionId }, { status: BulkActionStatus.COMPLETED, failedCount: stats.failureCount, successCount: stats.updatedCount })
            this.pusherService.trigger("bulk-action", 'bulk-action-updated', {
                bulkAction: {
                    ...bulkActionDetails,
                    status: BulkActionStatus.COMPLETED,
                    failedCount: stats.failureCount,
                    successCount: stats.updatedCount
                }
            })
            this.redisClient.del(`${this.BULK_ACTION_CACHE_KEY_DETAILS_PREFIX}_${actionId}`)
            this.redisClient.del(`${this.BATCH_STATS_PREFIX}_${actionId}`)
        }
    }

    private async processBatchForConsumer(partitionCacheKey: string, actionId: string) {
        const batchRecordsStringified = await this.redisClient.lrange(partitionCacheKey, 0, -1)
        const batchRecords = batchRecordsStringified.map(record => JSON.parse(record))
        if (batchRecords.length) {
            console.log(`Processing batch for ${actionId} ${partitionCacheKey} - count ${batchRecords.length}`)
            const bulkActionDetails = await this.getBulkActionDetails(actionId)
            const output = await this.bulkUpdateRecords(bulkActionDetails.entity, batchRecords)
            if (output.failureCount) {
                await this.loggingService.writeFailedRecords(batchRecords, actionId)
            }
            const lockKey = `lock_${actionId}`;
            const acquireLock = async (retryCount = 0) => {
                // @ts-ignore
                const acquired = await this.redisClient.set(lockKey, 'locked', 'NX', 'PX', 10000); // Lock for 10 seconds
                if (acquired) {
                    try {
                        const stats = await this.getBulkActionStats(actionId);
                        const updatedStats = {
                            updatedCount: stats.updatedCount + output.updatedCount,
                            failureCount: stats.failureCount + output.failureCount,
                            totalProcessed: stats.totalProcessed + batchRecords.length,
                            lastProcesssedTime: Math.floor(Date.now() / 1000),
                            batchId: actionId
                        };
                        this.pusherService.trigger("bulk-action", 'bulk-action-updated', {
                            bulkAction: {
                                ...bulkActionDetails,
                                status: BulkActionStatus.IN_PROGRESS,
                                failedCount: stats.failureCount + output.failureCount,
                                successCount: stats.updatedCount + output.updatedCount
                            }
                        })
                        await this.setBulkActionStats(actionId, updatedStats);
                    } finally {
                        await this.redisClient.del(lockKey);
                    }
                } else {
                    if (retryCount < 5) {
                        const delay = Math.pow(2, retryCount) * 100; // Exponential backoff
                        await new Promise(resolve => setTimeout(resolve, delay));
                        await acquireLock(retryCount + 1);
                    } else {
                        throw new Error('Failed to acquire lock after multiple attempts');
                    }
                }
            };
            await acquireLock();
            await this.redisClient.del(partitionCacheKey)
            this.checkAndMarkBatchAsCompleted(actionId)
        }
    }

    private async queueLastBatchForAction(actionId: string) {
        const stats = await this.getBulkActionStats(actionId)
        const currentTime = Math.floor(Date.now() / 1000)
        if (stats.lastProcesssedTime && currentTime - stats.lastProcesssedTime > 10) {
            const allPartitionCacheKeys = await this.redisClient.keys(`${this.BATCH_CACHE_KEY_PREFIX}_${actionId}_*`)
            for (const partitionCacheKey of allPartitionCacheKeys) {
                await this.processBatchForConsumer(partitionCacheKey, actionId)
            }
        }
    }

    @Interval(5000) // Every 5 seconds
    async checkAndRunLastBatches() {
        console.log("Checking for left out batches to run")
        const incompleteBulkActions = await this.bulkActionRepository.find({ where: { status: In([BulkActionStatus.PENDING, BulkActionStatus.IN_PROGRESS]) } });
        const actionIds = incompleteBulkActions.map(action => action.actionId)
        for (const actionId of actionIds) {
            this.queueLastBatchForAction(actionId)
        }   
    }

    async getBulkActionDetails(actionId: string) {
        // get bulk action details from cache else fetch from db and set in cache

        const cacheKey = `${this.BULK_ACTION_CACHE_KEY_DETAILS_PREFIX}_${actionId}`
        let bulkAction: any = await this.redisClient.get(cacheKey)

        if (bulkAction) {
            return JSON.parse(bulkAction)
        }

        bulkAction = await this.bulkActionRepository.findOne({ where: { actionId: actionId } });
        await this.redisClient.set(cacheKey, JSON.stringify(bulkAction))
        return bulkAction;
    }

    async getBulkActions() {
        return this.bulkActionRepository.find();
    }

    async getBulkActionByActionId(actionId: string) {
        return this.bulkActionRepository.findOne({ where: { actionId } });
    }

    async getBulkActionStatsById(actionId: string) {
        let bulkAction = await this.getBulkActionByActionId(actionId);
        if (!bulkAction) {
            throw new NotFoundException('Bulk action not found');
        }
        let statsToReturn: any = {}
        if (bulkAction.status === BulkActionStatus.COMPLETED) {
            statsToReturn = {
                actionId,
                skippedRecords: bulkAction.skippedCount,
                updatedRecords: bulkAction.successCount,
                failedRecords: bulkAction.failedCount,
                totalRecords: bulkAction.totalRecords,
            }
        } else {
            const bulkActionCachedStats = await this.getBulkActionStats(bulkAction.actionId);
            statsToReturn = {
                actionId,
                skippedRecords: bulkAction.skippedCount,
                updatedRecords: bulkActionCachedStats.updatedCount,
                failedRecords: bulkActionCachedStats.failureCount,
                totalRecords: bulkAction.totalRecords
            }
        }
        this.pusherService.trigger("bulk-action", 'bulk-action-updated', {
            bulkAction: {
                ...bulkAction,
                successCount: statsToReturn.updatedRecords,
                failedCount: statsToReturn.failedRecords,
                skippedCount: statsToReturn.skippedRecords
            }
        })
        return statsToReturn
    }
}
