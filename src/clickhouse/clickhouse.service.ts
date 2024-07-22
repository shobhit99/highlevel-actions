import { ClickHouseClient } from '@clickhouse/client';
import { InjectClickHouse } from '@md03/nestjs-clickhouse';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ClickhouseService {
    constructor(@InjectClickHouse() private readonly clickhouseClient: ClickHouseClient) {}

    async writeLog(logs: any) {
        await this.clickhouseClient.insert({
            table: 'Logs',
            values: [logs],
            format: 'JSONEachRow'
        });
    }

    async fetchLogs(query: string) {
        return await this.clickhouseClient.query({
            query,
        });
    }
}
