import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth-store';
import { apiClient } from '../api/client';

function Activate() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { setAccount, setError, setLoading, qrToken } = useAuthStore();

  const [activating, setActivating] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid activation link');
      setActivating(false);
      return;
    }

    const activate = async () => {
      setError(null);
      setLoading(true);
      setActivating(true);

      try {
        const account = await apiClient.activateAccount(token);

        // Store account with existing QR token or empty string
        setAccount(account, qrToken || '');

        setSuccess(true);

        // Auto-redirect to profile page after 2 seconds
        setTimeout(() => {
          navigate('/profile');
        }, 2000);
      } catch (error: any) {
        setError(error.message || 'Activation failed. The link may be invalid or expired.');
      } finally {
        setActivating(false);
        setLoading(false);
      }
    };

    activate();
  }, [token, navigate, setAccount, setError, setLoading, qrToken]);

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white shadow-lg rounded-lg p-8">
        {activating ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Activating Your Account
            </h2>
            <p className="text-gray-600">Please wait...</p>
          </div>
        ) : success ? (
          <div className="text-center">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Email Verified!
            </h2>
            <p className="text-gray-600 mb-4">
              Your email has been successfully verified.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to profile completion...
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-red-600 text-6xl mb-4">✗</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Activation Failed
            </h2>
            <p className="text-gray-600 mb-6">
              The activation link may be invalid or expired.
            </p>
            <Link
              to="/"
              className="inline-block bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 font-medium"
            >
              Return to Home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default Activate;
