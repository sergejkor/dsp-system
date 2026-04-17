import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useSearchParams } from 'react-router-dom';
import InspectionCamera from '../components/InspectionCamera.jsx';
import { getOverlaySet, REQUIRED_SHOT_IDS } from '../services/overlayRegistry.js';
import {
  resolveVehicleByVin,
  searchFleetInspectionOperators,
  submitPublicInspection,
} from '../services/internalInspectionApi.js';
import {
  browserPushSupported,
  getFleetPushSubscription,
  getPublicPushConfig,
  registerPublicPushDevice,
  unregisterPublicPushDevice,
  urlBase64ToUint8Array,
} from '../services/pushApi.js';
import './fleetInspections.css';

const RESULT_LABELS = {
  baseline_created: 'Baseline saved',
  no_new_damage: 'No visible new damage',
  possible_new_damage: 'Possible new damage detected',
};

const SHOT_ICON_ACCENTS = {
  front_left: ['front', 'left', 'frontLeft'],
  left_side: ['left'],
  rear_left: ['rear', 'left', 'rearLeft'],
  rear: ['rear'],
  rear_right: ['rear', 'right', 'rearRight'],
  right_side: ['right'],
  front_right: ['front', 'right', 'frontRight'],
  front: ['front'],
};

const FLEETCHECK_PUSH_EMPLOYEE_KEY = 'fleetcheck_push_employee';

function hasEmployeeIdentity(employee) {
  return Boolean(
    employee?.employeeRef
    || employee?.employeeId
    || employee?.kenjoUserId,
  );
}

function normalizeEmployeeSelection(employee) {
  if (!employee || typeof employee !== 'object') return null;
  const normalized = {
    id: String(employee.id || employee.employeeId || employee.employeeRef || employee.kenjoUserId || '').trim() || null,
    employeeRef: String(employee.employeeRef || '').trim() || null,
    employeeId: String(employee.employeeId || '').trim() || null,
    kenjoUserId: String(employee.kenjoUserId || '').trim() || null,
    label: String(employee.label || '').trim() || null,
    subtitle: String(employee.subtitle || '').trim() || null,
  };
  if (!hasEmployeeIdentity(normalized) && !normalized.label) return null;
  return normalized;
}

function readSavedPushEmployee() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FLEETCHECK_PUSH_EMPLOYEE_KEY) || 'null');
    return normalizeEmployeeSelection(parsed);
  } catch (_error) {
    return null;
  }
}

function persistPushEmployee(employee) {
  if (typeof window === 'undefined') return;
  try {
    if (!employee) {
      window.localStorage.removeItem(FLEETCHECK_PUSH_EMPLOYEE_KEY);
      return;
    }
    window.localStorage.setItem(
      FLEETCHECK_PUSH_EMPLOYEE_KEY,
      JSON.stringify({
        employeeRef: employee.employeeRef || null,
        employeeId: employee.employeeId || null,
        kenjoUserId: employee.kenjoUserId || null,
        label: employee.label || null,
        subtitle: employee.subtitle || null,
      }),
    );
  } catch (_error) {}
}

function inferPushPlatform() {
  if (typeof navigator === 'undefined') return 'web';
  const userAgent = String(navigator.userAgent || '').toLowerCase();
  if (userAgent.includes('android')) return 'android-web';
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'ios-web';
  return 'web';
}

