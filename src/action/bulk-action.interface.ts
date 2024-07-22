import { ActionType } from "./bulk-action.enum";

export interface ICreateBulkAction {
    is_scheduled: boolean;
    scheduled_time: string;
    account_id: number;
    action_type: ActionType;
    entity: string;
    records: any[];
}

