import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return') || searchParams.get('redirect') || '/';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(returnTo, { replace: true });
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <h1>AlfaMile GmbH DSP System</h1>
        <h2>Sign in</h2>
        {error && <p className="login-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
      <style>{`
        .login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f3f4f6; padding: 1rem; }
        .login-card { max-width: 380px; width: 100%; }
        .login-card h1 { margin: 0 0 0.5rem 0; font-size: 1.25rem; }
        .login-card h2 { margin: 0 0 1rem 0; font-size: 1rem; font-weight: 600; color: #374151; }
        .login-error { color: #b91c1c; background: #fee2e2; padding: 0.5rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
        .login-card label { display: block; margin-bottom: 1rem; font-size: 0.9rem; }
        .login-card input { display: block; width: 100%; margin-top: 0.25rem; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 6px; }
        .login-card button { width: 100%; padding: 0.6rem; background: #111827; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
        .login-card button:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
