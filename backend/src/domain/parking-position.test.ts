import { Pool } from 'pg';
import { ParkingPositionService } from './parking-position';
import { ParkingPositionType } from '@cedar-terrace/shared';

describe('ParkingPositionService', () => {
  let mockPool: jest.Mocked<Pool>;
  let service: ParkingPositionService;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    } as any;
    service = new ParkingPositionService(mockPool);
  });

  describe('create', () => {
    it('should create a new parking position', async () => {
      const request = {
        siteId: 'site-1',
        lotImageId: 'lot-1',
        type: ParkingPositionType.OPEN,
        centerX: 100,
        centerY: 200,
        radius: 50,
      };

      const mockResult = {
        id: 'pos-1',
        site_id: 'site-1',
        lot_image_id: 'lot-1',
        type: 'OPEN',
        center_x: '100',
        center_y: '200',
        radius: '50',
        identifier: null,
        rental_info: null,
        assigned_vehicle_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      mockPool.query.mockResolvedValue({ rows: [mockResult] } as any);

      const result = await service.create(request);

      expect(result.id).toBe('pos-1');
      expect(result.type).toBe(ParkingPositionType.OPEN);
      expect(result.centerX).toBe(100);
      expect(result.centerY).toBe(200);
      expect(result.radius).toBe(50);
    });
  });

  describe('isVehicleAuthorized', () => {
    it('should return true for OPEN positions', () => {
      const position: any = {
        type: ParkingPositionType.OPEN,
      };

      expect(service.isVehicleAuthorized(position, 'any-vehicle')).toBe(true);
      expect(service.isVehicleAuthorized(position, null)).toBe(true);
    });

    it('should check vehicle assignment for PURCHASED positions', () => {
      const position: any = {
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-1',
      };

      expect(service.isVehicleAuthorized(position, 'vehicle-1')).toBe(true);
      expect(service.isVehicleAuthorized(position, 'vehicle-2')).toBe(false);
      expect(service.isVehicleAuthorized(position, null)).toBe(false);
    });

    it('should return false for HANDICAPPED positions (requires evidence)', () => {
      const position: any = {
        type: ParkingPositionType.HANDICAPPED,
      };

      expect(service.isVehicleAuthorized(position, 'any-vehicle')).toBe(false);
    });
  });

  describe('findPositionAtPoint', () => {
    it('should find position containing the point', async () => {
      const mockResult = {
        id: 'pos-1',
        lot_image_id: 'lot-1',
        center_x: '100',
        center_y: '100',
        radius: '50',
        type: 'OPEN',
        site_id: 'site-1',
        identifier: null,
        rental_info: null,
        assigned_vehicle_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      mockPool.query.mockResolvedValue({ rows: [mockResult] } as any);

      const result = await service.findPositionAtPoint('lot-1', 110, 110);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('pos-1');
    });

    it('should return null if no position contains the point', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const result = await service.findPositionAtPoint('lot-1', 999, 999);

      expect(result).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('should soft delete a position', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 } as any);

      await service.softDelete('pos-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE parking_positions SET deleted_at'),
        ['pos-1']
      );
    });

    it('should throw error if position not found', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 } as any);

      await expect(service.softDelete('invalid-id')).rejects.toThrow(
        'Parking position not found'
      );
    });
  });
});
