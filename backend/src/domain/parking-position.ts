import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  ParkingPosition,
  ParkingPositionType,
  CreateParkingPositionRequest,
  UpdateParkingPositionRequest,
} from '@cedar-terrace/shared';

export class ParkingPositionService {
  constructor(private db: Database.Database) {}

  create(request: CreateParkingPositionRequest): ParkingPosition {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(
      `INSERT INTO parking_positions (
        id, site_id, lot_image_id, type, center_x, center_y, radius,
        identifier, rental_info, assigned_vehicle_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      id,
      request.siteId,
      request.lotImageId,
      request.type,
      request.centerX,
      request.centerY,
      request.radius,
      request.identifier || null,
      request.rentalInfo || null,
      request.assignedVehicleId || null,
      now,
      now
    );

    return this.getById(id);
  }

  update(id: string, request: UpdateParkingPositionRequest): ParkingPosition {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (request.centerX !== undefined) {
      updates.push(`center_x = ?`);
      values.push(request.centerX);
    }
    if (request.centerY !== undefined) {
      updates.push(`center_y = ?`);
      values.push(request.centerY);
    }
    if (request.radius !== undefined) {
      updates.push(`radius = ?`);
      values.push(request.radius);
    }
    if (request.type !== undefined) {
      updates.push(`type = ?`);
      values.push(request.type);
    }
    if (request.identifier !== undefined) {
      updates.push(`identifier = ?`);
      values.push(request.identifier);
    }
    if (request.rentalInfo !== undefined) {
      updates.push(`rental_info = ?`);
      values.push(request.rentalInfo);
    }
    if (request.assignedVehicleId !== undefined) {
      updates.push(`assigned_vehicle_id = ?`);
      values.push(request.assignedVehicleId);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE parking_positions
       SET ${updates.join(', ')}, updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`
    );

    const result = stmt.run(...values);

    if (result.changes === 0) {
      throw new Error('Parking position not found');
    }

    return this.getById(id);
  }

  getById(id: string): ParkingPosition {
    const stmt = this.db.prepare(
      'SELECT * FROM parking_positions WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id);

    if (!row) {
      throw new Error('Parking position not found');
    }

    return this.mapRow(row as any);
  }

  getBySite(siteId: string): ParkingPosition[] {
    const stmt = this.db.prepare(
      'SELECT * FROM parking_positions WHERE site_id = ? AND deleted_at IS NULL ORDER BY created_at'
    );
    const rows = stmt.all(siteId);

    return rows.map((row) => this.mapRow(row as any));
  }

  softDelete(id: string): void {
    const stmt = this.db.prepare(
      'UPDATE parking_positions SET deleted_at = datetime(\'now\') WHERE id = ? AND deleted_at IS NULL'
    );
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error('Parking position not found');
    }
  }

  /**
   * Find parking positions that contain a given point (x, y)
   * Used to match observations to positions based on location
   */
  findPositionAtPoint(
    lotImageId: string,
    x: number,
    y: number
  ): ParkingPosition | null {
    const stmt = this.db.prepare(
      `SELECT * FROM parking_positions
       WHERE lot_image_id = ?
         AND deleted_at IS NULL
         AND ((center_x - ?) * (center_x - ?) + (center_y - ?) * (center_y - ?)) <= (radius * radius)
       ORDER BY radius ASC
       LIMIT 1`
    );

    const row = stmt.get(lotImageId, x, x, y, y);
    return row ? this.mapRow(row as any) : null;
  }

  /**
   * Check if a vehicle is authorized for a specific position
   */
  isVehicleAuthorized(position: ParkingPosition, vehicleId: string | null): boolean {
    // Open positions are available to everyone
    if (position.type === ParkingPositionType.OPEN) {
      return true;
    }

    // Purchased/Reserved positions require matching vehicle
    if (
      position.type === ParkingPositionType.PURCHASED ||
      position.type === ParkingPositionType.RESERVED
    ) {
      return position.assignedVehicleId === vehicleId;
    }

    // Handicapped positions require separate placard validation
    // Authorization cannot be determined from position alone
    if (position.type === ParkingPositionType.HANDICAPPED) {
      return false; // Requires evidence evaluation
    }

    return false;
  }

  private mapRow(row: any): ParkingPosition {
    return {
      id: row.id,
      siteId: row.site_id,
      lotImageId: row.lot_image_id,
      type: row.type as ParkingPositionType,
      centerX: parseFloat(row.center_x),
      centerY: parseFloat(row.center_y),
      radius: parseFloat(row.radius),
      identifier: row.identifier,
      rentalInfo: row.rental_info,
      assignedVehicleId: row.assigned_vehicle_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}
