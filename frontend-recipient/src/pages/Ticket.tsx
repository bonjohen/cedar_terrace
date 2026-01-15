import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth-store';
import { apiClient } from '../api/client';
import type { TicketDetailResponse } from '@cedar-terrace/shared';

function Ticket() {
  const { recipientAccountId, qrToken, setError, setLoading } = useAuthStore();

  const [ticket, setTicket] = useState<TicketDetailResponse | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const loadTicket = async () => {
      if (!recipientAccountId || !qrToken) {
        setError('No ticket information found');
        setLoadingTicket(false);
        return;
      }

      setError(null);
      setLoading(true);
      setLoadingTicket(true);

      try {
        const ticketData = await apiClient.getTicketDetails(recipientAccountId, qrToken);
        setTicket(ticketData);
      } catch (error: any) {
        setError(error.message || 'Failed to load ticket details');
      } finally {
        setLoadingTicket(false);
        setLoading(false);
      }
    };

    loadTicket();
  }, [recipientAccountId, qrToken, setError, setLoading]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'DETECTED':
        return 'bg-red-100 text-red-800';
      case 'NOTICE_ISSUED':
        return 'bg-yellow-100 text-yellow-800';
      case 'ESCALATED':
        return 'bg-orange-100 text-orange-800';
      case 'TOW_ELIGIBLE':
        return 'bg-red-200 text-red-900';
      case 'RESOLVED':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'HANDICAPPED_NO_PLACARD':
        return 'bg-blue-100 text-blue-800';
      case 'UNAUTHORIZED_STALL':
        return 'bg-purple-100 text-purple-800';
      case 'FIRE_LANE':
        return 'bg-red-100 text-red-800';
      case 'NO_PARKING_ZONE':
        return 'bg-orange-100 text-orange-800';
      case 'EXPIRED_REGISTRATION':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCategory = (category: string) => {
    return category
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isDeadlineUrgent = (deadlineString?: string) => {
    if (!deadlineString) return false;
    const deadline = new Date(deadlineString);
    const now = new Date();
    const daysUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil <= 3;
  };

  if (loadingTicket) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading ticket details...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8 text-center">
          <p className="text-gray-600">No ticket information available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Violation Summary */}
      <div className="bg-white shadow-lg rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Parking Violation</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Category</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getCategoryBadgeClass(ticket.violation.category)}`}>
              {formatCategory(ticket.violation.category)}
            </span>
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(ticket.violation.status)}`}>
              {formatCategory(ticket.violation.status)}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">Detected</p>
          <p className="text-lg font-medium text-gray-900">
            {formatDate(ticket.violation.detectedAt)}
          </p>
        </div>
      </div>

      {/* Vehicle Information */}
      <div className="bg-white shadow-lg rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Vehicle Information</h3>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900">
            {ticket.vehicle.licensePlate}
          </span>
          <span className="text-lg text-gray-600">
            ({ticket.vehicle.issuingState})
          </span>
        </div>
      </div>

      {/* Evidence Photos */}
      {ticket.evidenceUrls && ticket.evidenceUrls.length > 0 && (
        <div className="bg-white shadow-lg rounded-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Evidence Photos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ticket.evidenceUrls.map((url, index) => (
              <div
                key={index}
                className="aspect-video bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setSelectedImage(url)}
              >
                <img
                  src={url}
                  alt={`Evidence ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Click on any photo to view full size
          </p>
        </div>
      )}

      {/* Notice Details */}
      <div className="bg-white shadow-lg rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Notice Details</h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600">Notice Issued</p>
            <p className="text-lg font-medium text-gray-900">
              {formatDate(ticket.notice.issuedAt)}
            </p>
          </div>

          {ticket.notice.deadlines.paymentDue && (
            <div className={isDeadlineUrgent(ticket.notice.deadlines.paymentDue) ? 'bg-red-50 p-4 rounded-lg' : ''}>
              <p className="text-sm text-gray-600">Payment Due</p>
              <p className="text-lg font-bold text-gray-900">
                {formatDate(ticket.notice.deadlines.paymentDue)}
              </p>
              {isDeadlineUrgent(ticket.notice.deadlines.paymentDue) && (
                <p className="text-sm text-red-600 mt-1">⚠️ Deadline approaching</p>
              )}
            </div>
          )}

          {ticket.notice.deadlines.appealDue && (
            <div className={isDeadlineUrgent(ticket.notice.deadlines.appealDue) ? 'bg-yellow-50 p-4 rounded-lg' : ''}>
              <p className="text-sm text-gray-600">Appeal Due</p>
              <p className="text-lg font-bold text-gray-900">
                {formatDate(ticket.notice.deadlines.appealDue)}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-2">Instructions</p>
            <div className="text-gray-700 whitespace-pre-line">
              {ticket.notice.instructions}
            </div>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-4xl max-h-full">
            <img
              src={selectedImage}
              alt="Evidence"
              className="max-w-full max-h-screen object-contain"
            />
          </div>
          <button
            className="absolute top-4 right-4 text-white text-4xl font-bold hover:text-gray-300"
            onClick={() => setSelectedImage(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default Ticket;
