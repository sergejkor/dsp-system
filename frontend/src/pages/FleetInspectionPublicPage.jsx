import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import InspectionCamera from '../components/InspectionCamera.jsx';
import { getOverlaySet, REQUIRED_SHOT_IDS } from '../services/overlayRegistry.js';
import {
  resolveVehicleByVin,
  searchFleetInspectionOperators,
  submitPublicInspection,
} from '../services/internalInspectionApi.js';
import './fleetInspections.css';

const RESULT_LABELS = {
  baseline_created: 'Baseline saved',
  no_new_damage: 'No visible new damage',
  possible_new_damage: 'Possible new damage detected',
};

function normalizeVin(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 32);
}

function extractVinFromScan(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const fromQuery = normalizeVin(url.searchParams.get('vin'));
    if (fromQuery) return fromQuery;
    const lastSegment = url.pathname.split('/').filter(Boolean).pop();
    return normalizeVin(lastSegment);
  } catch (_error) {
    return normalizeVin(raw);
  }
}

function resultTone(result) {
  if (result === 'possible_new_damage') return 'warning';
  if (result === 'no_new_damage') return 'success';
  return 'neutral';
}

function getFirstMissingShotIndex(capturedShots) {
  const index = REQUIRED_SHOT_IDS.findIndex((shotId) => !capturedShots[shotId]);
  return index === -1 ? REQUIRED_SHOT_IDS.length - 1 : index;
}

async function requestLandscapeInspectionMode() {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  try {
    if (!document.fullscreenElement && root?.requestFullscreen) {
      await root.requestFullscreen();
    }
  } catch (_error) {}

  try {
    if (window.screen?.orientation?.lock) {
      await window.screen.orientation.lock('landscape');
    }
  } catch (_error) {}
}

async function releaseLandscapeInspectionMode() {
  if (typeof window === 'undefined') return;

  try {
    if (window.screen?.orientation?.unlock) {
      window.screen.orientation.unlock();
    }
  } catch (_error) {}

  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (_error) {}
}

