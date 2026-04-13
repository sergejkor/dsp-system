import { useEffect, useRef, useState } from 'react';

export default function InspectionCamera({
  shot,
  overlayUrl,
  overlayScale = 1,
  currentPhoto,
  onCapture,
  onRetake,
  disabled = false,
  stepNumber = 1,
  totalSteps = 8,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= window.innerHeight;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateOrientation = () => setIsLandscape(window.innerWidth >= window.innerHeight);
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Live camera preview is not available in this browser. Use file upload below.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 16 / 9 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (_error) {
        setCameraError('Camera access is unavailable in this browser.');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function stageBlob(blob) {
    if (!blob) return;
    await onCapture(blob);
  }

  async function captureFromVideo() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) await stageBlob(blob);
  }

  return (
    <section className="fleet-inspection-camera">
      <div className="fleet-inspection-camera__stage">
        {currentPhoto?.previewUrl ? (
          <img
            src={currentPhoto.previewUrl}
            alt={`${shot.label} preview`}
            className="fleet-inspection-camera__media"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              className="fleet-inspection-camera__media"
              muted
              playsInline
            />
            {overlayUrl ? (
              <div className="fleet-inspection-camera__overlay-shell">
                <img
                  src={overlayUrl}
                  alt=""
                  aria-hidden="true"
                  className="fleet-inspection-camera__overlay"
                  style={{ '--fleet-overlay-scale': overlayScale }}
                />
              </div>
            ) : null}
            {!cameraReady ? (
              <div className="fleet-inspection-camera__placeholder">
                Preparing camera...
              </div>
            ) : null}
          </>
        )}

        {!currentPhoto?.previewUrl && !isLandscape ? (
          <div className="fleet-inspection-camera__orientation-lock">
            <div className="fleet-inspection-camera__orientation-card">
              <strong>Rotate phone horizontally</strong>
              <p>Hold your phone in landscape mode before taking this shot.</p>
            </div>
          </div>
        ) : null}
        {cameraError ? (
          <div className="fleet-inspection-alert fleet-inspection-alert--warning fleet-inspection-camera__toast">
            {cameraError}
          </div>
        ) : null}

        <div className="fleet-inspection-camera__controls">
          {currentPhoto?.previewUrl ? (
            <button
              type="button"
              className="fleet-inspection-camera__shutter fleet-inspection-camera__shutter--retake"
              onClick={onRetake}
              disabled={disabled}
              aria-label="Retake photo"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M8 7H4v4M4.6 11A8 8 0 1 0 8 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="fleet-inspection-camera__shutter"
              onClick={() => void captureFromVideo()}
              disabled={disabled || !cameraReady || !isLandscape}
              aria-label={isLandscape ? 'Capture shot' : 'Rotate phone to continue'}
            >
              <span className="fleet-inspection-camera__shutter-ring">
                <span className="fleet-inspection-camera__shutter-core" />
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
