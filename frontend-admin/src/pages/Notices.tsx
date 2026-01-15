import React, { useState, useEffect } from 'react';
import { noticesApi, violationsApi } from '../api/client';
import { useAppStore } from '../store/app-store';

interface Notice {
  id: string;
  violationId: string;
  qrToken: string;
  payload: {
    violationCategory: string;
    vehicleInfo: string;
    locationInfo: string;
    detectedAt: string;
    deadlines: {
      paymentDue?: string;
      appealDue?: string;
      towEligible?: string;
    };
    instructions: string;
  };
  issuedAt: string;
  printedAt?: string;
  issuedBy: string;
}

interface Violation {
  id: string;
  vehicleId: string;
  category: string;
  status: string;
  detectedAt: string;
  vehicle?: {
    licensePlate?: string;
    state?: string;
    make?: string;
    model?: string;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  FIRE_LANE: 'Fire Lane Violation',
  HANDICAPPED_NO_PLACARD: 'Handicapped Parking (No Placard)',
  UNAUTHORIZED_STALL: 'Unauthorized Parking Stall',
  EXPIRED_REGISTRATION: 'Expired Registration',
  ABANDONED_VEHICLE: 'Abandoned Vehicle',
};

export function Notices() {
  const { setError } = useAppStore();
  const [view, setView] = useState<'list' | 'issue'>('list');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  // Issue notice state
  const [violations, setViolations] = useState<Violation[]>([]);
  const [selectedViolationId, setSelectedViolationId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadNotices();
    loadEligibleViolations();
  }, []);

