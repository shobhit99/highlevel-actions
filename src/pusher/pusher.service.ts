import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Pusher from 'pusher';

@Injectable()
export class PusherService {
    private readonly pusher;

    constructor(private readonly configService: ConfigService) {
        this.pusher = new Pusher({
            appId: this.configService.get<string>('PUSHER_APP_ID'),
            key: this.configService.get<string>('PUSHER_KEY'),
            secret: this.configService.get<string>('PUSHER_SECRET'),
            cluster: this.configService.get<string>('PUSHER_CLUSTER'),
            useTLS: true
        });
    }

    public async trigger(channel: string, event: string, data: any) {
        this.pusher.trigger(channel, event, data);
    }
}
