import React, { useEffect, useState, useRef } from 'react';
import { parkingPositionsApi } from '../api/client';
import { useAppStore } from '../store/app-store';

interface Position {
  id: string;
  type: string;
  centerX: number;
  centerY: number;
  radius: number;
  identifier: string;
  rentalInfo?: string;
}

type PositionType = 'HANDICAPPED' | 'OPEN' | 'PURCHASED' | 'RESERVED';

interface PositionFormData {
  type: PositionType;
  centerX: number;
  centerY: number;
  radius: number;
  identifier: string;
  rentalInfo: string;
}

export function LotEditor() {
  const { currentSiteId, currentLotImageId, setError } = useAppStore();
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<PositionFormData>({
    type: 'OPEN',
    centerX: 600,
    centerY: 400,
    radius: 30,
    identifier: '',
    rentalInfo: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!currentSiteId) {
      setError('Please configure Site ID on the Dashboard first');
      setLoading(false);
      return;
    }

    loadPositions();
  }, [currentSiteId]);

  useEffect(() => {
    if (positions.length > 0) {
      drawLot();
    }
  }, [positions, selectedPosition]);

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

  const drawLot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw positions
    positions.forEach((pos) => {
      const isSelected = selectedPosition === pos.id;

      // Position color based on type
      const colors: Record<string, string> = {
        HANDICAPPED: '#60a5fa',
        OPEN: '#34d399',
        PURCHASED: '#fbbf24',
        RESERVED: '#f59e0b',
      };

      ctx.fillStyle = colors[pos.type] || '#9ca3af';
      ctx.strokeStyle = isSelected ? '#ffffff' : '#ffffff';
      ctx.lineWidth = isSelected ? 4 : 2;

      // Draw circle
      ctx.beginPath();
      ctx.arc(pos.centerX, pos.centerY, pos.radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Draw identifier
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pos.identifier, pos.centerX, pos.centerY);
    });
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Find clicked position
    const clicked = positions.find((pos) => {
      const distance = Math.sqrt(
        Math.pow(pos.centerX - x, 2) + Math.pow(pos.centerY - y, 2)
      );
      return distance <= pos.radius;
    });

    setSelectedPosition(clicked?.id || null);
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      type: 'OPEN',
      centerX: 600,
      centerY: 400,
      radius: 30,
      identifier: '',
      rentalInfo: '',
    });
    setShowModal(true);
  };

  const openEditModal = () => {
    const pos = positions.find((p) => p.id === selectedPosition);
    if (!pos) return;

    setModalMode('edit');
    setFormData({
      type: pos.type as PositionType,
      centerX: pos.centerX,
      centerY: pos.centerY,
      radius: pos.radius,
      identifier: pos.identifier,
      rentalInfo: pos.rentalInfo || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSiteId || !currentLotImageId) return;

    setSubmitting(true);
    try {
      const payload = {
        siteId: currentSiteId,
        lotImageId: currentLotImageId,
        type: formData.type,
        centerX: formData.centerX,
        centerY: formData.centerY,
        radius: formData.radius,
        identifier: formData.identifier || null,
        rentalInfo: formData.rentalInfo || null,
      };

      if (modalMode === 'create') {
        await parkingPositionsApi.create(payload);
      } else {
        if (!selectedPosition) return;
        await parkingPositionsApi.update(selectedPosition, payload);
      }

      await loadPositions();
      setShowModal(false);
      setError(null);
    } catch (error: any) {
      setError(error.message || 'Failed to save position');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPosition) return;
    if (!confirm('Are you sure you want to delete this position?')) return;

    setSubmitting(true);
    try {
      await parkingPositionsApi.delete(selectedPosition);
      await loadPositions();
      setSelectedPosition(null);
      setError(null);
    } catch (error: any) {
      setError(error.message || 'Failed to delete position');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-600">Loading lot editor...</div>
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

  const selectedPos = positions.find((p) => p.id === selectedPosition);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lot Editor</h2>
          <p className="text-gray-600">
            Visual parking position management
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Add Position
          </button>
          <button
            onClick={loadPositions}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Parking Lot (1200 × 800px)
              </h3>
              <p className="text-sm text-gray-600">
                Click on a position to select and view details
              </p>
            </div>
            <div className="border-2 border-gray-300 rounded overflow-hidden">
              <canvas
                ref={canvasRef}
                width={1200}
                height={800}
                onClick={handleCanvasClick}
                className="cursor-pointer w-full"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <div className="mt-4 flex items-center space-x-4 text-sm">
              <LegendItem color="#60a5fa" label="Handicapped" />
              <LegendItem color="#34d399" label="Open" />
              <LegendItem color="#fbbf24" label="Purchased" />
              <LegendItem color="#f59e0b" label="Reserved" />
            </div>
          </div>
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4 sticky top-4">
            {selectedPos ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Position Details
                  </h3>
                  <div className="space-y-3">
                    <DetailRow label="Identifier" value={selectedPos.identifier} />
                    <DetailRow label="Type" value={selectedPos.type} />
                    <DetailRow
                      label="Center"
                      value={`(${selectedPos.centerX}, ${selectedPos.centerY})`}
                    />
                    <DetailRow label="Radius" value={`${selectedPos.radius}px`} />
                    {selectedPos.rentalInfo && (
                      <DetailRow label="Info" value={selectedPos.rentalInfo} />
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <button
                    onClick={openEditModal}
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Edit Position
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={submitting}
                    className="w-full bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    Delete Position
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <p className="mb-2">No position selected</p>
                <p className="text-sm">Click on a position to view details</p>
              </div>
            )}
          </div>

          {/* Position List */}
          <div className="mt-4 bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              All Positions ({positions.length})
            </h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => setSelectedPosition(pos.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedPosition === pos.id
                      ? 'bg-blue-100 text-blue-900'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="font-medium">{pos.identifier}</span>
                  <span className="text-gray-500 ml-2">({pos.type})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {modalMode === 'create' ? 'Add Parking Position' : 'Edit Parking Position'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as PositionType })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="OPEN">Open</option>
                  <option value="HANDICAPPED">Handicapped</option>
                  <option value="PURCHASED">Purchased</option>
                  <option value="RESERVED">Reserved</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Identifier
                </label>
                <input
                  type="text"
                  value={formData.identifier}
                  onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., H1, 3, P5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Center X
                  </label>
                  <input
                    type="number"
                    value={formData.centerX}
                    onChange={(e) => setFormData({ ...formData, centerX: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="1200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Center Y
                  </label>
                  <input
                    type="number"
                    value={formData.centerY}
                    onChange={(e) => setFormData({ ...formData, centerY: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="800"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Radius (px)
                </label>
                <input
                  type="number"
                  value={formData.radius}
                  onChange={(e) => setFormData({ ...formData, radius: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="10"
                  max="100"
                  required
                />
              </div>

              {(formData.type === 'PURCHASED' || formData.type === 'RESERVED') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rental Info
                  </label>
                  <textarea
                    value={formData.rentalInfo}
                    onChange={(e) => setFormData({ ...formData, rentalInfo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Assignment or rental details"
                  />
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Update'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center space-x-2">
      <div
        className="w-4 h-4 rounded-full border-2 border-white"
        style={{ backgroundColor: color }}
      />
      <span className="text-gray-700">{label}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  );
}
