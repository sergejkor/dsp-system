import { useMemo } from 'react';

import { useNetworkAnimation } from '../lib/useNetworkAnimation';
import { networkTheme } from '../lib/networkTheme';

function getBackgroundPresentation(variant) {
  if (variant === 'loginDark') {
    return {
      backgroundPosition: 'center center',
      backgroundSize: 'cover',
      transform: 'none',
      backgroundColor: '#040914',
    };
  }

  return {
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    transform: 'scale(1.015)',
    backgroundColor: 'transparent',
  };
}

function createOverlayBackground(variant) {
  if (variant === 'light') {
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
}) {
  const canvasRef = useNetworkAnimation({ isLoading, variant });
  const backgroundPresentation = useMemo(() => getBackgroundPresentation(variant), [variant]);

  return (
    <section
      className={className}
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        overflow: 'hidden',
        isolation: 'isolate',
        display: 'flex',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          backgroundColor: backgroundPresentation.backgroundColor,
        }}
      />

      <img
        src={imageSrc}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="sync"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          width: '100%',
          height: '100%',
          objectFit: backgroundPresentation.backgroundSize === 'cover' ? 'cover' : 'contain',
          objectPosition: backgroundPresentation.backgroundPosition,
          transform: backgroundPresentation.transform,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: createOverlayBackground(variant),
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: networkTheme[variant].overlay,
        }}
      />

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: isLoading ? 1 : 0,
          willChange: 'opacity',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 3,
          width: '100%',
          minHeight: '100dvh',
        }}
      >
        {children}
      </div>
    </section>
  );
}
