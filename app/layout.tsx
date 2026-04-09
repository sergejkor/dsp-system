import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LeitCore",
  description: "Premium authentication and background system for LeitCore.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#040914",
          color: "#eef5ff",
          fontFamily:
            'Inter, "Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {children}
      </body>
    </html>
  );
}
