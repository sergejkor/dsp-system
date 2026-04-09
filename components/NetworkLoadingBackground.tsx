"use client";

import type { CSSProperties, ReactNode } from "react";

import { useNetworkAnimation } from "../lib/useNetworkAnimation";
import { networkTheme, type NetworkVariant } from "../lib/networkTheme";

export type NetworkLoadingBackgroundProps = {
  imageSrc: string;
  isLoading: boolean;
  variant: NetworkVariant;
  children?: ReactNode;
  className?: string;
};

function getBackgroundPresentation(variant: NetworkVariant) {
  if (variant === "loginDark") {
    return {
      backgroundPosition: "center center",
      backgroundSize: "cover",
      transform: "none",
      backgroundColor: "#040914",
    } as const;
  }

  return {
    backgroundPosition: "center",
    backgroundSize: "cover",
    transform: "scale(1.015)",
    backgroundColor: "transparent",
  } as const;
}

function createOverlayBackground(variant: NetworkVariant) {
  if (variant === "light") {
    return `
      linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(247,250,255,0.16) 42%, rgba(235,241,249,0.12) 100%),
      radial-gradient(circle at 50% 18%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 38%)
    `;
  }

  return `
    linear-gradient(180deg, rgba(2,7,18,0.58) 0%, rgba(4,10,24,0.28) 36%, rgba(5,11,22,0.52) 100%),
    radial-gradient(circle at 50% 18%, rgba(45,84,160,0.14) 0%, rgba(6,12,24,0) 42%)
  `;
}

export function NetworkLoadingBackground({
  imageSrc,
  isLoading,
  variant,
  children,
  className,
}: NetworkLoadingBackgroundProps) {
  const canvasRef = useNetworkAnimation({ isLoading, variant });
  const backgroundPresentation = getBackgroundPresentation(variant);

  const rootStyle: CSSProperties = {
    position: "relative",
    minHeight: "100dvh",
    width: "100%",
    overflow: "hidden",
    isolation: "isolate",
    display: "flex",
  };

  const contentStyle: CSSProperties = {
    position: "relative",
    zIndex: 3,
    width: "100%",
    minHeight: "100dvh",
  };

  return (
    <section className={className} style={rootStyle}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          backgroundImage: `url(${imageSrc})`,
          backgroundPosition: backgroundPresentation.backgroundPosition,
          backgroundRepeat: "no-repeat",
          backgroundSize: backgroundPresentation.backgroundSize,
          backgroundColor: backgroundPresentation.backgroundColor,
          transform: backgroundPresentation.transform,
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: createOverlayBackground(variant),
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: networkTheme[variant].overlay,
        }}
      />

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: isLoading ? 1 : 0,
          willChange: "opacity",
        }}
      />

      <div style={contentStyle}>{children}</div>
    </section>
  );
}
