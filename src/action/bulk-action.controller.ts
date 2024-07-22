import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BulkActionService } from './bulk-action.service';
import { ICreateBulkAction } from './bulk-action.interface';
import { LoggingService } from 'src/logging/logging.service';

@Controller('bulk-action')
export class BulkActionController {
    constructor(
        private readonly bulkActionService: BulkActionService,
        private readonly loggingService: LoggingService
    ) {}

    @Post('/')
    createBulkAction(@Body() createBulkAction: ICreateBulkAction) {
        return this.bulkActionService.createBulkAction(createBulkAction);
    }

    @Get('/')
    getBulkActions() {
        return this.bulkActionService.getBulkActions();
    }

    @Get('/:actionId')
    getBulkAction(@Param('actionId') actionId: string) {
        return this.bulkActionService.getBulkActionByActionId(actionId);
    }

    @Get('/:actionId/stats')
    getBulkActionStats(@Param('actionId') actionId: string) {
        return this.bulkActionService.getBulkActionStatsById(actionId);
    }
}
