"use client";

import { useState, type FormEvent } from "react";
import styles from "./LoginCard.module.css";

export type LoginCardSubmitData = {
  identifier: string;
  password: string;
};

export type LoginCardProps = {
  isSubmitting?: boolean;
  onSubmit?: (data: LoginCardSubmitData) => Promise<void> | void;
};

export function LoginCard({ isSubmitting = false, onSubmit }: LoginCardProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier || !password) {
      setErrorMessage("Enter your username and password to continue.");
      return;
    }

    setErrorMessage(null);
    await onSubmit?.({
      identifier: trimmedIdentifier,
      password,
    });
  }

  return (
    <div className={styles.card}>
      <div className={styles.badge}>Enterprise Access</div>
      <div className={styles.header}>
        <h1>Sign in to your workspace</h1>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>Email or username</span>
          <input
            autoComplete="username"
            disabled={isSubmitting}
            name="identifier"
            placeholder="name@leitcore.io"
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>Password</span>
          <input
            autoComplete="current-password"
            disabled={isSubmitting}
            name="password"
            placeholder="Enter your password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button className={styles.submit} disabled={isSubmitting} type="submit">
          {isSubmitting ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Verifying access
            </>
          ) : (
            "Continue"
          )}
        </button>
      </form>
    </div>
  );
}
