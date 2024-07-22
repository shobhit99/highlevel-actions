import { Injectable } from '@nestjs/common';
import { ClickhouseService } from 'src/clickhouse/clickhouse.service';

@Injectable()
export class LoggingService {
  constructor(private readonly clickhouseService: ClickhouseService) {}

  async logRecord(log: any) {
    await this.clickhouseService.writeLog(log);
  }

  async fetchLogs(query: string) {
    return await this.clickhouseService.fetchLogs(query);
  }

  async writeQueuedLogs(messages: any[]) {
    await this.clickhouseService.writeLog(messages.map((message) => ({
        action_id: message.key,
        created_at: new Date().toISOString(),
        identifier: JSON.parse(message.value)?.record?.email || "", // optimize this
        status: 'queued'
    })));
  }

  async writeSkippedRecords(records: any[], actionId: string) {
    await this.clickhouseService.writeLog(records.map((record) => ({
        action_id: actionId,
        created_at: new Date().toISOString(),
        identifier: record.email || "", // optimize this
        status: 'skipped'
    })));
  }
}