  const loadNotices = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1'}/notices`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load notices');
      }

      const data = await response.json();
      setNotices(data);
      setError(null);
    } catch (error: any) {
      setError(error.message || 'Failed to load notices');
    } finally {
      setLoading(false);
    }
  };

  const loadEligibleViolations = async () => {
    try {
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
      // Filter for violations that don't have notices and are eligible
      const eligible = data.filter(
        (v: Violation) =>
          v.status !== 'RESOLVED' && v.status !== 'DETECTED'
      );
      setViolations(eligible);
    } catch (error: any) {
      setError(error.message || 'Failed to load violations');
    }
  };

  const handleIssueNotice = async () => {
    if (!selectedViolationId) {
      setError('Please select a violation');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `notice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      await noticesApi.issue({
        idempotencyKey,
        violationId: selectedViolationId,
        issuedBy: 'admin-user',
      });

      await loadNotices();
      await loadEligibleViolations();
      setView('list');
      setSelectedViolationId('');
      setError(null);
      alert('Notice issued successfully!');
    } catch (error: any) {
      setError(error.message || 'Failed to issue notice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPrinted = async (noticeId: string) => {
    try {
      await noticesApi.markPrinted(noticeId);
      await loadNotices();
      setError(null);
    } catch (error: any) {
      setError(error.message || 'Failed to mark as printed');
    }
  };

  const handlePrint = (notice: Notice) => {
    // Generate printable notice content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Please allow popups to print notices');
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Parking Violation Notice - ${notice.qrToken}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 8.5in;
              margin: 0 auto;
              padding: 0.5in;
              line-height: 1.6;
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #000;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .section {
              margin: 20px 0;
            }
            .section-title {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 10px;
              text-transform: uppercase;
            }
            .qr-section {
              text-align: center;
              margin: 30px 0;
              padding: 20px;
              border: 2px dashed #000;
            }
            .footer {
              margin-top: 30px;
              border-top: 2px solid #000;
              padding-top: 20px;
              font-size: 12px;
              text-align: center;
            }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">PARKING VIOLATION NOTICE</div>
            <div>Cedar Terrace Parking Enforcement</div>
          </div>

          <div class="section">
            <div class="section-title">Violation Information</div>
            <p><strong>Category:</strong> ${CATEGORY_LABELS[notice.payload.violationCategory] || notice.payload.violationCategory}</p>
            <p><strong>Vehicle:</strong> ${notice.payload.vehicleInfo}</p>
            <p><strong>Location:</strong> ${notice.payload.locationInfo}</p>
            <p><strong>Detected:</strong> ${new Date(notice.payload.detectedAt).toLocaleString()}</p>
          </div>

          ${notice.payload.deadlines.paymentDue || notice.payload.deadlines.appealDue ? `
            <div class="section">
              <div class="section-title">Important Deadlines</div>
              ${notice.payload.deadlines.paymentDue ? `<p><strong>Payment Due:</strong> ${new Date(notice.payload.deadlines.paymentDue).toLocaleDateString()}</p>` : ''}
              ${notice.payload.deadlines.appealDue ? `<p><strong>Appeal By:</strong> ${new Date(notice.payload.deadlines.appealDue).toLocaleDateString()}</p>` : ''}
              ${notice.payload.deadlines.towEligible ? `<p><strong>Tow Eligible After:</strong> ${new Date(notice.payload.deadlines.towEligible).toLocaleDateString()}</p>` : ''}
            </div>
          ` : ''}

          <div class="section">
            <div class="section-title">Instructions</div>
            <p>${notice.payload.instructions}</p>
          </div>

          <div class="qr-section">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">
              View Ticket Online
            </div>
            <div style="font-size: 48px; font-family: monospace; margin: 20px 0;">
              [QR CODE]
            </div>
            <div style="font-size: 14px; font-weight: bold;">
              Token: ${notice.qrToken}
            </div>
            <div style="font-size: 12px; margin-top: 10px;">
              Scan to view ticket details and photos
            </div>
          </div>

          <div class="footer">
            <p>Cedar Terrace Parking Enforcement</p>
            <p>Notice ID: ${notice.id}</p>
            <p>Issued: ${new Date(notice.issuedAt).toLocaleString()}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();

    // Mark as printed
    handleMarkPrinted(notice.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-600">Loading notices...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notices</h2>
          <p className="text-gray-600">
            Issue and manage parking violation notices
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 rounded-lg ${
              view === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            View Notices
          </button>
          <button
            onClick={() => setView('issue')}
            className={`px-4 py-2 rounded-lg ${
              view === 'issue'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Issue Notice
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notices List */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              All Notices ({notices.length})
            </h3>
            {notices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No notices issued yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {notices.map((notice) => (
                  <button
                    key={notice.id}
                    onClick={() => setSelectedNotice(notice)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      selectedNotice?.id === notice.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono text-sm font-semibold text-blue-600">
                        {notice.qrToken}
                      </span>
                      {notice.printedAt ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Printed
                        </span>
                      ) : (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                          Not Printed
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {CATEGORY_LABELS[notice.payload.violationCategory] ||
                        notice.payload.violationCategory}
                    </div>
                    <div className="text-sm text-gray-600">
                      {notice.payload.vehicleInfo}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Issued: {new Date(notice.issuedAt).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notice Details */}
          <div className="bg-white rounded-lg shadow p-4">
            {selectedNotice ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Notice Details
                  </h3>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase">
                        QR Token
                      </dt>
                      <dd className="text-sm font-mono font-semibold text-blue-600 mt-1">
                        {selectedNotice.qrToken}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase">
                        Violation Category
                      </dt>
                      <dd className="text-sm text-gray-900 mt-1">
                        {CATEGORY_LABELS[selectedNotice.payload.violationCategory] ||
                          selectedNotice.payload.violationCategory}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase">
                        Vehicle
                      </dt>
                      <dd className="text-sm text-gray-900 mt-1">
                        {selectedNotice.payload.vehicleInfo}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase">
                        Location
                      </dt>
                      <dd className="text-sm text-gray-900 mt-1">
                        {selectedNotice.payload.locationInfo}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase">
                        Detected At
                      </dt>
                      <dd className="text-sm text-gray-900 mt-1">
                        {new Date(selectedNotice.payload.detectedAt).toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                {(selectedNotice.payload.deadlines.paymentDue ||
                  selectedNotice.payload.deadlines.appealDue) && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                      Deadlines
                    </h4>
                    <dl className="space-y-2">
                      {selectedNotice.payload.deadlines.paymentDue && (
                        <div className="flex justify-between text-sm">
                          <dt className="text-gray-600">Payment Due:</dt>
                          <dd className="font-medium">
                            {new Date(
                              selectedNotice.payload.deadlines.paymentDue
                            ).toLocaleDateString()}
                          </dd>
                        </div>
                      )}
                      {selectedNotice.payload.deadlines.appealDue && (
                        <div className="flex justify-between text-sm">
                          <dt className="text-gray-600">Appeal By:</dt>
                          <dd className="font-medium">
                            {new Date(
                              selectedNotice.payload.deadlines.appealDue
                            ).toLocaleDateString()}
                          </dd>
                        </div>
                      )}
                      {selectedNotice.payload.deadlines.towEligible && (
                        <div className="flex justify-between text-sm">
                          <dt className="text-gray-600">Tow Eligible:</dt>
                          <dd className="font-medium">
                            {new Date(
                              selectedNotice.payload.deadlines.towEligible
                            ).toLocaleDateString()}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    Instructions
                  </h4>
                  <p className="text-sm text-gray-700">
                    {selectedNotice.payload.instructions}
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <button
                    onClick={() => handlePrint(selectedNotice)}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Print Notice
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-2">No notice selected</p>
                <p className="text-sm">Select a notice to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Issue New Notice
          </h3>

          {violations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-2">No eligible violations found</p>
              <p className="text-sm">
                Violations must be in NOTICE_ISSUED, ESCALATED, or TOW_ELIGIBLE
                status
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Violation
                </label>
                <select
                  value={selectedViolationId}
                  onChange={(e) => setSelectedViolationId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Select a violation --</option>
                  {violations.map((violation) => (
                    <option key={violation.id} value={violation.id}>
                      {CATEGORY_LABELS[violation.category] || violation.category} -{' '}
                      {violation.vehicle?.licensePlate || 'Unknown'} (
                      {violation.status})
                    </option>
                  ))}
                </select>
              </div>

              {selectedViolationId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">
                    Preview
                  </h4>
                  <p className="text-sm text-blue-800">
                    A notice will be issued for the selected violation. A QR token
                    will be generated, and the notice can be printed for physical
                    posting.
                  </p>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleIssueNotice}
                  disabled={!selectedViolationId || submitting}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Issuing...' : 'Issue Notice'}
                </button>
                <button
                  onClick={() => setView('list')}
                  disabled={submitting}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
