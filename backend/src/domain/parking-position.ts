import { Pool } from 'pg';
import {
  ParkingPosition,
  ParkingPositionType,
  CreateParkingPositionRequest,
  UpdateParkingPositionRequest,
} from '@cedar-terrace/shared';

export class ParkingPositionService {
  constructor(private pool: Pool) {}

  async create(request: CreateParkingPositionRequest): Promise<ParkingPosition> {
    const result = await this.pool.query<ParkingPosition>(
      `INSERT INTO parking_positions (
        site_id, lot_image_id, type, center_x, center_y, radius,
        identifier, rental_info, assigned_vehicle_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        request.siteId,
        request.lotImageId,
        request.type,
        request.centerX,
        request.centerY,
        request.radius,
        request.identifier || null,
        request.rentalInfo || null,
        request.assignedVehicleId || null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async update(id: string, request: UpdateParkingPositionRequest): Promise<ParkingPosition> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (request.centerX !== undefined) {
      updates.push(`center_x = $${paramIndex++}`);
      values.push(request.centerX);
    }
    if (request.centerY !== undefined) {
      updates.push(`center_y = $${paramIndex++}`);
      values.push(request.centerY);
    }
    if (request.radius !== undefined) {
      updates.push(`radius = $${paramIndex++}`);
      values.push(request.radius);
    }
    if (request.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(request.type);
    }
    if (request.identifier !== undefined) {
      updates.push(`identifier = $${paramIndex++}`);
      values.push(request.identifier);
    }
    if (request.rentalInfo !== undefined) {
      updates.push(`rental_info = $${paramIndex++}`);
      values.push(request.rentalInfo);
    }
    if (request.assignedVehicleId !== undefined) {
      updates.push(`assigned_vehicle_id = $${paramIndex++}`);
      values.push(request.assignedVehicleId);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const result = await this.pool.query<ParkingPosition>(
      `UPDATE parking_positions
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Parking position not found');
    }

    return this.mapRow(result.rows[0]);
  }

  async getById(id: string): Promise<ParkingPosition> {
    const result = await this.pool.query<ParkingPosition>(
      'SELECT * FROM parking_positions WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error('Parking position not found');
    }

    return this.mapRow(result.rows[0]);
  }

  async getBySite(siteId: string): Promise<ParkingPosition[]> {
    const result = await this.pool.query<ParkingPosition>(
      'SELECT * FROM parking_positions WHERE site_id = $1 AND deleted_at IS NULL ORDER BY created_at',
      [siteId]
    );

    return result.rows.map(this.mapRow);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.pool.query(
      'UPDATE parking_positions SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error('Parking position not found');
    }
  }

  /**
   * Find parking positions that contain a given point (x, y)
   * Used to match observations to positions based on location
   */
  async findPositionAtPoint(
    lotImageId: string,
    x: number,
    y: number
  ): Promise<ParkingPosition | null> {
    const result = await this.pool.query<ParkingPosition>(
      `SELECT * FROM parking_positions
       WHERE lot_image_id = $1
         AND deleted_at IS NULL
         AND SQRT(POWER(center_x - $2, 2) + POWER(center_y - $3, 2)) <= radius
       ORDER BY radius ASC
       LIMIT 1`,
      [lotImageId, x, y]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
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