async function requestFleetCameraStream() {
  const attempts = [
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
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
  throw lastError || new Error('Camera access failed.');
}

function prepareFleetVideoElement(video) {
  if (!video) return;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('muted', 'true');
  video.setAttribute('autoplay', 'true');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
}

function createScannerCanvasContext(canvas) {
  if (!canvas) return null;
  return (
    canvas.getContext('2d', { willReadFrequently: true }) ||
    canvas.getContext('2d')
  );
}

async function detectQrCodeFromVideoFrame(video, detector, canvas, context) {
  if (detector) {
    const barcodes = await detector.detect(video);
    return String(barcodes?.[0]?.rawValue || '');
  }

  if (!canvas || !context) return '';

  const sourceWidth = video.videoWidth || 0;
  const sourceHeight = video.videoHeight || 0;
  if (!sourceWidth || !sourceHeight) return '';

  const maxScanWidth = 960;
  const scale = sourceWidth > maxScanWidth ? maxScanWidth / sourceWidth : 1;
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  context.drawImage(video, 0, 0, targetWidth, targetHeight);
  const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
  const qrCode = jsQR(imageData.data, targetWidth, targetHeight, {
    inversionAttempts: 'attemptBoth',
  });
  return String(qrCode?.data || '');
}

function VehicleShotIcon({ shotId, large = false }) {
  const active = new Set(SHOT_ICON_ACCENTS[shotId] || []);
  const className = large
    ? 'fleet-inspection-shot-icon fleet-inspection-shot-icon--large'
    : 'fleet-inspection-shot-icon';

  function accent(key) {
    return active.has(key)
      ? 'var(--fleet-shot-accent, #2563eb)'
      : 'rgba(148, 163, 184, 0.18)';
  }

  return (
    <svg viewBox="0 0 180 92" aria-hidden="true" className={className}>
      <rect x="20" y="18" width="140" height="56" rx="22" fill="rgba(255,255,255,0.92)" stroke="rgba(100,116,139,0.32)" strokeWidth="4" />
      <rect x="44" y="10" width="92" height="22" rx="10" fill="rgba(255,255,255,0.92)" stroke="rgba(100,116,139,0.22)" strokeWidth="3" />
      <rect x="18" y="30" width="18" height="30" rx="8" fill={accent('rear')} />
      <rect x="144" y="30" width="18" height="30" rx="8" fill={accent('front')} />
      <rect x="58" y="14" width="64" height="14" rx="7" fill="rgba(191,219,254,0.9)" />
      <rect x="34" y="24" width="10" height="44" rx="5" fill={accent('left')} />
      <rect x="136" y="24" width="10" height="44" rx="5" fill={accent('right')} />
      <circle cx="48" cy="76" r="10" fill="rgba(15,23,42,0.82)" />
      <circle cx="132" cy="76" r="10" fill="rgba(15,23,42,0.82)" />
      <circle cx="48" cy="76" r="5" fill="rgba(255,255,255,0.84)" />
      <circle cx="132" cy="76" r="5" fill="rgba(255,255,255,0.84)" />
      <circle cx="44" cy="30" r="8" fill={accent('rearLeft')} />
      <circle cx="136" cy="30" r="8" fill={accent('frontRight')} />
      <circle cx="44" cy="60" r="8" fill={accent('frontLeft')} />
      <circle cx="136" cy="60" r="8" fill={accent('rearRight')} />
    </svg>
  );
}

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
  const savedPushEmployee = useMemo(() => readSavedPushEmployee(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [vinInput, setVinInput] = useState(() => normalizeVin(searchParams.get('vin')));
  const [vehicle, setVehicle] = useState(null);
  const [driverName, setDriverName] = useState(() => savedPushEmployee?.label || '');
  const [driverSelection, setDriverSelection] = useState(() => savedPushEmployee);
  const [driverConfirmed, setDriverConfirmed] = useState(() => Boolean(savedPushEmployee?.label));
  const [driverModalOpen, setDriverModalOpen] = useState(false);
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
  const [pushConfig, setPushConfig] = useState({ loading: true, enabled: false, publicKey: null });
  const [pushSupported] = useState(() => browserPushSupported());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState(() => {
    if (!browserPushSupported() || typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [pushStatus, setPushStatus] = useState('');
  const [pushError, setPushError] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushEmployeeQuery, setPushEmployeeQuery] = useState(() => savedPushEmployee?.label || '');
  const [pushEmployeeSelection, setPushEmployeeSelection] = useState(() => savedPushEmployee);
  const [pushSuggestions, setPushSuggestions] = useState([]);
  const [pushSuggestionsLoading, setPushSuggestionsLoading] = useState(false);
  const [pushSuggestionsError, setPushSuggestionsError] = useState('');
  const [pushSuggestionsVisible, setPushSuggestionsVisible] = useState(false);
  const scannerVideoRef = useRef(null);
  const driverInputRef = useRef(null);
  const pushInputRef = useRef(null);
  const autoResolvedRef = useRef(false);
  const initialSettingsPromptedRef = useRef(false);
  const capturedShotsRef = useRef({});
  const scannerCooldownUntilRef = useRef(0);
  const lastScannedVinRef = useRef('');
  const driverSuggestionRequestRef = useRef(0);
  const pushSuggestionRequestRef = useRef(0);

  const cameraSupported =
    typeof window !== 'undefined' &&
    Boolean(window.navigator?.mediaDevices?.getUserMedia);

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
  const hasConfiguredDriver = hasEmployeeIdentity(driverSelection) && Boolean(driverName.trim());
  const hasDraftDriver = hasEmployeeIdentity(pushEmployeeSelection);

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
      setDriverConfirmed(false);
      setDriverModalOpen(false);
    }
  }, [vehicle]);

  useEffect(() => {
    if (!driverModalOpen) return undefined;
    const timerId = window.setTimeout(() => {
      driverInputRef.current?.focus();
      driverInputRef.current?.select?.();
    }, 30);
    return () => window.clearTimeout(timerId);
  }, [driverModalOpen]);

  useEffect(() => {
    if (!pushModalOpen) return undefined;
    const timerId = window.setTimeout(() => {
      pushInputRef.current?.focus();
      pushInputRef.current?.select?.();
    }, 30);
    return () => window.clearTimeout(timerId);
  }, [pushModalOpen]);

  useEffect(() => {
    if (inspectionStarted || initialSettingsPromptedRef.current || hasConfiguredDriver) return;
    initialSettingsPromptedRef.current = true;
    openSettingsModal();
  }, [hasConfiguredDriver, inspectionStarted]);

  useEffect(() => {
    let cancelled = false;

    async function loadPushConfig() {
      if (!pushSupported) {
        setPushConfig({ loading: false, enabled: false, publicKey: null });
        return;
      }

      try {
        const [config, subscription] = await Promise.all([
          getPublicPushConfig(),
          getFleetPushSubscription().catch(() => null),
        ]);
        if (cancelled) return;
        setPushConfig({
          loading: false,
          enabled: Boolean(config?.enabled),
          publicKey: config?.publicKey || null,
        });
        setPushEnabled(Boolean(subscription));
      } catch (error) {
        if (cancelled) return;
        setPushConfig({ loading: false, enabled: false, publicKey: null });
        setPushError(String(error?.message || 'Failed to load app notification setup'));
      }
    }

    loadPushConfig();
    return () => {
      cancelled = true;
    };
  }, [pushSupported]);

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
    if (!driverModalOpen || !vehicle || query.length < 2) {
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
    const query = String(pushEmployeeQuery || '').trim();
    if (!pushModalOpen || query.length < 2) {
      setPushSuggestions([]);
      setPushSuggestionsLoading(false);
      setPushSuggestionsError('');
      return undefined;
    }

    const requestId = pushSuggestionRequestRef.current + 1;
    pushSuggestionRequestRef.current = requestId;
    setPushSuggestionsLoading(true);
    setPushSuggestionsError('');

    const timeoutId = window.setTimeout(async () => {
      try {
        const rows = await searchFleetInspectionOperators(query);
        if (pushSuggestionRequestRef.current !== requestId) return;
        setPushSuggestions(rows || []);
      } catch (lookupError) {
        if (pushSuggestionRequestRef.current !== requestId) return;
        setPushSuggestions([]);
        setPushSuggestionsError(String(lookupError?.message || 'Failed to load employee suggestions'));
      } finally {
        if (pushSuggestionRequestRef.current === requestId) {
          setPushSuggestionsLoading(false);
        }
      }
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [pushEmployeeQuery, pushModalOpen]);

  useEffect(() => {
    const queryVin = normalizeVin(searchParams.get('vin'));
    if (!queryVin || autoResolvedRef.current) return;
    autoResolvedRef.current = true;
    setVinInput(queryVin);
    void handleResolveVehicle(queryVin);
  }, [searchParams]);

  useEffect(() => {
    if (!scannerActive || !cameraSupported || vehicle) return undefined;

    let cancelled = false;
    let frameId = null;
    let mediaStream = null;
    const scanCanvas = document.createElement('canvas');
    const scanContext = createScannerCanvasContext(scanCanvas);
    const detector = barcodeSupported
      ? new window.BarcodeDetector({ formats: ['qr_code'] })
      : null;

    async function detectLoop() {
      if (cancelled || !scannerVideoRef.current) return;
      const video = scannerVideoRef.current;
      if (video.readyState >= 2) {
        try {
          const rawValue = await detectQrCodeFromVideoFrame(
            video,
            detector,
            scanCanvas,
            scanContext,
          );
          const nextVin = extractVinFromScan(rawValue);
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
            setScannerError('');
            setVinInput(nextVin);
            const resolved = await handleResolveVehicle(nextVin);
            if (resolved) {
              setScannerActive(false);
              return;
            }
            setScannerStatus('QR detected, but vehicle lookup failed. Try again or enter VIN manually.');
          }
        } catch (_error) {
          setScannerError('Unable to scan this QR code right now. Try again or enter the VIN manually.');
        }
      }
      frameId = window.requestAnimationFrame(detectLoop);
    }

    async function startScanner() {
      setScannerError('');
      setScannerStatus('Point the camera at the vehicle QR code.');
      try {
        mediaStream = await requestFleetCameraStream();

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (scannerVideoRef.current) {
          prepareFleetVideoElement(scannerVideoRef.current);
          scannerVideoRef.current.srcObject = mediaStream;
          await scannerVideoRef.current.play().catch(() => {});
        }
        frameId = window.requestAnimationFrame(detectLoop);
      } catch (error) {
        const message =
          error?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Please allow camera access in Safari settings.'
            : 'Camera access failed for QR scanning. Use manual VIN input instead.';
        setScannerError(message);
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      mediaStream?.getTracks().forEach((track) => track.stop());
    };
  }, [barcodeSupported, cameraSupported, scannerActive, vehicle]);

  function resetCapturedShots() {
    setCapturedShots((prev) => {
      Object.values(prev).forEach((shot) => {
        if (shot?.previewUrl) URL.revokeObjectURL(shot.previewUrl);
      });
      return {};
    });
  }

  function commitSelectedDriver(employee, { persist = true } = {}) {
    const normalized = normalizeEmployeeSelection(employee);
    const nextLabel = String(normalized?.label || '').trim();
    setDriverSelection(normalized);
    setDriverName(nextLabel);
    setDriverConfirmed(Boolean(nextLabel) && hasEmployeeIdentity(normalized));
    if (persist) {
      persistPushEmployee(normalized);
    }
    return normalized;
  }

  function closeSettingsModal({ preserveFeedback = false } = {}) {
    setPushEmployeeSelection(driverSelection || null);
    setPushEmployeeQuery(driverSelection?.label || '');
    setPushSuggestions([]);
    setPushSuggestionsError('');
    setPushSuggestionsVisible(false);
    if (!preserveFeedback) {
      setPushError('');
      setPushStatus('');
    }
    setPushModalOpen(false);
  }

  function openSettingsModal() {
    setPushEmployeeSelection(driverSelection || null);
    setPushEmployeeQuery(driverSelection?.label || '');
    setPushSuggestions([]);
    setPushSuggestionsError('');
    setPushSuggestionsVisible(false);
    setPushError('');
    setPushStatus('');
    setPushModalOpen(true);
  }

  function handleSaveDeviceProfile() {
    if (!hasEmployeeIdentity(pushEmployeeSelection)) {
      setPushError('Please select your name from the list before saving this device.');
      return;
    }
    commitSelectedDriver(pushEmployeeSelection, { persist: true });
    setPushError('');
    setPushStatus(
      pushEnabled
        ? 'Driver and app notification settings are saved on this device.'
        : 'Driver is saved on this device. You can enable app notifications later.',
    );
    closeSettingsModal({ preserveFeedback: true });
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
      if (!hasConfiguredDriver) {
        openSettingsModal();
      }
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

    setCapturedShots((prev) => {
      if (prev[shotId]?.previewUrl) {
        URL.revokeObjectURL(prev[shotId].previewUrl);
      }

      const next = {
        ...prev,
        [shotId]: { blob, previewUrl },
      };
      return next;
    });
  }

  function handleNextShot(shotId) {
    const shotIndex = REQUIRED_SHOT_IDS.indexOf(shotId);
    if (shotIndex === -1) return;
    setCurrentIndex((current) => {
      const nextMissingIndex = REQUIRED_SHOT_IDS.findIndex(
        (id, index) => index > shotIndex && !capturedShotsRef.current[id],
      );
      if (nextMissingIndex !== -1) return nextMissingIndex;
      return current;
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
      setError('Please choose your name in settings first.');
      openSettingsModal();
      return;
    }
    if (!driverConfirmed) {
      openSettingsModal();
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

  function handleConfirmDriverName() {
    if (!driverName.trim()) {
      setError('Driver name is required.');
      return;
    }
    setError('');
    setDriverConfirmed(true);
    setDriverModalOpen(false);
    setDriverSuggestionsVisible(false);
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
    setDriverModalOpen(false);
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

  async function handleEnablePushNotifications() {
    const selectedEmployee = normalizeEmployeeSelection(pushEmployeeSelection);
    if (!pushSupported) {
      setPushError('App notifications are not supported in this browser.');
      return;
    }
    if (!pushConfig.enabled || !pushConfig.publicKey) {
      setPushError('App notifications are not configured on the server yet.');
      return;
    }
    if (!hasEmployeeIdentity(selectedEmployee)) {
      setPushError('Please select your name from the list before enabling notifications.');
      return;
    }

    setPushBusy(true);
    setPushError('');
    setPushStatus('');

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        throw new Error(
          permission === 'denied'
            ? 'Notifications were blocked in your browser settings.'
            : 'Notification permission was not granted.',
        );
      }

      const registration = await navigator.serviceWorker.register('/fleetcheck-sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushConfig.publicKey),
        });
      }

      await registerPublicPushDevice({
        employeeRef: selectedEmployee.employeeRef,
        employeeId: selectedEmployee.employeeId,
        kenjoUserId: selectedEmployee.kenjoUserId,
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
        platform: inferPushPlatform(),
        appKind: 'fleetcheck-pwa',
        permissionState: permission,
      });

      commitSelectedDriver(selectedEmployee, { persist: true });
      setPushEnabled(true);
      setPushStatus('App notifications are enabled on this device.');
      closeSettingsModal({ preserveFeedback: true });
    } catch (error) {
      setPushError(String(error?.message || 'Failed to enable app notifications'));
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePushNotifications() {
    if (!pushSupported) {
      setPushEnabled(false);
      return;
    }

    setPushBusy(true);
    setPushError('');
    setPushStatus('');

    try {
      const subscription = await getFleetPushSubscription();
      if (subscription?.endpoint) {
        await unregisterPublicPushDevice({ endpoint: subscription.endpoint });
        await subscription.unsubscribe().catch(() => {});
      }
      setPushEnabled(false);
      setPushStatus('App notifications are turned off on this device.');
      closeSettingsModal({ preserveFeedback: true });
    } catch (error) {
      setPushError(String(error?.message || 'Failed to disable app notifications'));
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className={`fleet-inspection-page ${inspectionStarted ? 'fleet-inspection-page--camera' : ''}`}>
      <div className={`fleet-inspection-shell ${inspectionStarted ? 'fleet-inspection-shell--camera' : ''}`}>
        {!inspectionStarted ? (
          <section className="fleet-inspection-public-header fleet-inspection-public-header--top">
            <div>
              <h1>FleetCheck</h1>
              <p>Scan the QR code or enter the VIN manually, then start the inspection with the driver saved on this device.</p>
            </div>
            <button
              type="button"
              className="fleet-inspection-settings-trigger"
              onClick={openSettingsModal}
              aria-label="Open FleetCheck settings"
              title="FleetCheck settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3.75l1.06 2.16a1 1 0 0 0 .75.54l2.38.35-1.72 1.68a1 1 0 0 0-.29.88l.4 2.37-2.13-1.12a1 1 0 0 0-.94 0l-2.13 1.12.4-2.37a1 1 0 0 0-.29-.88L7.81 6.8l2.38-.35a1 1 0 0 0 .75-.54L12 3.75zm0 6a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM4.5 13.5l1.54.31a1 1 0 0 1 .74.55l.69 1.4 1.54.23-1.11 1.08a1 1 0 0 0-.29.89l.26 1.53-1.37-.72a1 1 0 0 0-.93 0l-1.37.72.26-1.53a1 1 0 0 0-.29-.89L2.29 16l1.54-.23a1 1 0 0 0 .74-.55l.69-1.4zm15 0l.69 1.4a1 1 0 0 0 .74.55l1.54.23-1.11 1.08a1 1 0 0 0-.29.89l.26 1.53-1.37-.72a1 1 0 0 0-.93 0l-1.37.72.26-1.53a1 1 0 0 0-.29-.89L14.79 16l1.54-.23a1 1 0 0 0 .74-.55l.69-1.4z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </section>
        ) : null}

        {!inspectionStarted && pushStatus ? (
          <section className="fleet-inspection-card">
            <div className="fleet-inspection-alert fleet-inspection-alert--success">{pushStatus}</div>
          </section>
        ) : null}

        {!inspectionStarted && pushError ? (
          <section className="fleet-inspection-card">
            <div className="fleet-inspection-alert fleet-inspection-alert--error">{pushError}</div>
          </section>
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
            <section className="fleet-inspection-card fleet-inspection-vin-card">
              <div className="fleet-inspection-field">
                <label htmlFor="inspection-vin">Scan or enter VIN</label>
                <input
                  id="inspection-vin"
                  className="fleet-inspection-input fleet-inspection-input--vin"
                  value={vinInput}
                  onChange={(event) => setVinInput(normalizeVin(event.target.value))}
                  placeholder="Scan or enter VIN"
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
              </div>

              <div className="fleet-inspection-vin-actions">
                {cameraSupported ? (
                  <button
                    type="button"
                    className="fleet-inspection-button fleet-inspection-button--scan"
                    onClick={() => setScannerActive((current) => !current)}
                  >
                    {scannerActive ? 'Stop QR scanner' : 'Scan QR'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--neutral"
                  onClick={() => void handleResolveVehicle()}
                  disabled={loadingVehicle}
                >
                  {loadingVehicle ? 'Loading vehicle...' : 'Load vehicle'}
                </button>
              </div>
            </section>

            {scannerActive ? (
              <section className="fleet-inspection-card">
                <div className="fleet-inspection-scan-stage">
                  <video ref={scannerVideoRef} muted playsInline autoPlay />
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
                <p className="fleet-inspection-label">Vehicle ready</p>
                <h2>{vehicle.licensePlate || vehicle.vehicleId}</h2>
                <p className="fleet-inspection-muted">
                  {overlaySet?.label || vehicle.vehicleType} - VIN {vehicle.vin}
                </p>
              </div>
              <div className="fleet-inspection-actions">
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--neutral"
                  onClick={openSettingsModal}
                >
                  {driverConfirmed ? 'Change driver' : 'Set driver'}
                </button>
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--neutral"
                  onClick={startAnotherVehicle}
                >
                  Change vehicle
                </button>
              </div>
            </div>

            <div className="fleet-inspection-driver-summary">
              <div>
                <span className="fleet-inspection-label">Driver name</span>
                <strong>{driverName || 'Waiting for driver selection'}</strong>
              </div>
            </div>

            <div className="fleet-inspection-preflight__summary">
              <button
                type="button"
                className="fleet-inspection-button fleet-inspection-button--large fleet-inspection-button--scan"
                onClick={handleStartInspection}
                disabled={!driverConfirmed}
              >
                Start inspection
              </button>
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
                <label htmlFor="inspection-notes">Optional note</label>
                <textarea
                  id="inspection-notes"
                  className="fleet-inspection-textarea"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Any quick context for this inspection"
                />
              </div>
            ) : null}

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
              onNext={() => handleNextShot(currentShot.id)}
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
                <VehicleShotIcon shotId={currentShot.id} large />
                <div className="fleet-inspection-session__title-copy">
                  <strong>{currentShot.label}</strong>
                  <span>{currentShot.captureTip}</span>
                  <span>{Math.min(currentIndex + 1, 8)} / 8 - {vehicle.licensePlate || vehicle.vehicleId}</span>
                </div>
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

        {driverModalOpen && vehicle && !inspectionStarted ? (
          <div className="fleet-inspection-modal-backdrop">
            <div className="fleet-inspection-modal" role="dialog" aria-modal="true" aria-labelledby="fleet-driver-modal-title">
              <div className="fleet-inspection-modal__header">
                <div>
                  <p className="fleet-inspection-label">Vehicle loaded</p>
                  <h3 id="fleet-driver-modal-title">{vehicle.licensePlate || vehicle.vehicleId}</h3>
                  <p className="fleet-inspection-muted">Please start typing your name.</p>
                </div>
              </div>

              <div className="fleet-inspection-field">
                <label htmlFor="inspection-driver-name">Driver name</label>
                <input
                  id="inspection-driver-name"
                  ref={driverInputRef}
                  className="fleet-inspection-input fleet-inspection-input--large"
                  value={driverName}
                  onChange={(event) => {
                    setDriverName(event.target.value);
                    setDriverSelection(null);
                    setDriverSuggestionsVisible(true);
                    setDriverConfirmed(false);
                  }}
                  onFocus={() => setDriverSuggestionsVisible(true)}
                  onBlur={() => {
                    window.setTimeout(() => setDriverSuggestionsVisible(false), 120);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleConfirmDriverName();
                    }
                  }}
                  placeholder="Please start typing your name"
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
                              setDriverSelection(suggestion);
                              setDriverConfirmed(false);
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

              <div className="fleet-inspection-modal__actions">
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--neutral"
                  onClick={startAnotherVehicle}
                >
                  Change vehicle
                </button>
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--scan"
                  onClick={handleConfirmDriverName}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pushModalOpen && !inspectionStarted ? (
          <div className="fleet-inspection-modal-backdrop">
            <div className="fleet-inspection-modal" role="dialog" aria-modal="true" aria-labelledby="fleet-push-modal-title">
              <div className="fleet-inspection-modal__header">
                <div>
                  <p className="fleet-inspection-label">FleetCheck settings</p>
                  <h3 id="fleet-push-modal-title">Driver and notifications</h3>
                  <p className="fleet-inspection-muted">
                    Select your name once on this phone. FleetCheck will reuse it for every inspection until you change the driver here.
                  </p>
                </div>
              </div>

              <div className="fleet-inspection-field">
                <label htmlFor="fleet-push-employee">Employee name</label>
                <input
                  id="fleet-push-employee"
                  ref={pushInputRef}
                  className="fleet-inspection-input fleet-inspection-input--large"
                  value={pushEmployeeQuery}
                  onChange={(event) => {
                    setPushEmployeeQuery(event.target.value);
                    setPushEmployeeSelection(null);
                    setPushSuggestionsVisible(true);
                  }}
                  onFocus={() => setPushSuggestionsVisible(true)}
                  onBlur={() => {
                    window.setTimeout(() => setPushSuggestionsVisible(false), 120);
                  }}
                  placeholder="Please start typing your name"
                  autoComplete="off"
                />
                {pushSuggestionsVisible && (pushSuggestionsLoading || pushSuggestions.length || pushSuggestionsError) ? (
                  <div className="fleet-inspection-suggestions" role="listbox" aria-label="Notification employee suggestions">
                    {pushSuggestionsLoading ? (
                      <p className="fleet-inspection-suggestions__state">Searching employees...</p>
                    ) : null}
                    {!pushSuggestionsLoading && pushSuggestionsError ? (
                      <p className="fleet-inspection-suggestions__state">{pushSuggestionsError}</p>
                    ) : null}
                    {!pushSuggestionsLoading && !pushSuggestionsError && !pushSuggestions.length && pushEmployeeQuery.trim().length >= 2 ? (
                      <p className="fleet-inspection-suggestions__state">No matching employee found yet.</p>
                    ) : null}
                    {!pushSuggestionsLoading && !pushSuggestionsError
                      ? pushSuggestions.map((suggestion) => (
                          <button
                            key={`push-${suggestion.id}`}
                            type="button"
                            className="fleet-inspection-suggestion"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setPushEmployeeQuery(suggestion.label);
                              setPushEmployeeSelection(suggestion);
                              setPushSuggestionsVisible(false);
                              setPushSuggestions([]);
                              setPushSuggestionsError('');
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

              {pushEmployeeSelection ? (
                <div className="fleet-inspection-driver-summary">
                  <div>
                    <span className="fleet-inspection-label">Selected driver</span>
                    <strong>{pushEmployeeSelection.label}</strong>
                    {pushEmployeeSelection.subtitle ? (
                      <small className="fleet-inspection-muted">{pushEmployeeSelection.subtitle}</small>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {pushConfig.loading ? (
                <p className="fleet-inspection-muted">Checking notification setup...</p>
              ) : null}
              {!pushSupported ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--warning">
                  App notifications are not supported in this browser.
                </div>
              ) : null}
              {pushSupported && !pushConfig.loading && !pushConfig.enabled ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--warning">
                  App notifications are not configured on the server yet. You can still save the driver on this device.
                </div>
              ) : null}
              {pushPermission === 'denied' ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--warning">
                  Browser notifications are blocked for this device. Allow notifications in the browser settings and try again.
                </div>
              ) : null}

              {pushError ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--error">{pushError}</div>
              ) : null}

              {pushStatus ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--success">{pushStatus}</div>
              ) : null}

              <div className="fleet-inspection-modal__actions">
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--neutral"
                  onClick={closeSettingsModal}
                  disabled={pushBusy}
                >
                  Cancel
                </button>
                {pushEnabled ? (
                  <button
                    type="button"
                    className="fleet-inspection-button fleet-inspection-button--neutral"
                    onClick={() => void handleDisablePushNotifications()}
                    disabled={pushBusy}
                  >
                    {pushBusy ? 'Turning off...' : 'Turn off on this device'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--scan"
                  onClick={() => void handleEnablePushNotifications()}
                  disabled={
                    pushBusy
                    || !hasDraftDriver
                    || !pushSupported
                    || pushConfig.loading
                    || !pushConfig.enabled
                  }
                >
                  {pushBusy ? 'Enabling...' : (pushEnabled ? 'Update device' : 'Enable notifications')}
                </button>
                <button
                  type="button"
                  className="fleet-inspection-button"
                  onClick={handleSaveDeviceProfile}
                  disabled={pushBusy || !hasDraftDriver}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
