import { Pool } from 'pg';
import { ViolationService } from './violation';
import {
  ViolationCategory,
  ViolationStatus,
  ViolationEventType,
  ParkingPositionType,
} from '@cedar-terrace/shared';

describe('ViolationService', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;
  let service: ViolationService;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any;

    service = new ViolationService(mockPool);
  });

  describe('addEvent', () => {
    it('should add event and update violation status', async () => {
      const mockEvent = {
        id: 'event-1',
        violation_id: 'violation-1',
        event_type: 'NOTICE_ISSUED',
        event_at: new Date(),
        observation_id: null,
        notice_id: 'notice-1',
        notes: null,
        performed_by: 'ADMIN',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // INSERT event
        .mockResolvedValueOnce({ rows: [] }) // UPDATE violation
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.addEvent('violation-1', ViolationEventType.NOTICE_ISSUED, {
        noticeId: 'notice-1',
        performedBy: 'ADMIN',
      });

      expect(result.id).toBe('event-1');
      expect(result.eventType).toBe(ViolationEventType.NOTICE_ISSUED);
    });

    it('should handle RESOLVED event and set resolved_at', async () => {
      const mockEvent = {
        id: 'event-1',
        violation_id: 'violation-1',
        event_type: 'RESOLVED',
        event_at: new Date(),
        observation_id: null,
        notice_id: null,
        notes: 'Fixed',
        performed_by: 'ADMIN',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockEvent] }) // INSERT event
        .mockResolvedValueOnce({ rows: [] }) // UPDATE status
        .mockResolvedValueOnce({ rows: [] }) // UPDATE resolved_at
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.addEvent('violation-1', ViolationEventType.RESOLVED, {
        notes: 'Fixed',
        performedBy: 'ADMIN',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('resolved_at = CURRENT_TIMESTAMP'),
        ['violation-1']
      );
    });
  });

  describe('deriveFromObservation - unauthorized stall', () => {
    it('should create violation for unauthorized vehicle in purchased stall', async () => {
      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        parkingPositionId: 'pos-1',
        observedAt: new Date(),
      };

      const position: any = {
        id: 'pos-1',
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-2', // Different vehicle
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing violation
        .mockResolvedValueOnce({ rows: [{ id: 'violation-1' }] }) // INSERT violation
        .mockResolvedValueOnce({ rows: [] }) // INSERT event
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const violationIds = await service.deriveFromObservation(
        observation,
        position,
        'ADMIN'
      );

      expect(violationIds.length).toBeGreaterThan(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO violations'),
        expect.arrayContaining([
          observation.siteId,
          observation.vehicleId,
          position.id,
          ViolationCategory.UNAUTHORIZED_STALL,
        ])
      );
    });

    it('should not create violation for authorized vehicle', async () => {
      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        parkingPositionId: 'pos-1',
        observedAt: new Date(),
      };

      const position: any = {
        id: 'pos-1',
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-1', // Same vehicle
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const violationIds = await service.deriveFromObservation(
        observation,
        position,
        'ADMIN'
      );

      expect(violationIds).toEqual([]);
    });

    it('should add observation to existing violation', async () => {
      const observation: any = {
        id: 'obs-2',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        parkingPositionId: 'pos-1',
        observedAt: new Date(),
      };

      const position: any = {
        id: 'pos-1',
        type: ParkingPositionType.PURCHASED,
        assignedVehicleId: 'vehicle-2',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing-violation' }] }) // Find existing
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      // Mock addEvent to avoid actual execution
      jest.spyOn(service, 'addEvent').mockResolvedValue({} as any);

      const violationIds = await service.deriveFromObservation(
        observation,
        position,
        'ADMIN'
      );

      expect(violationIds).toContain('existing-violation');
      expect(service.addEvent).toHaveBeenCalledWith(
        'existing-violation',
        ViolationEventType.OBSERVATION_ADDED,
        expect.objectContaining({
          observationId: 'obs-2',
        })
      );
    });
  });

  describe('deriveFromObservation - expired registration', () => {
    it('should create violation for expired registration', async () => {
      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        registrationYear: 2020,
        registrationMonth: 1,
        observedAt: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing
        .mockResolvedValueOnce({ rows: [{ id: 'violation-1' }] }) // INSERT violation
        .mockResolvedValueOnce({ rows: [] }) // INSERT event
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const violationIds = await service.deriveFromObservation(
        observation,
        null,
        'ADMIN'
      );

      expect(violationIds.length).toBeGreaterThan(0);
    });

    it('should not create violation for current registration', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const observation: any = {
        id: 'obs-1',
        siteId: 'site-1',
        vehicleId: 'vehicle-1',
        registrationYear: futureDate.getFullYear(),
        registrationMonth: futureDate.getMonth() + 1,
        observedAt: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const violationIds = await service.deriveFromObservation(
        observation,
        null,
        'ADMIN'
      );

      expect(violationIds).toEqual([]);
    });
  });

  describe('evaluateTimelines', () => {
    it('should transition violations based on timeline rules', async () => {
      const oldViolation = {
        id: 'violation-1',
        category: ViolationCategory.FIRE_LANE,
        status: ViolationStatus.DETECTED,
        detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      };

      mockPool.query.mockResolvedValueOnce({ rows: [oldViolation] } as any);

      // Mock addEvent
      jest.spyOn(service, 'addEvent').mockResolvedValue({} as any);

      const count = await service.evaluateTimelines();

      expect(count).toBeGreaterThan(0);
      expect(service.addEvent).toHaveBeenCalledWith(
        'violation-1',
        ViolationEventType.NOTICE_ELIGIBLE,
        expect.any(Object)
      );
    });
  });
});
