import { Controller, Get, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { LoggingService } from './logging.service';
import { Row } from '@clickhouse/client';

@Controller('logging')
export class LoggingController {
  constructor(private readonly loggingService: LoggingService) {}

  @Sse(':actionId/logs')
  getLogsByActionId(@Param('actionId') actionId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>(observer => {
      this.loggingService.fetchLogs(`SELECT * FROM Logs WHERE action_id = '${actionId}'`)
        .then(rows => {
          const stream = rows.stream();

          stream.on('data', (rows: Row[]) => {
            rows.forEach((row: Row) => {
              const event = new MessageEvent('message', {
                data: JSON.stringify(row.json())
              });
              observer.next(event);
            });
          });

          stream.on('end', () => {
            observer.complete();
          });

          stream.on('error', (err) => {
            console.error('Stream error:', err);
            observer.error(err);
          });
        })
        .catch(err => {
          console.error('Fetch error:', err);
          observer.error(err);
        });
    });
  }
}
