import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { NetworkLoadingBackground } from '../components/NetworkLoadingBackground';
import { useAuth } from '../context/AuthContext';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return') || searchParams.get('redirect') || '/';

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier || !password) {
      setError('Enter your username and password to continue.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await login(trimmedIdentifier, password);
      navigate(returnTo, { replace: true });
    } catch (submitError) {
      setError(submitError.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <NetworkLoadingBackground
      imageSrc="/images/leitcore-login-bg.jpg"
      isLoading
      variant="loginDark"
    >
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.column}>
            <div className={styles.card}>
              <div className={styles.badge}>Enterprise Access</div>

              <div className={styles.header}>
                <h1>Sign in to your workspace</h1>
              </div>

              <form className={styles.form} onSubmit={handleSubmit}>
                <label className={styles.field}>
                  <span>Email or username</span>
                  <input
                    type="text"
                    name="identifier"
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="Enter your e-mail"
                    disabled={submitting}
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>Password</span>
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    disabled={submitting}
                    required
                  />
                </label>

                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}

                <button className={styles.submit} type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className={styles.spinner} aria-hidden="true" />
                      Verifying access
                    </>
                  ) : (
                    'Continue'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </NetworkLoadingBackground>
  );
}
