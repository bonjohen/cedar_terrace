import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth-store';
import { apiClient } from '../api/client';

function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAccount, setError, setLoading } = useAuthStore();

  const [qrToken, setQrToken] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Extract QR token from URL query parameter
    const qrParam = searchParams.get('qr');
    if (qrParam) {
      setQrToken(qrParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowSuccess(false);

    if (!qrToken.trim()) {
      setError('Please enter a QR code');
      return;
    }

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    setLoading(true);

    try {
      const response = await apiClient.initiateAccess(qrToken, email);

      if (response.activationRequired) {
        // Show success message - user needs to check email
        setShowSuccess(true);
        setEmail(''); // Clear form
      } else {
        // Email already verified - load account and redirect
        const account = await apiClient.getAccount(response.recipientAccountId);
        setAccount(account, qrToken);

        // Redirect based on profile completion
        if (account.profileCompletedAt) {
          navigate('/ticket');
        } else {
          navigate('/profile');
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to access ticket. Please try again.');
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white shadow-lg rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Your Ticket</h2>
        <p className="text-gray-600 mb-6">
          Enter the QR code from your parking notice and your email address to view ticket details.
        </p>

        {showSuccess ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <h3 className="text-lg font-semibold text-green-900 mb-2">
              Check Your Email
            </h3>
            <p className="text-green-800">
              We've sent an activation link to your email address. Click the link in the email to verify your account and access your ticket.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="qrToken" className="block text-sm font-medium text-gray-700 mb-2">
                QR Code
              </label>
              <input
                type="text"
                id="qrToken"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                placeholder="NT-XXXXXXXX"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Find this code on your printed parking notice
              </p>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? 'Accessing...' : 'Access Ticket'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            Need help? Contact us at{' '}
            <a href="mailto:support@cedarterrace.example.com" className="text-blue-600 hover:underline">
              support@cedarterrace.example.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Landing;
