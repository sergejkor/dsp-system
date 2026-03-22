import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <p>Loading…</p>
        <style>{`.auth-loading { padding: 2rem; text-align: center; color: #6b7280; }`}</style>
      </div>
    );
  }

  if (!user) {
    const from = location.pathname + location.search;
    const to = from && from !== '/' ? `/login?return=${encodeURIComponent(from)}` : '/login';
    return <Navigate to={to} state={{ from: location }} replace />;
  }

  return children;
}
