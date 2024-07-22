export enum ActionType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
}

export enum BulkActionStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    SCHEDULED = 'scheduled',
}