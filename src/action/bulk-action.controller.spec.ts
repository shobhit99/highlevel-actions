import { Test, TestingModule } from '@nestjs/testing';
import { BulkActionController } from './bulk-action.controller';

describe('BulkActionController', () => {
  let controller: BulkActionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BulkActionController],
    }).compile();

    controller = module.get<BulkActionController>(BulkActionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
