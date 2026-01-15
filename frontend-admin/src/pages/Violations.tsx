import React, { useState, useEffect } from 'react';
import { violationsApi, observationsApi } from '../api/client';
import { useAppStore } from '../store/app-store';

interface Violation {
  id: string;
  vehicleId: string;
  category: string;
  status: string;
  detectedAt: string;
  noticeIssuedAt?: string;
  resolvedAt?: string;
  vehicle?: {
    licensePlate?: string;
    state?: string;
    make?: string;
    model?: string;
    color?: string;
  };
}

interface ViolationEvent {
  id: string;
  violationId: string;
  eventType: string;
  eventData: any;
  occurredAt: string;
  createdBy: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  FIRE_LANE: 'Fire Lane',
  HANDICAPPED_NO_PLACARD: 'Handicapped (No Placard)',
  UNAUTHORIZED_STALL: 'Unauthorized Stall',
  EXPIRED_REGISTRATION: 'Expired Registration',
  ABANDONED_VEHICLE: 'Abandoned Vehicle',
};

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'bg-yellow-100 text-yellow-800',
  NOTICE_ISSUED: 'bg-orange-100 text-orange-800',
  ESCALATED: 'bg-red-100 text-red-800',
  TOW_ELIGIBLE: 'bg-purple-100 text-purple-800',
  RESOLVED: 'bg-green-100 text-green-800',
};

export function Violations() {
  const { currentSiteId, setError } = useAppStore();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [events, setEvents] = useState<ViolationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');

  useEffect(() => {
    loadViolations();
  }, [currentSiteId]);

  useEffect(() => {
    if (selectedViolation) {
      loadViolationDetails(selectedViolation.id);
    }
  }, [selectedViolation]);

  const loadViolations = async () => {
    if (!currentSiteId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // In a real implementation, this would filter by siteId
      // For now, we'll fetch violations directly
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1'}/violations`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load violations');
      }

      const data = await response.json();
      setViolations(data);
      setError(null);
    } catch (error: any) {
      setError(error.message || 'Failed to load violations');
    } finally {
      setLoading(false);
    }
  };

  const loadViolationDetails = async (violationId: string) => {
    setDetailsLoading(true);
    try {
      const eventsData = await violationsApi.getEvents(violationId);
      setEvents(eventsData);
    } catch (error: any) {
      setError(error.message || 'Failed to load violation details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleEvaluateTimelines = async () => {
    try {
      await violationsApi.evaluateTimelines();
      await loadViolations();
      if (selectedViolation) {
        await loadViolationDetails(selectedViolation.id);
      }
      alert('Timelines evaluated successfully');
    } catch (error: any) {
      setError(error.message || 'Failed to evaluate timelines');
    }
  };

  const filteredViolations = violations.filter((v) => {
    if (filterStatus && v.status !== filterStatus) return false;
    if (filterCategory && v.category !== filterCategory) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-600">Loading violations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Violations</h2>
          <p className="text-gray-600">
            Active enforcement issues and violations
          </p>
        </div>
        <button
          onClick={handleEvaluateTimelines}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Evaluate Timelines
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="DETECTED">Detected</option>
              <option value="NOTICE_ISSUED">Notice Issued</option>
              <option value="ESCALATED">Escalated</option>
              <option value="TOW_ELIGIBLE">Tow Eligible</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violations List */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            All Violations ({filteredViolations.length})
          </h3>
          {filteredViolations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No violations found</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredViolations.map((violation) => (
                <button
                  key={violation.id}
                  onClick={() => setSelectedViolation(violation)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedViolation?.id === violation.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span
                        className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                          STATUS_COLORS[violation.status] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {violation.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(violation.detectedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-gray-900 mb-1">
                    {CATEGORY_LABELS[violation.category] || violation.category}
                  </div>
                  {violation.vehicle && (
                    <div className="text-sm text-gray-600">
                      {violation.vehicle.licensePlate && (
                        <span className="font-medium">
                          {violation.vehicle.licensePlate}
                          {violation.vehicle.state && ` (${violation.vehicle.state})`}
                        </span>
                      )}
                      {violation.vehicle.make && (
                        <span className="ml-2">
                          {violation.vehicle.make}
                          {violation.vehicle.model && ` ${violation.vehicle.model}`}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Violation Details */}
        <div className="bg-white rounded-lg shadow p-4">
          {selectedViolation ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Violation Details
                </h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase">
                      Category
                    </dt>
                    <dd className="text-sm text-gray-900 mt-1">
                      {CATEGORY_LABELS[selectedViolation.category] ||
                        selectedViolation.category}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase">
                      Status
                    </dt>
                    <dd className="mt-1">
                      <span
                        className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                          STATUS_COLORS[selectedViolation.status] ||
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {selectedViolation.status.replace(/_/g, ' ')}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase">
                      Detected At
                    </dt>
                    <dd className="text-sm text-gray-900 mt-1">
                      {new Date(selectedViolation.detectedAt).toLocaleString()}
                    </dd>
                  </div>
                  {selectedViolation.noticeIssuedAt && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase">
                        Notice Issued
                      </dt>
                      <dd className="text-sm text-gray-900 mt-1">
                        {new Date(selectedViolation.noticeIssuedAt).toLocaleString()}
                      </dd>
                    </div>
                  )}
                  {selectedViolation.resolvedAt && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase">
                        Resolved At
                      </dt>
                      <dd className="text-sm text-gray-900 mt-1">
                        {new Date(selectedViolation.resolvedAt).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {selectedViolation.vehicle && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    Vehicle Information
                  </h4>
                  <dl className="space-y-2">
                    {selectedViolation.vehicle.licensePlate && (
                      <div className="flex justify-between text-sm">
                        <dt className="text-gray-600">License Plate:</dt>
                        <dd className="font-medium">
                          {selectedViolation.vehicle.licensePlate}
                          {selectedViolation.vehicle.state &&
                            ` (${selectedViolation.vehicle.state})`}
                        </dd>
                      </div>
                    )}
                    {selectedViolation.vehicle.make && (
                      <div className="flex justify-between text-sm">
                        <dt className="text-gray-600">Make/Model:</dt>
                        <dd className="font-medium">
                          {selectedViolation.vehicle.make}
                          {selectedViolation.vehicle.model &&
                            ` ${selectedViolation.vehicle.model}`}
                        </dd>
                      </div>
                    )}
                    {selectedViolation.vehicle.color && (
                      <div className="flex justify-between text-sm">
                        <dt className="text-gray-600">Color:</dt>
                        <dd className="font-medium">{selectedViolation.vehicle.color}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Timeline Events
                </h4>
                {detailsLoading ? (
                  <div className="text-center py-4 text-gray-500">Loading...</div>
                ) : events.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">No events</div>
                ) : (
                  <div className="space-y-3">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className="bg-gray-50 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(event.occurredAt).toLocaleDateString()}
                          </span>
                        </div>
                        {event.eventData && Object.keys(event.eventData).length > 0 && (
                          <pre className="text-xs text-gray-600 mt-2 overflow-auto">
                            {JSON.stringify(event.eventData, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-2">No violation selected</p>
              <p className="text-sm">Select a violation to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
