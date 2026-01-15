import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth-store';

interface ProtectedRouteProps {
  children: ReactNode;
  requireEmailVerified?: boolean;
  requireProfileComplete?: boolean;
}

function ProtectedRoute({
  children,
  requireEmailVerified = false,
  requireProfileComplete = false,
}: ProtectedRouteProps) {
  const { recipientAccountId, isEmailVerified, isProfileComplete } = useAuthStore();

  // Must have account
  if (!recipientAccountId) {
    return <Navigate to="/" replace />;
  }

  // Check email verification requirement
  if (requireEmailVerified && !isEmailVerified) {
    return <Navigate to="/" replace />;
  }

  // Check profile completion requirement
  if (requireProfileComplete && !isProfileComplete) {
    return <Navigate to="/profile" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
