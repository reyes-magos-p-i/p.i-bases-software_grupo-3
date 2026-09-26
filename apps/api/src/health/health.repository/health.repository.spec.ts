import { Test, TestingModule } from '@nestjs/testing';
import { HealthRepository } from './health.repository';
import { DatabaseService } from '../../database/database.service';
 
describe('HealthRepository', () => {
  let provider: HealthRepository;
  let db: { query: jest.Mock };
 
  beforeEach(async () => {
    db = { query: jest.fn() };
 
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthRepository,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
 
    provider = module.get<HealthRepository>(HealthRepository);
  });
 
  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
 
  describe('checkDatabaseConnection', () => {
    it('should return true when the database connection is successful', async () => {
      db.query.mockResolvedValue({ rows: [{ '1': 1 }] });
 
      const result = await provider.checkDatabaseConnection();
 
      expect(result).toBe(true);
      expect(db.query).toHaveBeenCalledWith('SELECT 1 FROM dual');
    });
 
    it('should return false when the database connection fails', async () => {
      db.query.mockRejectedValue(new Error('Database error'));
 
      const result = await provider.checkDatabaseConnection();
 
      expect(result).toBe(false);
    });
  });
});
 