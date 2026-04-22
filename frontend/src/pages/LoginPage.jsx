import React, { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { NetworkLoadingBackground } from '../components/NetworkLoadingBackground';
import { useAuth } from '../context/AuthContext';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return') || searchParams.get('redirect') || '/';

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmedIdentifier = String(
      identifierRef.current?.value
      || formData.get('email')
      || formData.get('identifier')
      || '',
    ).trim();
    const resolvedPassword = String(
      passwordRef.current?.value
      || formData.get('password')
      || '',
    );

    if (!trimmedIdentifier || !resolvedPassword) {
      setError('Enter your email and password to continue.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await login(trimmedIdentifier, resolvedPassword);
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
                  <span>Email</span>
                  <input
                    ref={identifierRef}
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="Enter your email"
                    disabled={submitting}
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>Password</span>
                  <input
                    ref={passwordRef}
                    type="password"
                    name="password"
                    autoComplete="current-password"
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