export default function FleetInspectionPublicPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vinInput, setVinInput] = useState(() => normalizeVin(searchParams.get('vin')));
  const [vehicle, setVehicle] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [driverSuggestions, setDriverSuggestions] = useState([]);
  const [driverSuggestionsLoading, setDriverSuggestionsLoading] = useState(false);
  const [driverSuggestionsError, setDriverSuggestionsError] = useState('');
  const [driverSuggestionsVisible, setDriverSuggestionsVisible] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [inspectionStarted, setInspectionStarted] = useState(false);
  const [capturedShots, setCapturedShots] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingVehicle, setLoadingVehicle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('');
  const [scannerError, setScannerError] = useState('');
  const scannerVideoRef = useRef(null);
  const autoResolvedRef = useRef(false);
  const capturedShotsRef = useRef({});
  const scannerCooldownUntilRef = useRef(0);
  const lastScannedVinRef = useRef('');
  const driverSuggestionRequestRef = useRef(0);

  const barcodeSupported =
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof window.BarcodeDetector === 'function';

  const overlaySet = useMemo(() => {
    try {
      return vehicle?.vehicleType ? getOverlaySet(vehicle.vehicleType) : null;
    } catch (_error) {
      return null;
    }
  }, [vehicle]);

  const shots = overlaySet?.shots || [];
  const currentShot = shots[currentIndex] || null;
  const capturedCount = REQUIRED_SHOT_IDS.filter((shotId) => capturedShots[shotId]).length;
  const allCaptured = capturedCount === REQUIRED_SHOT_IDS.length;

  useEffect(() => {
    capturedShotsRef.current = capturedShots;
  }, [capturedShots]);

  useEffect(() => {
    return () => {
      Object.values(capturedShotsRef.current).forEach((shot) => {
        if (shot?.previewUrl) URL.revokeObjectURL(shot.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (!vehicle) {
      setInspectionStarted(false);
    }
  }, [vehicle]);

  useEffect(() => {
    if (!inspectionStarted) {
      void releaseLandscapeInspectionMode();
    }
    return () => {
      void releaseLandscapeInspectionMode();
    };
  }, [inspectionStarted]);

  useEffect(() => {
    const query = String(driverName || '').trim();
    if (!vehicle || query.length < 2) {
      setDriverSuggestions([]);
      setDriverSuggestionsLoading(false);
      setDriverSuggestionsError('');
      return undefined;
    }

    const requestId = driverSuggestionRequestRef.current + 1;
    driverSuggestionRequestRef.current = requestId;
    setDriverSuggestionsLoading(true);
    setDriverSuggestionsError('');

    const timeoutId = window.setTimeout(async () => {
      try {
        const rows = await searchFleetInspectionOperators(query);
        if (driverSuggestionRequestRef.current !== requestId) return;
        const normalizedQuery = query.toLowerCase();
        const suggestions = (rows || []).filter((row) => {
          const label = String(row?.label || '').trim().toLowerCase();
          return label && label !== normalizedQuery;
        });
        setDriverSuggestions(suggestions);
      } catch (lookupError) {
        if (driverSuggestionRequestRef.current !== requestId) return;
        setDriverSuggestions([]);
        setDriverSuggestionsError(String(lookupError?.message || 'Failed to load employee suggestions'));
      } finally {
        if (driverSuggestionRequestRef.current === requestId) {
          setDriverSuggestionsLoading(false);
        }
      }
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [driverName, vehicle]);

  useEffect(() => {
    const queryVin = normalizeVin(searchParams.get('vin'));
    if (!queryVin || autoResolvedRef.current) return;
    autoResolvedRef.current = true;
    setVinInput(queryVin);
    void handleResolveVehicle(queryVin);
  }, [searchParams]);

  useEffect(() => {
    if (!scannerActive || !barcodeSupported || vehicle) return undefined;

    let cancelled = false;
    let frameId = null;
    let mediaStream = null;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

    async function detectLoop() {
      if (cancelled || !scannerVideoRef.current) return;
      const video = scannerVideoRef.current;
      if (video.readyState >= 2) {
        try {
          const barcodes = await detector.detect(video);
          const nextVin = extractVinFromScan(barcodes?.[0]?.rawValue);
          if (nextVin) {
            const now = Date.now();
            if (
              lastScannedVinRef.current === nextVin &&
              scannerCooldownUntilRef.current > now
            ) {
              frameId = window.requestAnimationFrame(detectLoop);
              return;
            }
            lastScannedVinRef.current = nextVin;
            scannerCooldownUntilRef.current = now + 3000;
            setScannerStatus('QR detected. Loading vehicle...');
            setVinInput(nextVin);
            const resolved = await handleResolveVehicle(nextVin);
            if (resolved) {
              setScannerActive(false);
              return;
            }
            setScannerStatus('QR detected, but vehicle lookup failed. Try again or enter VIN manually.');
          }
        } catch (_error) {
          setScannerError('Unable to read this QR code. Try manual VIN entry.');
        }
      }
      frameId = window.requestAnimationFrame(detectLoop);
    }

    async function startScanner() {
      setScannerError('');
      setScannerStatus('Point the camera at the vehicle QR code.');
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = mediaStream;
          await scannerVideoRef.current.play().catch(() => {});
        }
        frameId = window.requestAnimationFrame(detectLoop);
      } catch (_error) {
        setScannerError('Camera access failed for QR scanning. Use manual VIN input instead.');
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      mediaStream?.getTracks().forEach((track) => track.stop());
    };
  }, [barcodeSupported, scannerActive, vehicle]);

  function resetCapturedShots() {
    setCapturedShots((prev) => {
      Object.values(prev).forEach((shot) => {
        if (shot?.previewUrl) URL.revokeObjectURL(shot.previewUrl);
      });
      return {};
    });
  }

  async function handleResolveVehicle(explicitVin) {
    const normalizedVin = normalizeVin(explicitVin ?? vinInput);
    if (!normalizedVin) {
      setError('Enter a valid VIN first.');
      return false;
    }

    setLoadingVehicle(true);
    setError('');
    setResult(null);
    setScannerError('');

    try {
      const resolvedVehicle = await resolveVehicleByVin(normalizedVin);
      setVehicle(resolvedVehicle);
      setInspectionStarted(false);
      setSearchParams({ vin: normalizedVin }, { replace: true });
      setCurrentIndex(0);
      resetCapturedShots();
      setScannerStatus('Vehicle loaded.');
      return true;
    } catch (resolveError) {
      setVehicle(null);
      setError(resolveError.message || 'Failed to resolve vehicle');
      return false;
    } finally {
      setLoadingVehicle(false);
    }
  }

  async function handleCaptureShot(shotId, blob) {
    const previewUrl = URL.createObjectURL(blob);
    const shotIndex = REQUIRED_SHOT_IDS.indexOf(shotId);

    setCapturedShots((prev) => {
      if (prev[shotId]?.previewUrl) {
        URL.revokeObjectURL(prev[shotId].previewUrl);
      }

      const next = {
        ...prev,
        [shotId]: { blob, previewUrl },
      };

      const nextIndex = REQUIRED_SHOT_IDS.findIndex((id, index) => index > shotIndex && !next[id]);
      setCurrentIndex(nextIndex === -1 ? shotIndex : nextIndex);
      return next;
    });
  }

  function handleRetakeShot(shotId) {
    const shotIndex = REQUIRED_SHOT_IDS.indexOf(shotId);
    setCurrentIndex(shotIndex === -1 ? 0 : shotIndex);
    setCapturedShots((prev) => {
      if (prev[shotId]?.previewUrl) {
        URL.revokeObjectURL(prev[shotId].previewUrl);
      }
      const next = { ...prev };
      delete next[shotId];
      return next;
    });
  }

  function handleStartInspection() {
    if (!vehicle) return;
    if (!driverName.trim()) {
      setError('Driver name is required.');
      return;
    }
    setError('');
    void requestLandscapeInspectionMode();
    setInspectionStarted(true);
    setCurrentIndex(getFirstMissingShotIndex(capturedShotsRef.current));
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function handleSubmitInspection() {
    if (!vehicle) return;
    if (!driverName.trim()) {
      setError('Driver name is required.');
      return;
    }
    if (!allCaptured) {
      setError('Capture all 8 required shots before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const inspection = await submitPublicInspection({
        vin: vehicle.vin,
        operatorName: driverName,
        vehicleType: vehicle.vehicleType,
        notes,
        shots: capturedShots,
      });
      setResult(inspection);
      setInspectionStarted(false);
      resetCapturedShots();
    } catch (submitError) {
      setError(submitError.message || 'Failed to submit inspection');
    } finally {
      setSubmitting(false);
    }
  }

  function startAnotherVehicle() {
    autoResolvedRef.current = false;
    setVehicle(null);
    setResult(null);
    setError('');
    setDriverSuggestions([]);
    setDriverSuggestionsLoading(false);
    setDriverSuggestionsError('');
    setDriverSuggestionsVisible(false);
    setNotes('');
    setNotesOpen(false);
    setDriverName('');
    setVinInput('');
    setInspectionStarted(false);
    setCurrentIndex(0);
    setScannerActive(false);
    setScannerStatus('');
    setScannerError('');
    scannerCooldownUntilRef.current = 0;
    lastScannedVinRef.current = '';
    setSearchParams({}, { replace: true });
    resetCapturedShots();
  }

  return (
    <div className={`fleet-inspection-page ${inspectionStarted ? 'fleet-inspection-page--camera' : ''}`}>
      <div className={`fleet-inspection-shell ${inspectionStarted ? 'fleet-inspection-shell--camera' : ''}`}>
        {!inspectionStarted ? (
          <header className="fleet-inspection-hero">
            <h1>Vehicle Inspection</h1>
            <p>
              Scan the vehicle QR, load the correct overlay automatically, and capture the 8 required
              inspection photos from your phone.
            </p>
            <div className="fleet-inspection-meta">
              <span className="fleet-inspection-meta__chip">8 required shots</span>
              <span className="fleet-inspection-meta__chip">VIN-based overlay loading</span>
              <span className="fleet-inspection-meta__chip">Internal DSP only</span>
            </div>
          </header>
        ) : null}

        {error ? (
          <div className="fleet-inspection-card">
            <div className="fleet-inspection-alert fleet-inspection-alert--error">{error}</div>
          </div>
        ) : null}

        {result ? (
          <section className="fleet-inspection-card">
            <div className="fleet-inspection-grid">
              <div>
                <p className="fleet-inspection-label">Inspection result</p>
                <h2>{RESULT_LABELS[result.overall_result] || 'Inspection submitted'}</h2>
                <p className="fleet-inspection-muted">
                  Vehicle {result.license_plate || result.vehicle_id || result.vin}
                </p>
              </div>
              <div className="fleet-inspection-meta">
                <span className="fleet-inspection-status" data-tone={resultTone(result.overall_result)}>
                  {RESULT_LABELS[result.overall_result] || result.overall_result}
                </span>
                <span className="fleet-inspection-meta__chip">
                  New damages: {result.new_damages_count ?? 0}
                </span>
                <span className="fleet-inspection-meta__chip">
                  Inspection #{result.id}
                </span>
              </div>
            </div>
            <div className="fleet-inspection-actions">
              <button type="button" className="fleet-inspection-button" onClick={startAnotherVehicle}>
                Scan another vehicle
              </button>
              <button
                type="button"
                className="fleet-inspection-button fleet-inspection-button--secondary"
                onClick={() => {
                  setResult(null);
                  setInspectionStarted(false);
                  setCurrentIndex(0);
                }}
              >
                Inspect same vehicle again
              </button>
            </div>
          </section>
        ) : null}

        {!vehicle ? (
          <>
            <section className="fleet-inspection-card">
              <div className="fleet-inspection-grid fleet-inspection-grid--two">
                <div className="fleet-inspection-field">
                  <label htmlFor="inspection-vin">Vehicle VIN</label>
                  <input
                    id="inspection-vin"
                    className="fleet-inspection-input"
                    value={vinInput}
                    onChange={(event) => setVinInput(normalizeVin(event.target.value))}
                    placeholder="Scan or enter VIN"
                    autoCapitalize="characters"
                    autoCorrect="off"
                  />
                </div>
                <div className="fleet-inspection-actions" style={{ alignItems: 'end' }}>
                  <button
                    type="button"
                    className="fleet-inspection-button"
                    onClick={() => void handleResolveVehicle()}
                    disabled={loadingVehicle}
                  >
                    {loadingVehicle ? 'Loading vehicle...' : 'Load vehicle'}
                  </button>
                  {barcodeSupported ? (
                    <button
                      type="button"
                      className="fleet-inspection-button fleet-inspection-button--secondary"
                      onClick={() => setScannerActive((current) => !current)}
                    >
                      {scannerActive ? 'Stop QR scanner' : 'Scan QR'}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            {scannerActive ? (
              <section className="fleet-inspection-card">
                <div className="fleet-inspection-scan-stage">
                  <video ref={scannerVideoRef} muted playsInline />
                  <div className="fleet-inspection-scan-frame" aria-hidden="true" />
                </div>
                <div className="fleet-inspection-grid" style={{ marginTop: '0.85rem' }}>
                  {scannerStatus ? <p className="fleet-inspection-muted">{scannerStatus}</p> : null}
                  {scannerError ? (
                    <div className="fleet-inspection-alert fleet-inspection-alert--warning">{scannerError}</div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {vehicle && !result && !inspectionStarted ? (
          <section className="fleet-inspection-card fleet-inspection-preflight">
            <div className="fleet-inspection-preflight__hero">
              <div>
                <p className="fleet-inspection-label">Ready to inspect</p>
                <h2>{vehicle.licensePlate || vehicle.vehicleId}</h2>
                <p className="fleet-inspection-muted">
                  {overlaySet?.label || vehicle.vehicleType} - VIN {vehicle.vin}
                </p>
              </div>
              <button
                type="button"
                className="fleet-inspection-button fleet-inspection-button--secondary"
                onClick={startAnotherVehicle}
              >
                Change vehicle
              </button>
            </div>

            <div className="fleet-inspection-preflight__panel">
              <div className="fleet-inspection-field">
                <label htmlFor="inspection-driver-name">Driver Name</label>
                <input
                  id="inspection-driver-name"
                  className="fleet-inspection-input fleet-inspection-input--large"
                  value={driverName}
                  onChange={(event) => {
                    setDriverName(event.target.value);
                    setDriverSuggestionsVisible(true);
                  }}
                  onFocus={() => setDriverSuggestionsVisible(true)}
                  onBlur={() => {
                    window.setTimeout(() => setDriverSuggestionsVisible(false), 120);
                  }}
                  placeholder="Start typing your name"
                  autoComplete="off"
                />
                {driverSuggestionsVisible && (driverSuggestionsLoading || driverSuggestions.length || driverSuggestionsError) ? (
                  <div className="fleet-inspection-suggestions" role="listbox" aria-label="Driver name suggestions">
                    {driverSuggestionsLoading ? (
                      <p className="fleet-inspection-suggestions__state">Searching employees...</p>
                    ) : null}
                    {!driverSuggestionsLoading && driverSuggestionsError ? (
                      <p className="fleet-inspection-suggestions__state">{driverSuggestionsError}</p>
                    ) : null}
                    {!driverSuggestionsLoading && !driverSuggestionsError && !driverSuggestions.length && driverName.trim().length >= 2 ? (
                      <p className="fleet-inspection-suggestions__state">No matching employee found yet.</p>
                    ) : null}
                    {!driverSuggestionsLoading && !driverSuggestionsError
                      ? driverSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="fleet-inspection-suggestion"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setDriverName(suggestion.label);
                              setDriverSuggestionsVisible(false);
                              setDriverSuggestions([]);
                              setDriverSuggestionsError('');
                            }}
                          >
                            <span>{suggestion.label}</span>
                            {suggestion.subtitle ? (
                              <small>{suggestion.subtitle}</small>
                            ) : null}
                          </button>
                        ))
                      : null}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="fleet-inspection-note-toggle"
                onClick={() => setNotesOpen((current) => !current)}
              >
                {notesOpen ? 'Hide optional note' : 'Add optional note'}
              </button>

              {notesOpen ? (
                <div className="fleet-inspection-field">
                  <label htmlFor="inspection-notes">Optional Note</label>
                  <textarea
                    id="inspection-notes"
                    className="fleet-inspection-textarea"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Any quick context for this inspection"
                  />
                </div>
              ) : null}

              <div className="fleet-inspection-preflight__summary">
                <div className="fleet-inspection-progress">
                  <div className="fleet-inspection-toolbar" style={{ justifyContent: 'space-between' }}>
                    <strong>{capturedCount} of 8 shots captured</strong>
                    <span className="fleet-inspection-muted">All exterior angles required</span>
                  </div>
                  <div className="fleet-inspection-progress__bar">
                    <span style={{ width: `${(capturedCount / 8) * 100}%` }} />
                  </div>
                </div>

                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--large"
                  onClick={handleStartInspection}
                  disabled={!driverName.trim()}
                >
                  Start inspection
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {vehicle && !result && inspectionStarted && currentShot ? (
          <section className="fleet-inspection-session">
            <InspectionCamera
              shot={currentShot}
              overlayUrl={currentShot.overlayPath}
              overlayScale={currentShot.overlayScale}
              currentPhoto={capturedShots[currentShot.id]}
              onCapture={(blob) => handleCaptureShot(currentShot.id, blob)}
              onRetake={() => handleRetakeShot(currentShot.id)}
              disabled={submitting}
              stepNumber={Math.min(currentIndex + 1, 8)}
              totalSteps={8}
            />

            <div className="fleet-inspection-session__overlay fleet-inspection-session__overlay--top">
              <button
                type="button"
                className="fleet-inspection-session__nav"
                onClick={() => setInspectionStarted(false)}
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M15 18l-6-6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div className="fleet-inspection-session__title">
                <strong>{currentShot.label}</strong>
                <span>{vehicle.licensePlate || vehicle.vehicleId}</span>
                <span>{Math.min(currentIndex + 1, 8)} / 8</span>
              </div>
            </div>

            <div className="fleet-inspection-session__overlay fleet-inspection-session__overlay--bottom">
              <div className="fleet-inspection-session__progress">
                <div className="fleet-inspection-progress__bar fleet-inspection-progress__bar--glass">
                  <span style={{ width: `${((currentIndex + (capturedShots[currentShot.id] ? 1 : 0)) / 8) * 100}%` }} />
                </div>
                <div className="fleet-inspection-dots" aria-hidden="true">
                  {shots.map((shot, index) => {
                    const state = capturedShots[shot.id]
                      ? 'done'
                      : index === currentIndex
                        ? 'current'
                        : 'todo';
                    return (
                      <span
                        key={shot.id}
                        className={`fleet-inspection-dot fleet-inspection-dot--${state}`}
                      />
                    );
                  })}
                </div>
              </div>

              {allCaptured ? (
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--large fleet-inspection-button--floating"
                  onClick={() => void handleSubmitInspection()}
                  disabled={submitting || !driverName.trim()}
                >
                  {submitting ? 'Submitting inspection...' : 'Submit inspection'}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
