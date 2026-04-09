"use client";

import { useEffect, useState } from "react";

import { LoginCard, type LoginCardSubmitData } from "../../components/LoginCard";
import { NetworkLoadingBackground } from "../../components/NetworkLoadingBackground";
import styles from "./page.module.css";

export default function LoginPage() {
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsBootLoading(false);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleSubmit(data: LoginCardSubmitData) {
    setIsSubmitting(true);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 2600));
      console.info("LeitCore login payload prepared", {
        identifier: data.identifier,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <NetworkLoadingBackground
      imageSrc="/images/leitcore-login-bg.png"
      isLoading={isBootLoading || isSubmitting}
      variant="loginDark"
    >
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.column}>
            <LoginCard isSubmitting={isSubmitting} onSubmit={handleSubmit} />
          </div>
        </div>
      </main>
    </NetworkLoadingBackground>
  );
}
