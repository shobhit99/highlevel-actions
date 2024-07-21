import { Account } from 'src/account/entities/account.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';

@Entity()
export class BulkAction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'uuid', unique: true })
    actionId: string;

    @Column()
    totalRecords: number;

    @ManyToOne(() => Account)
    @JoinColumn({ name: 'account_id' })
    account: Account;

    @Column()
    isScheduled: boolean;

    @Column({ type: 'timestamptz' })
    scheduledTime: Date;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @Column()
    actionType: string;

    @Column()
    isCompleted: boolean;

    @Column()
    entity: string;

    @Column()
    skippedCount: number;

    @Column()
    failedCount: number;

    @Column()
    successCount: number;
}

/*
CREATE TABLE bulk_action (
    id SERIAL PRIMARY KEY,
    action_id UUID UNIQUE,
    total_records INT,
    account_id INT REFERENCES account(id),
    is_scheduled BOOLEAN,
    scheduled_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_completed BOOLEAN,
    skipped_count INT,
    failed_count INT,
    success_count INT,
    entity VARCHAR(255)
);
*/
