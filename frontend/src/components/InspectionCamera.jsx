import { useEffect, useRef, useState } from 'react';

export default function InspectionCamera({
  shot,
  overlayUrl,
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
            width: { ideal: 1080 },
            height: { ideal: 1920 },
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
        setCameraError('Camera access is unavailable. Use the fallback file upload instead.');
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
              <img
                src={overlayUrl}
                alt=""
                aria-hidden="true"
                className="fleet-inspection-camera__overlay"
              />
            ) : null}
            {!cameraReady ? (
              <div className="fleet-inspection-camera__placeholder">
                Preparing camera...
              </div>
            ) : null}
          </>
        )}

        <div className="fleet-inspection-camera__hud">
          <span className="fleet-inspection-camera__badge">
            Shot {stepNumber} / {totalSteps}
          </span>
        </div>
      </div>

      <div className="fleet-inspection-camera__dock">
        {cameraError ? (
          <div className="fleet-inspection-alert fleet-inspection-alert--warning">
            {cameraError}
          </div>
        ) : null}

        <div className="fleet-inspection-camera__actions">
          {currentPhoto?.previewUrl ? (
            <button
              type="button"
              className="fleet-inspection-button fleet-inspection-button--secondary fleet-inspection-button--large"
              onClick={onRetake}
              disabled={disabled}
            >
              Retake
            </button>
          ) : (
            <button
              type="button"
              className="fleet-inspection-button fleet-inspection-button--large"
              onClick={() => void captureFromVideo()}
              disabled={disabled || !cameraReady}
            >
              Capture shot
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
