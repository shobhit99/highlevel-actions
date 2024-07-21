import { Test, TestingModule } from '@nestjs/testing';
import { BulkActionService } from './bulk-action.service';

describe('BulkActionService', () => {
  let service: BulkActionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BulkActionService],
    }).compile();

    service = module.get<BulkActionService>(BulkActionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
