import React, { useEffect, useState } from 'react';
import { parkingPositionsApi } from '../api/client';
import { useAppStore } from '../store/app-store';

export function ParkingPositions() {
  const { currentSiteId, setError } = useAppStore();
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentSiteId) {
      setError('Please configure Site ID on the Dashboard first');
      setLoading(false);
      return;
    }

    loadPositions();
  }, [currentSiteId]);

  const loadPositions = async () => {
    if (!currentSiteId) return;

    setLoading(true);
    try {
      const data = await parkingPositionsApi.list(currentSiteId);
      setPositions(data);
      setError(null);
    } catch (error: any) {
      setError(error.message || 'Failed to load parking positions');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading parking positions...</div>
      </div>
    );
  }

  if (!currentSiteId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <p className="text-yellow-800">
          Please configure Site ID on the Dashboard first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Parking Positions</h2>
          <p className="text-gray-600">
            {positions.length} positions in the parking lot
          </p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Add Position
        </button>
      </div>

      {/* Positions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {positions.map((position) => (
          <PositionCard key={position.id} position={position} />
        ))}
      </div>

      {positions.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600 mb-4">No parking positions found</p>
          <p className="text-sm text-gray-500">
            Run <code className="bg-gray-100 px-2 py-1 rounded">npm run seed</code> to create test data
          </p>
        </div>
      )}
    </div>
  );
}

function PositionCard({ position }: { position: any }) {
  const typeColors = {
    HANDICAPPED: 'bg-blue-100 text-blue-800',
    OPEN: 'bg-green-100 text-green-800',
    PURCHASED: 'bg-yellow-100 text-yellow-800',
    RESERVED: 'bg-orange-100 text-orange-800',
  };

  const typeIcons = {
    HANDICAPPED: '♿',
    OPEN: '🅿️',
    PURCHASED: '🔒',
    RESERVED: '🅁',
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">
            {typeIcons[position.type as keyof typeof typeIcons]}
          </span>
          <div>
            <h3 className="font-semibold text-gray-900">
              {position.identifier || 'Unnamed'}
            </h3>
            <p className="text-sm text-gray-600">
              Position: ({position.centerX}, {position.centerY})
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div
          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            typeColors[position.type as keyof typeof typeColors]
          }`}
        >
          {position.type}
        </div>

        {position.rentalInfo && (
          <p className="text-sm text-gray-600">{position.rentalInfo}</p>
        )}

        <div className="text-xs text-gray-500">
          Radius: {position.radius}px
        </div>
      </div>

      <div className="mt-4 flex space-x-2">
        <button className="text-sm text-blue-600 hover:text-blue-800">
          Edit
        </button>
        <button className="text-sm text-red-600 hover:text-red-800">
          Delete
        </button>
      </div>
    </div>
  );
}
