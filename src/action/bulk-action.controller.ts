import { Body, Controller, Post } from '@nestjs/common';
import { BulkActionService } from './bulk-action.service';
import { ICreateBulkAction } from './bulk-action.interface';

@Controller('bulk-action')
export class BulkActionController {
    constructor(private readonly bulkActionService: BulkActionService) {}

    @Post('/')
    createBulkAction(@Body() createBulkAction: ICreateBulkAction) {
        return this.bulkActionService.createBulkAction(createBulkAction);
    }
}
