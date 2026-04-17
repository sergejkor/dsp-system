import { useEffect, useRef, useState } from 'react';

async function requestInspectionCameraStream() {
  const attempts = [
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 16 / 9 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: 'environment',
      },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ];

  let lastError = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Camera access is unavailable in this browser.');
}

function prepareVideoElement(video) {
  if (!video) return;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('muted', 'true');
  video.setAttribute('autoplay', 'true');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
}

export default function InspectionCamera({
  shot,
  overlayUrl,
  overlayScale = 1,
  currentPhoto,
  onCapture,
  onNext,
  onRetake,
  disabled = false,
  stepNumber = 1,
  totalSteps = 8,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
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
        setCameraReady(false);
        setCameraError('');
        const stream = await requestInspectionCameraStream();

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          prepareVideoElement(videoRef.current);
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (error) {
        const message =
          error?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Please allow camera access in Safari settings.'
            : 'Camera access is unavailable in this browser.';
        setCameraError(message);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (currentPhoto?.previewUrl) return;
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    prepareVideoElement(video);
    if (video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
    }
    void video.play().catch(() => {});
  }, [currentPhoto?.previewUrl, shot?.id]);

  async function stageBlob(blob) {
    if (!blob) return;
    await onCapture(blob);
  }

  function playShutterSound() {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const audioContext = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') {
        void audioContext.resume();
      }

      const startAt = audioContext.currentTime;
      const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.08), audioContext.sampleRate);
      const channelData = buffer.getChannelData(0);
      for (let index = 0; index < channelData.length; index += 1) {
        channelData[index] = (Math.random() * 2 - 1) * (1 - index / channelData.length);
      }

      const noiseSource = audioContext.createBufferSource();
      noiseSource.buffer = buffer;
      const noiseFilter = audioContext.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(1200, startAt);
      const noiseGain = audioContext.createGain();
      noiseGain.gain.setValueAtTime(0.0001, startAt);
      noiseGain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.01);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.075);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(audioContext.destination);

      const tone = audioContext.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(880, startAt);
      tone.frequency.exponentialRampToValueAtTime(240, startAt + 0.09);
      const toneGain = audioContext.createGain();
      toneGain.gain.setValueAtTime(0.0001, startAt);
      toneGain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.012);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.09);
      tone.connect(toneGain);
      toneGain.connect(audioContext.destination);

      noiseSource.start(startAt);
      noiseSource.stop(startAt + 0.08);
      tone.start(startAt);
      tone.stop(startAt + 0.1);
    } catch (_error) {
      // Shutter sound is a UX enhancement only; ignore audio failures silently.
    }
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
    if (blob) {
      playShutterSound();
      await stageBlob(blob);
    }
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
              autoPlay
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
            <div className="fleet-inspection-camera__review-actions">
              <button
                type="button"
                className="fleet-inspection-camera__review-btn fleet-inspection-camera__review-btn--next"
                onClick={onNext}
                disabled={disabled}
              >
                Next
              </button>
              <button
                type="button"
                className="fleet-inspection-camera__review-btn fleet-inspection-camera__review-btn--retake"
                onClick={onRetake}
                disabled={disabled}
                aria-label="Retake photo"
              >
                Retake
              </button>
            </div>
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
