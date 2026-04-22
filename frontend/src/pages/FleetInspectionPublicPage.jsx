import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useSearchParams } from 'react-router-dom';
import InspectionCamera from '../components/InspectionCamera.jsx';
import {
  PERSONAL_QUESTIONNAIRE_LOCALES,
  normalizePersonalQuestionnaireLocale,
} from '../components/personalQuestionnaireI18n.js';
import { getOverlaySet, REQUIRED_SHOT_IDS, SHOT_SEQUENCE } from '../services/overlayRegistry.js';
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

const FLEETCHECK_LANGUAGE_KEY = 'fleetcheck_language';
const FLEETCHECK_LANGUAGE_OPTIONS = PERSONAL_QUESTIONNAIRE_LOCALES.map((item) => ({
  locale: item.locale,
  label: item.nativeLabel || item.germanValue || item.locale,
}));

const RESULT_LABELS = {
  en: {
    baseline_created: 'Baseline saved',
    no_new_damage: 'No visible new damage',
    possible_new_damage: 'Possible new damage detected',
  },
  de: {
    baseline_created: 'Referenz gespeichert',
    no_new_damage: 'Keine neuen Schäden sichtbar',
    possible_new_damage: 'Mögliche neue Schäden erkannt',
  },
};

const SHOT_VAN_ICON_ASSETS = {
  front_left: '/fleetcheck-van-views/front_left.webp',
  left_side: '/fleetcheck-van-views/left_side.webp',
  rear_left: '/fleetcheck-van-views/rear_left.webp',
  rear: '/fleetcheck-van-views/rear.webp',
  rear_right: '/fleetcheck-van-views/rear_right.webp',
  right_side: '/fleetcheck-van-views/right_side.webp',
  front_right: '/fleetcheck-van-views/front_right.webp',
  front: '/fleetcheck-van-views/front.webp',
};

const FLEETCHECK_PUSH_EMPLOYEE_KEY = 'fleetcheck_push_employee';
const FLEETCHECK_INSPECTION_DRAFT_KEY = 'fleetcheck_inspection_draft';
const FLEETCHECK_OVERLAYS_ENABLED = false;

const FLEETCHECK_SHOT_COPY = {
  en: {
    front_left: { label: 'Front left', captureTip: 'Keep the headlight, bumper corner, and side panel inside the frame.' },
    left_side: { label: 'Left side', captureTip: 'Make sure both wheels and the roofline stay inside the frame.' },
    rear_left: { label: 'Rear left', captureTip: 'Center the rear corner and avoid cutting off the roof or bumper.' },
    rear: { label: 'Rear', captureTip: 'Keep both tail lamps and the rear bumper inside the frame.' },
    rear_right: { label: 'Rear right', captureTip: 'Match the rear wheel arch and tail light inside the frame.' },
    right_side: { label: 'Right side', captureTip: 'Step back until the entire profile is visible.' },
    front_right: { label: 'Front right', captureTip: 'Keep the front wheel and grille edge clearly visible.' },
    front: { label: 'Front', captureTip: 'Keep both headlights and the full bumper visible.' },
  },
  de: {
    front_left: { label: 'Vorne links', captureTip: 'Scheinwerfer, Stoßfängerecke und Seitenteil vollständig im Bild halten.' },
    left_side: { label: 'Linke Seite', captureTip: 'Beide Räder und die Dachlinie vollständig im Bild halten.' },
    rear_left: { label: 'Hinten links', captureTip: 'Die hintere Ecke zentrieren und Dach oder Stoßfänger nicht abschneiden.' },
    rear: { label: 'Hinten', captureTip: 'Beide Rückleuchten und den kompletten Stoßfänger im Bild halten.' },
    rear_right: { label: 'Hinten rechts', captureTip: 'Radlauf und Rücklicht vollständig im Bild halten.' },
    right_side: { label: 'Rechte Seite', captureTip: 'So weit zurückgehen, bis das gesamte Seitenprofil sichtbar ist.' },
    front_right: { label: 'Vorne rechts', captureTip: 'Vorderrad und Grillkante deutlich sichtbar halten.' },
    front: { label: 'Vorne', captureTip: 'Beide Scheinwerfer und den kompletten Stoßfänger im Bild halten.' },
  },
};

const FLEETCHECK_COPY = {
  en: {
    pageSubtitle: 'Scan the QR code or enter the VIN manually, then start the inspection with the driver saved on this device.',
    openSettings: 'Open FleetCheck settings',
    enterValidVin: 'Enter a valid VIN first.',
    chooseNameFirst: 'Please choose your name in settings first.',
    driverNameRequired: 'Driver name is required.',
    captureAllShots: 'Capture all 8 required shots before submitting.',
    failedSubmit: 'Failed to submit inspection',
    failedResolveVehicle: 'Failed to resolve vehicle',
    qrDetectedLoading: 'QR detected. Loading vehicle...',
    qrDetectedFailed: 'QR detected, but vehicle lookup failed. Try again or enter the VIN manually.',
    qrScanFailed: 'Unable to scan this QR code right now. Try again or enter the VIN manually.',
    vehicleLoadedStatus: 'Vehicle loaded.',
    inspectionResult: 'Inspection result',
    inspectionSubmitted: 'Inspection submitted',
    vehicleLabel: 'Vehicle',
    newDamages: 'New damages',
    inspectionNumber: 'Inspection',
    scanAnotherVehicle: 'Scan another vehicle',
    inspectSameVehicleAgain: 'Inspect same vehicle again',
    vinLabel: 'Scan or enter VIN',
    vinPlaceholder: 'Scan or enter VIN',
    stopScanner: 'Stop QR scanner',
    scanQr: 'Scan QR',
    loadingVehicle: 'Loading vehicle...',
    loadVehicle: 'Load vehicle',
    vehicleReady: 'Vehicle ready',
    enterVinManually: 'Enter VIN manually',
    vehicleScanHelp: 'Vehicle scan options',
    changeDriver: 'Change driver',
    setDriver: 'Set driver',
    changeVehicle: 'Change vehicle',
    driverNameLabel: 'Driver name',
    waitingDriver: 'Waiting for driver selection',
    startInspection: 'Start inspection',
    hideOptionalNote: 'Hide optional note',
    addOptionalNote: 'Add optional note',
    optionalNote: 'Optional note',
    optionalNotePlaceholder: 'Any quick context for this inspection',
    back: 'Back',
    submitInspection: 'Submit inspection',
    submittingInspection: 'Submitting inspection...',
    vehicleLoaded: 'Vehicle loaded',
    typeYourName: 'Please start typing your name.',
    typeYourNamePlaceholder: 'Please start typing your name',
    searchingEmployees: 'Searching employees...',
    noEmployeeFound: 'No matching employee found yet.',
    ok: 'OK',
    settingsLabel: 'FleetCheck settings',
    settingsTitle: 'Driver, language and notifications',
    settingsBody: 'Select your name once on this phone. FleetCheck will reuse it for every inspection until you change the driver here.',
    employeeName: 'Employee name',
    notificationEmployeeSuggestions: 'Notification employee suggestions',
    selectedDriver: 'Selected driver',
    checkingNotifications: 'Checking notification setup...',
    notificationsUnsupported: 'App notifications are not supported in this browser.',
    notificationsNotConfigured: 'App notifications are not configured on the server yet. You can still save the driver on this device.',
    notificationsBlocked: 'Browser notifications are blocked for this device. Allow notifications in the browser settings and try again.',
    cancel: 'Cancel',
    turningOff: 'Turning off...',
    turnOffOnThisDevice: 'Turn off on this device',
    enabling: 'Enabling...',
    updateDevice: 'Update device',
    enableNotifications: 'Enable notifications',
    done: 'Done',
    saveDeviceFirst: 'Please select your name from the list before saving this device.',
    notificationsNotEnabledYet: 'App notifications are not enabled on this device yet.',
    saveProfileFailed: 'Failed to save this device profile',
    savedDriverAndNotifications: 'Driver and app notification settings are saved on this device.',
    savedDriverOnly: 'Driver is saved on this device. You can enable app notifications later.',
    notificationsEnabledOnDevice: 'App notifications are enabled on this device.',
    notificationsDisabledOnDevice: 'App notifications are turned off on this device.',
    notificationsUnsupportedBrowser: 'App notifications are not supported in this browser.',
    notificationsNotConfiguredServer: 'App notifications are not configured on the server yet.',
    selectNameBeforeEnable: 'Please select your name from the list before enabling notifications.',
    notificationsBlockedError: 'Notifications were blocked in your browser settings.',
    notificationsPermissionMissing: 'Notification permission was not granted.',
    enableNotificationsFailed: 'Failed to enable app notifications',
    disableNotificationsFailed: 'Failed to disable app notifications',
    loadingTitle: 'Loading',
    loadingBody: 'Please wait while the report is being submitted.',
    languageLabel: 'Language',
    next: 'Next',
    retake: 'Retake',
    captureShot: 'Capture shot',
    rotatePhoneToContinue: 'Rotate phone to continue',
    rotatePhoneHorizontally: 'Rotate phone horizontally',
    holdLandscape: 'Hold your phone in landscape mode before taking this shot.',
    preparingCamera: 'Preparing camera...',
    cameraUnavailable: 'Camera access is unavailable in this browser.',
    cameraBlocked: 'Camera access was blocked. Please allow camera access and try again.',
    scannerPrompt: 'Point the camera at the vehicle QR code.',
  },
  de: {
    pageSubtitle: 'QR-Code scannen oder FIN manuell eingeben und die Inspektion mit dem auf diesem Gerät gespeicherten Fahrer starten.',
    openSettings: 'FleetCheck-Einstellungen öffnen',
    enterValidVin: 'Bitte zuerst eine gültige FIN eingeben.',
    chooseNameFirst: 'Bitte zuerst deinen Namen in den Einstellungen auswählen.',
    driverNameRequired: 'Der Fahrername ist erforderlich.',
    captureAllShots: 'Bitte alle 8 Pflichtfotos aufnehmen, bevor du den Bericht sendest.',
    failedSubmit: 'Inspektionsbericht konnte nicht gesendet werden',
    failedResolveVehicle: 'Fahrzeug konnte nicht geladen werden',
    qrDetectedLoading: 'QR-Code erkannt. Fahrzeug wird geladen...',
    qrDetectedFailed: 'QR-Code erkannt, aber das Fahrzeug konnte nicht geladen werden. Bitte erneut versuchen oder die FIN manuell eingeben.',
    qrScanFailed: 'Dieser QR-Code konnte gerade nicht gelesen werden. Bitte erneut versuchen oder die FIN manuell eingeben.',
    vehicleLoadedStatus: 'Fahrzeug geladen.',
    inspectionResult: 'Inspektionsergebnis',
    inspectionSubmitted: 'Inspektion gesendet',
    vehicleLabel: 'Fahrzeug',
    newDamages: 'Neue Schäden',
    inspectionNumber: 'Inspektion',
    scanAnotherVehicle: 'Weiteres Fahrzeug scannen',
    inspectSameVehicleAgain: 'Dasselbe Fahrzeug erneut prüfen',
    vinLabel: 'FIN scannen oder eingeben',
    vinPlaceholder: 'FIN scannen oder eingeben',
    stopScanner: 'QR-Scanner stoppen',
    scanQr: 'QR scannen',
    loadingVehicle: 'Fahrzeug wird geladen...',
    loadVehicle: 'Fahrzeug laden',
    vehicleReady: 'Fahrzeug bereit',
    enterVinManually: 'VIN manuell eingeben',
    vehicleScanHelp: 'Fahrzeug-Scanoptionen',
    changeDriver: 'Fahrer ändern',
    setDriver: 'Fahrer festlegen',
    changeVehicle: 'Fahrzeug ändern',
    driverNameLabel: 'Fahrername',
    waitingDriver: 'Warten auf Fahrerauswahl',
    startInspection: 'Inspektion starten',
    hideOptionalNote: 'Optionale Notiz ausblenden',
    addOptionalNote: 'Optionale Notiz hinzufügen',
    optionalNote: 'Optionale Notiz',
    optionalNotePlaceholder: 'Kurzer Hinweis zu dieser Inspektion',
    back: 'Zurück',
    submitInspection: 'Inspektion senden',
    submittingInspection: 'Inspektion wird gesendet...',
    vehicleLoaded: 'Fahrzeug geladen',
    typeYourName: 'Bitte beginne, deinen Namen einzugeben.',
    typeYourNamePlaceholder: 'Bitte beginne, deinen Namen einzugeben',
    searchingEmployees: 'Mitarbeiter werden gesucht...',
    noEmployeeFound: 'Noch kein passender Mitarbeiter gefunden.',
    ok: 'OK',
    settingsLabel: 'FleetCheck-Einstellungen',
    settingsTitle: 'Fahrer, Sprache und Benachrichtigungen',
    settingsBody: 'Wähle deinen Namen einmal auf diesem Telefon aus. FleetCheck verwendet ihn für jede weitere Inspektion, bis du den Fahrer hier änderst.',
    employeeName: 'Mitarbeitername',
    notificationEmployeeSuggestions: 'Vorschläge für Mitarbeiter',
    selectedDriver: 'Ausgewählter Fahrer',
    checkingNotifications: 'Benachrichtigungseinstellungen werden geprüft...',
    notificationsUnsupported: 'App-Benachrichtigungen werden in diesem Browser nicht unterstützt.',
    notificationsNotConfigured: 'App-Benachrichtigungen sind auf dem Server noch nicht eingerichtet. Du kannst den Fahrer trotzdem auf diesem Gerät speichern.',
    notificationsBlocked: 'Browser-Benachrichtigungen sind auf diesem Gerät blockiert. Bitte in den Browser-Einstellungen freigeben und erneut versuchen.',
    cancel: 'Abbrechen',
    turningOff: 'Wird ausgeschaltet...',
    turnOffOnThisDevice: 'Auf diesem Gerät ausschalten',
    enabling: 'Wird aktiviert...',
    updateDevice: 'Gerät aktualisieren',
    enableNotifications: 'Benachrichtigungen aktivieren',
    done: 'Fertig',
    saveDeviceFirst: 'Bitte zuerst deinen Namen aus der Liste auswählen, bevor dieses Gerät gespeichert wird.',
    notificationsNotEnabledYet: 'App-Benachrichtigungen sind auf diesem Gerät noch nicht aktiviert.',
    saveProfileFailed: 'Dieses Geräteprofil konnte nicht gespeichert werden',
    savedDriverAndNotifications: 'Fahrer und App-Benachrichtigungseinstellungen wurden auf diesem Gerät gespeichert.',
    savedDriverOnly: 'Der Fahrer wurde auf diesem Gerät gespeichert. App-Benachrichtigungen können später aktiviert werden.',
    notificationsEnabledOnDevice: 'App-Benachrichtigungen sind auf diesem Gerät aktiviert.',
    notificationsDisabledOnDevice: 'App-Benachrichtigungen sind auf diesem Gerät ausgeschaltet.',
    notificationsUnsupportedBrowser: 'App-Benachrichtigungen werden in diesem Browser nicht unterstützt.',
    notificationsNotConfiguredServer: 'App-Benachrichtigungen sind auf dem Server noch nicht eingerichtet.',
    selectNameBeforeEnable: 'Bitte zuerst deinen Namen aus der Liste auswählen, bevor Benachrichtigungen aktiviert werden.',
    notificationsBlockedError: 'Benachrichtigungen wurden in den Browser-Einstellungen blockiert.',
    notificationsPermissionMissing: 'Die Berechtigung für Benachrichtigungen wurde nicht erteilt.',
    enableNotificationsFailed: 'App-Benachrichtigungen konnten nicht aktiviert werden',
    disableNotificationsFailed: 'App-Benachrichtigungen konnten nicht deaktiviert werden',
    loadingTitle: 'Wird geladen',
    loadingBody: 'Bitte warten, der Bericht wird gesendet.',
    languageLabel: 'Sprache',
    next: 'Weiter',
    retake: 'Erneut aufnehmen',
    captureShot: 'Foto aufnehmen',
    rotatePhoneToContinue: 'Telefon drehen, um fortzufahren',
    rotatePhoneHorizontally: 'Telefon waagerecht halten',
    holdLandscape: 'Halte dein Telefon im Querformat, bevor du dieses Foto aufnimmst.',
    preparingCamera: 'Kamera wird vorbereitet...',
    cameraUnavailable: 'Kamerazugriff ist in diesem Browser nicht verfügbar.',
    cameraBlocked: 'Der Kamerazugriff wurde blockiert. Bitte freigeben und erneut versuchen.',
    scannerPrompt: 'Kamera auf den QR-Code des Fahrzeugs richten.',
  },
};

Object.assign(RESULT_LABELS, {
  ru: {
    baseline_created: 'Базовый отчёт сохранён',
    no_new_damage: 'Новых видимых повреждений нет',
    possible_new_damage: 'Обнаружены возможные новые повреждения',
  },
  fr: {
    baseline_created: 'Référence enregistrée',
    no_new_damage: 'Aucun nouveau dommage visible',
    possible_new_damage: 'Nouveaux dommages possibles détectés',
  },
  it: {
    baseline_created: 'Riferimento salvato',
    no_new_damage: 'Nessun nuovo danno visibile',
    possible_new_damage: 'Possibili nuovi danni rilevati',
  },
  es: {
    baseline_created: 'Referencia guardada',
    no_new_damage: 'No hay daños nuevos visibles',
    possible_new_damage: 'Se detectaron posibles daños nuevos',
  },
  pl: {
    baseline_created: 'Raport bazowy zapisany',
    no_new_damage: 'Brak widocznych nowych uszkodzeń',
    possible_new_damage: 'Wykryto możliwe nowe uszkodzenia',
  },
  uk: {
    baseline_created: 'Базовий звіт збережено',
    no_new_damage: 'Нових видимих пошкоджень немає',
    possible_new_damage: 'Виявлено можливі нові пошкодження',
  },
  nl: {
    baseline_created: 'Referentie opgeslagen',
    no_new_damage: 'Geen nieuwe zichtbare schade',
    possible_new_damage: 'Mogelijke nieuwe schade gedetecteerd',
  },
  ro: {
    baseline_created: 'Referința a fost salvată',
    no_new_damage: 'Nu există daune noi vizibile',
    possible_new_damage: 'Au fost detectate posibile daune noi',
  },
  hu: {
    baseline_created: 'Alapjelentés mentve',
    no_new_damage: 'Nincs látható új sérülés',
    possible_new_damage: 'Lehetséges új sérülés észlelve',
  },
  ar: {
    baseline_created: 'تم حفظ التقرير المرجعي',
    no_new_damage: 'لا توجد أضرار جديدة ظاهرة',
    possible_new_damage: 'تم اكتشاف أضرار جديدة محتملة',
  },
});

Object.assign(FLEETCHECK_SHOT_COPY, {
  ru: {
    front_left: { label: 'Спереди слева', captureTip: 'Держите фару, угол бампера и боковую панель полностью в кадре.' },
    left_side: { label: 'Левый бок', captureTip: 'Убедитесь, что оба колеса и линия крыши полностью в кадре.' },
    rear_left: { label: 'Сзади слева', captureTip: 'Центрируйте задний угол и не обрезайте крышу или бампер.' },
    rear: { label: 'Сзади', captureTip: 'Держите обе задние фары и весь бампер полностью в кадре.' },
    rear_right: { label: 'Сзади справа', captureTip: 'Держите арку колеса и задний фонарь полностью в кадре.' },
    right_side: { label: 'Правый бок', captureTip: 'Отойдите назад, пока весь боковой профиль не станет виден.' },
    front_right: { label: 'Спереди справа', captureTip: 'Держите переднее колесо и край решётки отчётливо видимыми.' },
    front: { label: 'Спереди', captureTip: 'Держите обе фары и весь передний бампер полностью в кадре.' },
  },
  fr: {
    front_left: { label: 'Avant gauche', captureTip: 'Gardez le phare, l’angle du pare-chocs et le panneau latéral bien visibles.' },
    left_side: { label: 'Côté gauche', captureTip: 'Assurez-vous que les deux roues et la ligne de toit restent entièrement visibles.' },
    rear_left: { label: 'Arrière gauche', captureTip: 'Centrez le coin arrière sans couper le toit ni le pare-chocs.' },
    rear: { label: 'Arrière', captureTip: 'Gardez les deux feux arrière et tout le pare-chocs dans le cadre.' },
    rear_right: { label: 'Arrière droit', captureTip: 'Gardez le passage de roue et le feu arrière bien visibles.' },
    right_side: { label: 'Côté droit', captureTip: 'Reculez jusqu’à voir tout le profil latéral.' },
    front_right: { label: 'Avant droit', captureTip: 'Gardez la roue avant et le bord de la calandre bien visibles.' },
    front: { label: 'Avant', captureTip: 'Gardez les deux phares et tout le pare-chocs avant dans le cadre.' },
  },
  it: {
    front_left: { label: 'Anteriore sinistro', captureTip: 'Mantieni faro, angolo del paraurti e pannello laterale completamente visibili.' },
    left_side: { label: 'Lato sinistro', captureTip: 'Assicurati che entrambe le ruote e la linea del tetto siano completamente visibili.' },
    rear_left: { label: 'Posteriore sinistro', captureTip: 'Centra l’angolo posteriore senza tagliare tetto o paraurti.' },
    rear: { label: 'Posteriore', captureTip: 'Mantieni entrambi i fanali posteriori e tutto il paraurti nel fotogramma.' },
    rear_right: { label: 'Posteriore destro', captureTip: 'Mantieni passaruota e fanale posteriore completamente visibili.' },
    right_side: { label: 'Lato destro', captureTip: 'Fai un passo indietro finché l’intero profilo laterale non è visibile.' },
    front_right: { label: 'Anteriore destro', captureTip: 'Mantieni ben visibili la ruota anteriore e il bordo della griglia.' },
    front: { label: 'Anteriore', captureTip: 'Mantieni entrambi i fari e tutto il paraurti anteriore nel fotogramma.' },
  },
  es: {
    front_left: { label: 'Delantera izquierda', captureTip: 'Mantén el faro, la esquina del parachoques y el panel lateral completamente visibles.' },
    left_side: { label: 'Lado izquierdo', captureTip: 'Asegúrate de que ambas ruedas y la línea del techo se vean completas.' },
    rear_left: { label: 'Trasera izquierda', captureTip: 'Centra la esquina trasera sin cortar el techo ni el parachoques.' },
    rear: { label: 'Trasera', captureTip: 'Mantén ambas luces traseras y todo el parachoques dentro del encuadre.' },
    rear_right: { label: 'Trasera derecha', captureTip: 'Mantén el paso de rueda y la luz trasera completamente visibles.' },
    right_side: { label: 'Lado derecho', captureTip: 'Da un paso atrás hasta que se vea todo el perfil lateral.' },
    front_right: { label: 'Delantera derecha', captureTip: 'Mantén visibles la rueda delantera y el borde de la parrilla.' },
    front: { label: 'Delantera', captureTip: 'Mantén ambos faros y todo el parachoques delantero dentro del encuadre.' },
  },
  pl: {
    front_left: { label: 'Przód lewy', captureTip: 'Utrzymaj reflektor, narożnik zderzaka i panel boczny w całości w kadrze.' },
    left_side: { label: 'Lewy bok', captureTip: 'Upewnij się, że oba koła i linia dachu są w całości widoczne.' },
    rear_left: { label: 'Tył lewy', captureTip: 'Wyśrodkuj tylny narożnik i nie ucinaj dachu ani zderzaka.' },
    rear: { label: 'Tył', captureTip: 'Utrzymaj oba tylne światła i cały zderzak w kadrze.' },
    rear_right: { label: 'Tył prawy', captureTip: 'Utrzymaj nadkole i tylne światło w całości w kadrze.' },
    right_side: { label: 'Prawy bok', captureTip: 'Cofnij się, aż cały profil boczny będzie widoczny.' },
    front_right: { label: 'Przód prawy', captureTip: 'Utrzymaj przednie koło i krawędź grilla wyraźnie widoczne.' },
    front: { label: 'Przód', captureTip: 'Utrzymaj oba reflektory i cały przedni zderzak w kadrze.' },
  },
  uk: {
    front_left: { label: 'Передній лівий кут', captureTip: 'Тримайте фару, кут бампера та бокову панель повністю в кадрі.' },
    left_side: { label: 'Лівий бік', captureTip: 'Переконайтеся, що обидва колеса та лінія даху повністю в кадрі.' },
    rear_left: { label: 'Задній лівий кут', captureTip: 'Відцентруйте задній кут і не обрізайте дах або бампер.' },
    rear: { label: 'Ззаду', captureTip: 'Тримайте обидва задні ліхтарі та весь бампер повністю в кадрі.' },
    rear_right: { label: 'Задній правий кут', captureTip: 'Тримайте арку колеса та задній ліхтар повністю в кадрі.' },
    right_side: { label: 'Правий бік', captureTip: 'Відійдіть назад, доки весь бічний профіль не стане видимим.' },
    front_right: { label: 'Передній правий кут', captureTip: 'Тримайте переднє колесо та край решітки чітко видимими.' },
    front: { label: 'Спереду', captureTip: 'Тримайте обидві фари та весь передній бампер повністю в кадрі.' },
  },
  nl: {
    front_left: { label: 'Voor links', captureTip: 'Houd de koplamp, bumperhoek en zijpaneel volledig in beeld.' },
    left_side: { label: 'Linkerzijde', captureTip: 'Zorg dat beide wielen en de daklijn volledig zichtbaar zijn.' },
    rear_left: { label: 'Achter links', captureTip: 'Centreer de achterhoek en snijd het dak of de bumper niet af.' },
    rear: { label: 'Achterkant', captureTip: 'Houd beide achterlichten en de volledige bumper in beeld.' },
    rear_right: { label: 'Achter rechts', captureTip: 'Houd de wielkast en het achterlicht volledig in beeld.' },
    right_side: { label: 'Rechterzijde', captureTip: 'Doe een stap terug totdat het volledige zijprofiel zichtbaar is.' },
    front_right: { label: 'Voor rechts', captureTip: 'Houd het voorwiel en de rand van de grille goed zichtbaar.' },
    front: { label: 'Voorkant', captureTip: 'Houd beide koplampen en de volledige voorbumper in beeld.' },
  },
  ro: {
    front_left: { label: 'Față stânga', captureTip: 'Păstrează farul, colțul barei și panoul lateral complet în cadru.' },
    left_side: { label: 'Lateral stânga', captureTip: 'Asigură-te că ambele roți și linia plafonului sunt complet vizibile.' },
    rear_left: { label: 'Spate stânga', captureTip: 'Centrează colțul din spate fără să tai plafonul sau bara.' },
    rear: { label: 'Spate', captureTip: 'Păstrează ambele stopuri și toată bara în cadru.' },
    rear_right: { label: 'Spate dreapta', captureTip: 'Păstrează pasajul roții și stopul complet vizibile.' },
    right_side: { label: 'Lateral dreapta', captureTip: 'Fă un pas înapoi până când întregul profil lateral este vizibil.' },
    front_right: { label: 'Față dreapta', captureTip: 'Păstrează roata din față și marginea grilei clar vizibile.' },
    front: { label: 'Față', captureTip: 'Păstrează ambele faruri și toată bara din față în cadru.' },
  },
  hu: {
    front_left: { label: 'Bal első', captureTip: 'A fényszóró, a lökhárító sarka és az oldalsó panel legyen teljesen a képen.' },
    left_side: { label: 'Bal oldal', captureTip: 'Győződj meg róla, hogy mindkét kerék és a tetővonal teljesen látható.' },
    rear_left: { label: 'Bal hátsó', captureTip: 'Középre igazítsd a hátsó sarkot, és ne vágd le a tetőt vagy a lökhárítót.' },
    rear: { label: 'Hátul', captureTip: 'Mindkét hátsó lámpa és a teljes lökhárító legyen a képen.' },
    rear_right: { label: 'Jobb hátsó', captureTip: 'A kerékív és a hátsó lámpa legyen teljesen látható.' },
    right_side: { label: 'Jobb oldal', captureTip: 'Lépj hátra addig, amíg a teljes oldalsó profil látható nem lesz.' },
    front_right: { label: 'Jobb első', captureTip: 'Az első kerék és a hűtőrács széle legyen jól látható.' },
    front: { label: 'Elöl', captureTip: 'Mindkét fényszóró és a teljes első lökhárító legyen a képen.' },
  },
  ar: {
    front_left: { label: 'أمامي يسار', captureTip: 'أبقِ المصباح الأمامي وزاوية الصدام والجزء الجانبي بالكامل داخل الصورة.' },
    left_side: { label: 'الجانب الأيسر', captureTip: 'تأكد من ظهور العجلتين وخط السقف بالكامل داخل الصورة.' },
    rear_left: { label: 'خلفي يسار', captureTip: 'وسّط الزاوية الخلفية ولا تقص السقف أو الصدام.' },
    rear: { label: 'الخلف', captureTip: 'أبقِ المصباحين الخلفيين والصدام الخلفي بالكامل داخل الصورة.' },
    rear_right: { label: 'خلفي يمين', captureTip: 'أبقِ قوس العجلة والمصباح الخلفي واضحين بالكامل.' },
    right_side: { label: 'الجانب الأيمن', captureTip: 'تراجع حتى يظهر جانب المركبة بالكامل.' },
    front_right: { label: 'أمامي يمين', captureTip: 'أبقِ العجلة الأمامية وحافة الشبك الأمامي واضحتين.' },
    front: { label: 'الأمام', captureTip: 'أبقِ المصباحين الأماميين والصدام الأمامي بالكامل داخل الصورة.' },
  },
});

Object.assign(FLEETCHECK_COPY, {
  ru: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Отсканируйте QR-код или введите VIN вручную, затем начните осмотр с водителем, сохранённым на этом устройстве.',
    openSettings: 'Открыть настройки FleetCheck',
    enterValidVin: 'Сначала введите корректный VIN.',
    chooseNameFirst: 'Сначала выберите своё имя в настройках.',
    driverNameRequired: 'Имя водителя обязательно.',
    captureAllShots: 'Перед отправкой нужно сделать все 8 обязательных фото.',
    failedSubmit: 'Не удалось отправить отчёт',
    failedResolveVehicle: 'Не удалось загрузить автомобиль',
    qrDetectedLoading: 'QR-код найден. Загружаем автомобиль...',
    qrDetectedFailed: 'QR-код найден, но автомобиль не удалось загрузить. Попробуйте ещё раз или введите VIN вручную.',
    qrScanFailed: 'Сейчас не удалось считать этот QR-код. Попробуйте ещё раз или введите VIN вручную.',
    vehicleLoadedStatus: 'Автомобиль загружен.',
    inspectionResult: 'Результат осмотра',
    inspectionSubmitted: 'Осмотр отправлен',
    vehicleLabel: 'Автомобиль',
    newDamages: 'Новые повреждения',
    inspectionNumber: 'Осмотр',
    scanAnotherVehicle: 'Сканировать другой автомобиль',
    inspectSameVehicleAgain: 'Проверить этот же автомобиль снова',
    vinLabel: 'Сканируйте или введите VIN',
    vinPlaceholder: 'Сканируйте или введите VIN',
    stopScanner: 'Остановить QR-сканер',
    scanQr: 'Сканировать QR',
    loadingVehicle: 'Загрузка автомобиля...',
    loadVehicle: 'Загрузить автомобиль',
    vehicleReady: 'Автомобиль готов',
    changeDriver: 'Сменить водителя',
    setDriver: 'Выбрать водителя',
    changeVehicle: 'Сменить автомобиль',
    driverNameLabel: 'Имя водителя',
    waitingDriver: 'Ожидание выбора водителя',
    startInspection: 'Начать осмотр',
    hideOptionalNote: 'Скрыть заметку',
    addOptionalNote: 'Добавить заметку',
    optionalNote: 'Дополнительная заметка',
    optionalNotePlaceholder: 'Короткий комментарий к этому осмотру',
    back: 'Назад',
    submitInspection: 'Отправить осмотр',
    submittingInspection: 'Отправка осмотра...',
    vehicleLoaded: 'Автомобиль загружен',
    typeYourName: 'Начните вводить своё имя.',
    typeYourNamePlaceholder: 'Начните вводить своё имя',
    searchingEmployees: 'Ищем сотрудников...',
    noEmployeeFound: 'Подходящий сотрудник пока не найден.',
    settingsLabel: 'Настройки FleetCheck',
    settingsTitle: 'Водитель, язык и уведомления',
    settingsBody: 'Один раз выберите своё имя на этом телефоне. FleetCheck будет использовать его для всех следующих осмотров, пока вы не смените водителя здесь.',
    employeeName: 'Имя сотрудника',
    notificationEmployeeSuggestions: 'Подсказки по сотрудникам',
    selectedDriver: 'Выбранный водитель',
    checkingNotifications: 'Проверяем настройки уведомлений...',
    notificationsUnsupported: 'Уведомления приложения не поддерживаются в этом браузере.',
    notificationsNotConfigured: 'Уведомления приложения ещё не настроены на сервере. Но вы всё равно можете сохранить водителя на этом устройстве.',
    notificationsBlocked: 'Уведомления браузера заблокированы на этом устройстве. Разрешите их в настройках браузера и попробуйте снова.',
    cancel: 'Отмена',
    turningOff: 'Выключаем...',
    turnOffOnThisDevice: 'Выключить на этом устройстве',
    enabling: 'Включаем...',
    updateDevice: 'Обновить устройство',
    enableNotifications: 'Включить уведомления',
    done: 'Готово',
    saveDeviceFirst: 'Сначала выберите своё имя из списка, прежде чем сохранять это устройство.',
    notificationsNotEnabledYet: 'Уведомления приложения на этом устройстве ещё не включены.',
    saveProfileFailed: 'Не удалось сохранить профиль этого устройства',
    savedDriverAndNotifications: 'Водитель и настройки уведомлений сохранены на этом устройстве.',
    savedDriverOnly: 'Водитель сохранён на этом устройстве. Уведомления можно включить позже.',
    notificationsEnabledOnDevice: 'Уведомления приложения включены на этом устройстве.',
    notificationsDisabledOnDevice: 'Уведомления приложения выключены на этом устройстве.',
    notificationsUnsupportedBrowser: 'Уведомления приложения не поддерживаются в этом браузере.',
    notificationsNotConfiguredServer: 'Уведомления приложения ещё не настроены на сервере.',
    selectNameBeforeEnable: 'Сначала выберите своё имя из списка, прежде чем включать уведомления.',
    notificationsBlockedError: 'Уведомления были заблокированы в настройках браузера.',
    notificationsPermissionMissing: 'Разрешение на уведомления не было предоставлено.',
    enableNotificationsFailed: 'Не удалось включить уведомления приложения',
    disableNotificationsFailed: 'Не удалось выключить уведомления приложения',
    loadingTitle: 'Загрузка',
    loadingBody: 'Пожалуйста, подождите, отчёт отправляется.',
    languageLabel: 'Язык',
    next: 'Далее',
    retake: 'Переснять',
    captureShot: 'Сделать фото',
    rotatePhoneToContinue: 'Поверните телефон, чтобы продолжить',
    rotatePhoneHorizontally: 'Поверните телефон горизонтально',
    holdLandscape: 'Держите телефон в горизонтальном положении перед съёмкой этого кадра.',
    preparingCamera: 'Подготовка камеры...',
    cameraUnavailable: 'Доступ к камере недоступен в этом браузере.',
    cameraBlocked: 'Доступ к камере заблокирован. Разрешите его и попробуйте снова.',
    scannerPrompt: 'Наведите камеру на QR-код автомобиля.',
  },
  fr: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Scannez le QR code ou saisissez le VIN manuellement, puis démarrez l’inspection avec le conducteur enregistré sur cet appareil.',
    openSettings: 'Ouvrir les paramètres FleetCheck',
    enterValidVin: 'Saisissez d’abord un VIN valide.',
    chooseNameFirst: 'Veuillez d’abord choisir votre nom dans les paramètres.',
    driverNameRequired: 'Le nom du conducteur est obligatoire.',
    captureAllShots: 'Prenez les 8 photos obligatoires avant l’envoi.',
    failedSubmit: 'Échec de l’envoi de l’inspection',
    failedResolveVehicle: 'Impossible de charger le véhicule',
    qrDetectedLoading: 'QR code détecté. Chargement du véhicule...',
    qrDetectedFailed: 'QR code détecté, mais le véhicule n’a pas pu être chargé. Réessayez ou saisissez le VIN manuellement.',
    qrScanFailed: 'Impossible de lire ce QR code pour le moment. Réessayez ou saisissez le VIN manuellement.',
    vehicleLoadedStatus: 'Véhicule chargé.',
    inspectionResult: 'Résultat de l’inspection',
    inspectionSubmitted: 'Inspection envoyée',
    vehicleLabel: 'Véhicule',
    newDamages: 'Nouveaux dommages',
    inspectionNumber: 'Inspection',
    scanAnotherVehicle: 'Scanner un autre véhicule',
    inspectSameVehicleAgain: 'Inspecter à nouveau le même véhicule',
    vinLabel: 'Scanner ou saisir le VIN',
    vinPlaceholder: 'Scanner ou saisir le VIN',
    stopScanner: 'Arrêter le scanner QR',
    scanQr: 'Scanner le QR',
    loadingVehicle: 'Chargement du véhicule...',
    loadVehicle: 'Charger le véhicule',
    vehicleReady: 'Véhicule prêt',
    changeDriver: 'Changer de conducteur',
    setDriver: 'Définir le conducteur',
    changeVehicle: 'Changer de véhicule',
    driverNameLabel: 'Nom du conducteur',
    waitingDriver: 'En attente de sélection du conducteur',
    startInspection: 'Démarrer l’inspection',
    hideOptionalNote: 'Masquer la note optionnelle',
    addOptionalNote: 'Ajouter une note optionnelle',
    optionalNote: 'Note optionnelle',
    optionalNotePlaceholder: 'Courte information pour cette inspection',
    back: 'Retour',
    submitInspection: 'Envoyer l’inspection',
    submittingInspection: 'Envoi de l’inspection...',
    vehicleLoaded: 'Véhicule chargé',
    typeYourName: 'Commencez à saisir votre nom.',
    typeYourNamePlaceholder: 'Commencez à saisir votre nom',
    searchingEmployees: 'Recherche des employés...',
    noEmployeeFound: 'Aucun employé correspondant trouvé pour le moment.',
    settingsLabel: 'Paramètres FleetCheck',
    settingsTitle: 'Conducteur, langue et notifications',
    settingsBody: 'Sélectionnez votre nom une seule fois sur ce téléphone. FleetCheck le réutilisera pour chaque inspection jusqu’à ce que vous changiez le conducteur ici.',
    employeeName: 'Nom de l’employé',
    notificationEmployeeSuggestions: 'Suggestions d’employés',
    selectedDriver: 'Conducteur sélectionné',
    checkingNotifications: 'Vérification des notifications...',
    notificationsUnsupported: 'Les notifications de l’application ne sont pas prises en charge dans ce navigateur.',
    notificationsNotConfigured: 'Les notifications de l’application ne sont pas encore configurées sur le serveur. Vous pouvez quand même enregistrer le conducteur sur cet appareil.',
    notificationsBlocked: 'Les notifications du navigateur sont bloquées sur cet appareil. Autorisez-les dans les paramètres du navigateur et réessayez.',
    cancel: 'Annuler',
    turningOff: 'Désactivation...',
    turnOffOnThisDevice: 'Désactiver sur cet appareil',
    enabling: 'Activation...',
    updateDevice: 'Mettre à jour l’appareil',
    enableNotifications: 'Activer les notifications',
    done: 'Terminé',
    saveDeviceFirst: 'Veuillez d’abord sélectionner votre nom dans la liste avant d’enregistrer cet appareil.',
    notificationsNotEnabledYet: 'Les notifications de l’application ne sont pas encore activées sur cet appareil.',
    saveProfileFailed: 'Impossible d’enregistrer le profil de cet appareil',
    savedDriverAndNotifications: 'Le conducteur et les paramètres de notification sont enregistrés sur cet appareil.',
    savedDriverOnly: 'Le conducteur est enregistré sur cet appareil. Vous pouvez activer les notifications plus tard.',
    notificationsEnabledOnDevice: 'Les notifications de l’application sont activées sur cet appareil.',
    notificationsDisabledOnDevice: 'Les notifications de l’application sont désactivées sur cet appareil.',
    notificationsUnsupportedBrowser: 'Les notifications de l’application ne sont pas prises en charge dans ce navigateur.',
    notificationsNotConfiguredServer: 'Les notifications de l’application ne sont pas encore configurées sur le serveur.',
    selectNameBeforeEnable: 'Veuillez d’abord sélectionner votre nom dans la liste avant d’activer les notifications.',
    notificationsBlockedError: 'Les notifications ont été bloquées dans les paramètres du navigateur.',
    notificationsPermissionMissing: 'L’autorisation de notification n’a pas été accordée.',
    enableNotificationsFailed: 'Impossible d’activer les notifications de l’application',
    disableNotificationsFailed: 'Impossible de désactiver les notifications de l’application',
    loadingTitle: 'Chargement',
    loadingBody: 'Veuillez patienter pendant l’envoi du rapport.',
    languageLabel: 'Langue',
    next: 'Suivant',
    retake: 'Refaire',
    captureShot: 'Prendre la photo',
    rotatePhoneToContinue: 'Tournez le téléphone pour continuer',
    rotatePhoneHorizontally: 'Tournez le téléphone à l’horizontale',
    holdLandscape: 'Tenez votre téléphone en mode paysage avant de prendre cette photo.',
    preparingCamera: 'Préparation de la caméra...',
    cameraUnavailable: 'L’accès à la caméra n’est pas disponible dans ce navigateur.',
    cameraBlocked: 'L’accès à la caméra a été bloqué. Autorisez-le puis réessayez.',
    scannerPrompt: 'Pointez la caméra vers le QR code du véhicule.',
  },
  it: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Scansiona il codice QR o inserisci il VIN manualmente, poi avvia l’ispezione con il conducente salvato su questo dispositivo.',
    openSettings: 'Apri le impostazioni FleetCheck',
    enterValidVin: 'Inserisci prima un VIN valido.',
    chooseNameFirst: 'Seleziona prima il tuo nome nelle impostazioni.',
    driverNameRequired: 'Il nome del conducente è obbligatorio.',
    captureAllShots: 'Scatta tutte le 8 foto obbligatorie prima dell’invio.',
    failedSubmit: 'Invio dell’ispezione non riuscito',
    failedResolveVehicle: 'Impossibile caricare il veicolo',
    qrDetectedLoading: 'Codice QR rilevato. Caricamento del veicolo...',
    qrDetectedFailed: 'Codice QR rilevato, ma il veicolo non è stato caricato. Riprova oppure inserisci il VIN manualmente.',
    qrScanFailed: 'Impossibile leggere questo codice QR al momento. Riprova oppure inserisci il VIN manualmente.',
    vehicleLoadedStatus: 'Veicolo caricato.',
    inspectionResult: 'Risultato dell’ispezione',
    inspectionSubmitted: 'Ispezione inviata',
    vehicleLabel: 'Veicolo',
    newDamages: 'Nuovi danni',
    inspectionNumber: 'Ispezione',
    scanAnotherVehicle: 'Scansiona un altro veicolo',
    inspectSameVehicleAgain: 'Ispeziona di nuovo lo stesso veicolo',
    vinLabel: 'Scansiona o inserisci il VIN',
    vinPlaceholder: 'Scansiona o inserisci il VIN',
    stopScanner: 'Ferma scanner QR',
    scanQr: 'Scansiona QR',
    loadingVehicle: 'Caricamento veicolo...',
    loadVehicle: 'Carica veicolo',
    vehicleReady: 'Veicolo pronto',
    changeDriver: 'Cambia conducente',
    setDriver: 'Imposta conducente',
    changeVehicle: 'Cambia veicolo',
    driverNameLabel: 'Nome del conducente',
    waitingDriver: 'In attesa della selezione del conducente',
    startInspection: 'Avvia ispezione',
    hideOptionalNote: 'Nascondi nota opzionale',
    addOptionalNote: 'Aggiungi nota opzionale',
    optionalNote: 'Nota opzionale',
    optionalNotePlaceholder: 'Breve contesto per questa ispezione',
    back: 'Indietro',
    submitInspection: 'Invia ispezione',
    submittingInspection: 'Invio dell’ispezione...',
    vehicleLoaded: 'Veicolo caricato',
    typeYourName: 'Inizia a digitare il tuo nome.',
    typeYourNamePlaceholder: 'Inizia a digitare il tuo nome',
    searchingEmployees: 'Ricerca dipendenti...',
    noEmployeeFound: 'Nessun dipendente corrispondente trovato.',
    settingsLabel: 'Impostazioni FleetCheck',
    settingsTitle: 'Conducente, lingua e notifiche',
    settingsBody: 'Seleziona il tuo nome una sola volta su questo telefono. FleetCheck lo riutilizzerà per ogni ispezione finché non cambierai il conducente qui.',
    employeeName: 'Nome dipendente',
    notificationEmployeeSuggestions: 'Suggerimenti dipendenti',
    selectedDriver: 'Conducente selezionato',
    checkingNotifications: 'Verifica delle notifiche...',
    notificationsUnsupported: 'Le notifiche dell’app non sono supportate in questo browser.',
    notificationsNotConfigured: 'Le notifiche dell’app non sono ancora configurate sul server. Puoi comunque salvare il conducente su questo dispositivo.',
    notificationsBlocked: 'Le notifiche del browser sono bloccate su questo dispositivo. Consenti le notifiche nelle impostazioni del browser e riprova.',
    cancel: 'Annulla',
    turningOff: 'Disattivazione...',
    turnOffOnThisDevice: 'Disattiva su questo dispositivo',
    enabling: 'Attivazione...',
    updateDevice: 'Aggiorna dispositivo',
    enableNotifications: 'Attiva notifiche',
    done: 'Fine',
    saveDeviceFirst: 'Seleziona prima il tuo nome dall’elenco prima di salvare questo dispositivo.',
    notificationsNotEnabledYet: 'Le notifiche dell’app non sono ancora attive su questo dispositivo.',
    saveProfileFailed: 'Impossibile salvare il profilo di questo dispositivo',
    savedDriverAndNotifications: 'Conducente e impostazioni notifiche sono stati salvati su questo dispositivo.',
    savedDriverOnly: 'Il conducente è salvato su questo dispositivo. Potrai attivare le notifiche più tardi.',
    notificationsEnabledOnDevice: 'Le notifiche dell’app sono attive su questo dispositivo.',
    notificationsDisabledOnDevice: 'Le notifiche dell’app sono disattivate su questo dispositivo.',
    notificationsUnsupportedBrowser: 'Le notifiche dell’app non sono supportate in questo browser.',
    notificationsNotConfiguredServer: 'Le notifiche dell’app non sono ancora configurate sul server.',
    selectNameBeforeEnable: 'Seleziona prima il tuo nome dall’elenco prima di attivare le notifiche.',
    notificationsBlockedError: 'Le notifiche sono state bloccate nelle impostazioni del browser.',
    notificationsPermissionMissing: 'L’autorizzazione alle notifiche non è stata concessa.',
    enableNotificationsFailed: 'Impossibile attivare le notifiche dell’app',
    disableNotificationsFailed: 'Impossibile disattivare le notifiche dell’app',
    loadingTitle: 'Caricamento',
    loadingBody: 'Attendi mentre il report viene inviato.',
    languageLabel: 'Lingua',
    next: 'Avanti',
    retake: 'Rifai',
    captureShot: 'Scatta foto',
    rotatePhoneToContinue: 'Ruota il telefono per continuare',
    rotatePhoneHorizontally: 'Ruota il telefono in orizzontale',
    holdLandscape: 'Tieni il telefono in orizzontale prima di scattare questa foto.',
    preparingCamera: 'Preparazione fotocamera...',
    cameraUnavailable: 'L’accesso alla fotocamera non è disponibile in questo browser.',
    cameraBlocked: 'L’accesso alla fotocamera è stato bloccato. Consentilo e riprova.',
    scannerPrompt: 'Punta la fotocamera verso il codice QR del veicolo.',
  },
  es: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Escanea el código QR o introduce el VIN manualmente y luego inicia la inspección con el conductor guardado en este dispositivo.',
    openSettings: 'Abrir ajustes de FleetCheck',
    enterValidVin: 'Introduce primero un VIN válido.',
    chooseNameFirst: 'Primero selecciona tu nombre en los ajustes.',
    driverNameRequired: 'El nombre del conductor es obligatorio.',
    captureAllShots: 'Haz las 8 fotos obligatorias antes de enviar.',
    failedSubmit: 'No se pudo enviar la inspección',
    failedResolveVehicle: 'No se pudo cargar el vehículo',
    qrDetectedLoading: 'Código QR detectado. Cargando vehículo...',
    qrDetectedFailed: 'Se detectó el código QR, pero no se pudo cargar el vehículo. Inténtalo de nuevo o introduce el VIN manualmente.',
    qrScanFailed: 'No se pudo leer este código QR ahora mismo. Inténtalo de nuevo o introduce el VIN manualmente.',
    vehicleLoadedStatus: 'Vehículo cargado.',
    inspectionResult: 'Resultado de la inspección',
    inspectionSubmitted: 'Inspección enviada',
    vehicleLabel: 'Vehículo',
    newDamages: 'Nuevos daños',
    inspectionNumber: 'Inspección',
    scanAnotherVehicle: 'Escanear otro vehículo',
    inspectSameVehicleAgain: 'Inspeccionar de nuevo el mismo vehículo',
    vinLabel: 'Escanea o introduce el VIN',
    vinPlaceholder: 'Escanea o introduce el VIN',
    stopScanner: 'Detener escáner QR',
    scanQr: 'Escanear QR',
    loadingVehicle: 'Cargando vehículo...',
    loadVehicle: 'Cargar vehículo',
    vehicleReady: 'Vehículo listo',
    changeDriver: 'Cambiar conductor',
    setDriver: 'Seleccionar conductor',
    changeVehicle: 'Cambiar vehículo',
    driverNameLabel: 'Nombre del conductor',
    waitingDriver: 'Esperando la selección del conductor',
    startInspection: 'Iniciar inspección',
    hideOptionalNote: 'Ocultar nota opcional',
    addOptionalNote: 'Añadir nota opcional',
    optionalNote: 'Nota opcional',
    optionalNotePlaceholder: 'Breve contexto para esta inspección',
    back: 'Atrás',
    submitInspection: 'Enviar inspección',
    submittingInspection: 'Enviando inspección...',
    vehicleLoaded: 'Vehículo cargado',
    typeYourName: 'Empieza a escribir tu nombre.',
    typeYourNamePlaceholder: 'Empieza a escribir tu nombre',
    searchingEmployees: 'Buscando empleados...',
    noEmployeeFound: 'Aún no se ha encontrado ningún empleado coincidente.',
    settingsLabel: 'Ajustes de FleetCheck',
    settingsTitle: 'Conductor, idioma y notificaciones',
    settingsBody: 'Selecciona tu nombre una vez en este teléfono. FleetCheck lo reutilizará para cada inspección hasta que cambies el conductor aquí.',
    employeeName: 'Nombre del empleado',
    notificationEmployeeSuggestions: 'Sugerencias de empleados',
    selectedDriver: 'Conductor seleccionado',
    checkingNotifications: 'Comprobando notificaciones...',
    notificationsUnsupported: 'Las notificaciones de la app no están disponibles en este navegador.',
    notificationsNotConfigured: 'Las notificaciones de la app aún no están configuradas en el servidor. Aun así, puedes guardar al conductor en este dispositivo.',
    notificationsBlocked: 'Las notificaciones del navegador están bloqueadas en este dispositivo. Permítelas en la configuración del navegador e inténtalo de nuevo.',
    cancel: 'Cancelar',
    turningOff: 'Desactivando...',
    turnOffOnThisDevice: 'Desactivar en este dispositivo',
    enabling: 'Activando...',
    updateDevice: 'Actualizar dispositivo',
    enableNotifications: 'Activar notificaciones',
    done: 'Hecho',
    saveDeviceFirst: 'Primero selecciona tu nombre de la lista antes de guardar este dispositivo.',
    notificationsNotEnabledYet: 'Las notificaciones de la app aún no están activadas en este dispositivo.',
    saveProfileFailed: 'No se pudo guardar el perfil de este dispositivo',
    savedDriverAndNotifications: 'El conductor y la configuración de notificaciones se han guardado en este dispositivo.',
    savedDriverOnly: 'El conductor se ha guardado en este dispositivo. Puedes activar las notificaciones más tarde.',
    notificationsEnabledOnDevice: 'Las notificaciones de la app están activadas en este dispositivo.',
    notificationsDisabledOnDevice: 'Las notificaciones de la app están desactivadas en este dispositivo.',
    notificationsUnsupportedBrowser: 'Las notificaciones de la app no están disponibles en este navegador.',
    notificationsNotConfiguredServer: 'Las notificaciones de la app aún no están configuradas en el servidor.',
    selectNameBeforeEnable: 'Primero selecciona tu nombre de la lista antes de activar las notificaciones.',
    notificationsBlockedError: 'Las notificaciones fueron bloqueadas en la configuración del navegador.',
    notificationsPermissionMissing: 'No se concedió el permiso de notificaciones.',
    enableNotificationsFailed: 'No se pudieron activar las notificaciones de la app',
    disableNotificationsFailed: 'No se pudieron desactivar las notificaciones de la app',
    loadingTitle: 'Cargando',
    loadingBody: 'Espera mientras se envía el informe.',
    languageLabel: 'Idioma',
    next: 'Siguiente',
    retake: 'Repetir',
    captureShot: 'Tomar foto',
    rotatePhoneToContinue: 'Gira el teléfono para continuar',
    rotatePhoneHorizontally: 'Gira el teléfono horizontalmente',
    holdLandscape: 'Mantén el teléfono en horizontal antes de tomar esta foto.',
    preparingCamera: 'Preparando cámara...',
    cameraUnavailable: 'El acceso a la cámara no está disponible en este navegador.',
    cameraBlocked: 'El acceso a la cámara fue bloqueado. Permítelo e inténtalo de nuevo.',
    scannerPrompt: 'Apunta la cámara al código QR del vehículo.',
  },
  pl: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Zeskanuj kod QR lub wpisz VIN ręcznie, a następnie rozpocznij inspekcję z kierowcą zapisanym na tym urządzeniu.',
    openSettings: 'Otwórz ustawienia FleetCheck',
    enterValidVin: 'Najpierw wpisz prawidłowy VIN.',
    chooseNameFirst: 'Najpierw wybierz swoje imię w ustawieniach.',
    driverNameRequired: 'Imię kierowcy jest wymagane.',
    captureAllShots: 'Przed wysłaniem wykonaj wszystkie 8 wymaganych zdjęć.',
    failedSubmit: 'Nie udało się wysłać inspekcji',
    failedResolveVehicle: 'Nie udało się wczytać pojazdu',
    qrDetectedLoading: 'Wykryto kod QR. Ładowanie pojazdu...',
    qrDetectedFailed: 'Wykryto kod QR, ale nie udało się wczytać pojazdu. Spróbuj ponownie lub wpisz VIN ręcznie.',
    qrScanFailed: 'Nie można teraz odczytać tego kodu QR. Spróbuj ponownie lub wpisz VIN ręcznie.',
    vehicleLoadedStatus: 'Pojazd załadowany.',
    inspectionResult: 'Wynik inspekcji',
    inspectionSubmitted: 'Inspekcja wysłana',
    vehicleLabel: 'Pojazd',
    newDamages: 'Nowe uszkodzenia',
    inspectionNumber: 'Inspekcja',
    scanAnotherVehicle: 'Zeskanuj kolejny pojazd',
    inspectSameVehicleAgain: 'Sprawdź ponownie ten sam pojazd',
    vinLabel: 'Zeskanuj lub wpisz VIN',
    vinPlaceholder: 'Zeskanuj lub wpisz VIN',
    stopScanner: 'Zatrzymaj skaner QR',
    scanQr: 'Skanuj QR',
    loadingVehicle: 'Ładowanie pojazdu...',
    loadVehicle: 'Załaduj pojazd',
    vehicleReady: 'Pojazd gotowy',
    changeDriver: 'Zmień kierowcę',
    setDriver: 'Ustaw kierowcę',
    changeVehicle: 'Zmień pojazd',
    driverNameLabel: 'Imię kierowcy',
    waitingDriver: 'Oczekiwanie na wybór kierowcy',
    startInspection: 'Rozpocznij inspekcję',
    hideOptionalNote: 'Ukryj notatkę opcjonalną',
    addOptionalNote: 'Dodaj notatkę opcjonalną',
    optionalNote: 'Notatka opcjonalna',
    optionalNotePlaceholder: 'Krótka informacja do tej inspekcji',
    back: 'Wstecz',
    submitInspection: 'Wyślij inspekcję',
    submittingInspection: 'Wysyłanie inspekcji...',
    vehicleLoaded: 'Pojazd załadowany',
    typeYourName: 'Zacznij wpisywać swoje imię.',
    typeYourNamePlaceholder: 'Zacznij wpisywać swoje imię',
    searchingEmployees: 'Wyszukiwanie pracowników...',
    noEmployeeFound: 'Nie znaleziono jeszcze pasującego pracownika.',
    settingsLabel: 'Ustawienia FleetCheck',
    settingsTitle: 'Kierowca, język i powiadomienia',
    settingsBody: 'Wybierz swoje imię raz na tym telefonie. FleetCheck będzie używać go przy każdej kolejnej inspekcji, dopóki nie zmienisz kierowcy tutaj.',
    employeeName: 'Imię pracownika',
    notificationEmployeeSuggestions: 'Podpowiedzi pracowników',
    selectedDriver: 'Wybrany kierowca',
    checkingNotifications: 'Sprawdzanie powiadomień...',
    notificationsUnsupported: 'Powiadomienia aplikacji nie są obsługiwane w tej przeglądarce.',
    notificationsNotConfigured: 'Powiadomienia aplikacji nie są jeszcze skonfigurowane na serwerze. Nadal możesz zapisać kierowcę na tym urządzeniu.',
    notificationsBlocked: 'Powiadomienia przeglądarki są zablokowane na tym urządzeniu. Włącz je w ustawieniach przeglądarki i spróbuj ponownie.',
    cancel: 'Anuluj',
    turningOff: 'Wyłączanie...',
    turnOffOnThisDevice: 'Wyłącz na tym urządzeniu',
    enabling: 'Włączanie...',
    updateDevice: 'Zaktualizuj urządzenie',
    enableNotifications: 'Włącz powiadomienia',
    done: 'Gotowe',
    saveDeviceFirst: 'Najpierw wybierz swoje imię z listy przed zapisaniem tego urządzenia.',
    notificationsNotEnabledYet: 'Powiadomienia aplikacji nie są jeszcze włączone na tym urządzeniu.',
    saveProfileFailed: 'Nie udało się zapisać profilu tego urządzenia',
    savedDriverAndNotifications: 'Kierowca i ustawienia powiadomień zostały zapisane na tym urządzeniu.',
    savedDriverOnly: 'Kierowca został zapisany na tym urządzeniu. Powiadomienia możesz włączyć później.',
    notificationsEnabledOnDevice: 'Powiadomienia aplikacji są włączone na tym urządzeniu.',
    notificationsDisabledOnDevice: 'Powiadomienia aplikacji są wyłączone na tym urządzeniu.',
    notificationsUnsupportedBrowser: 'Powiadomienia aplikacji nie są obsługiwane w tej przeglądarce.',
    notificationsNotConfiguredServer: 'Powiadomienia aplikacji nie są jeszcze skonfigurowane na serwerze.',
    selectNameBeforeEnable: 'Najpierw wybierz swoje imię z listy przed włączeniem powiadomień.',
    notificationsBlockedError: 'Powiadomienia zostały zablokowane w ustawieniach przeglądarki.',
    notificationsPermissionMissing: 'Nie przyznano zgody na powiadomienia.',
    enableNotificationsFailed: 'Nie udało się włączyć powiadomień aplikacji',
    disableNotificationsFailed: 'Nie udało się wyłączyć powiadomień aplikacji',
    loadingTitle: 'Ładowanie',
    loadingBody: 'Poczekaj, trwa wysyłanie raportu.',
    languageLabel: 'Język',
    next: 'Dalej',
    retake: 'Powtórz',
    captureShot: 'Zrób zdjęcie',
    rotatePhoneToContinue: 'Obróć telefon, aby kontynuować',
    rotatePhoneHorizontally: 'Ustaw telefon poziomo',
    holdLandscape: 'Przed wykonaniem zdjęcia trzymaj telefon w poziomie.',
    preparingCamera: 'Przygotowywanie kamery...',
    cameraUnavailable: 'Dostęp do kamery nie jest dostępny w tej przeglądarce.',
    cameraBlocked: 'Dostęp do kamery został zablokowany. Zezwól i spróbuj ponownie.',
    scannerPrompt: 'Skieruj kamerę na kod QR pojazdu.',
  },
  uk: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Відскануйте QR-код або введіть VIN вручну, а потім почніть огляд з водієм, збереженим на цьому пристрої.',
    openSettings: 'Відкрити налаштування FleetCheck',
    enterValidVin: 'Спочатку введіть коректний VIN.',
    chooseNameFirst: 'Спочатку виберіть своє ім’я в налаштуваннях.',
    driverNameRequired: 'Ім’я водія є обов’язковим.',
    captureAllShots: 'Перед відправленням потрібно зробити всі 8 обов’язкових фото.',
    failedSubmit: 'Не вдалося надіслати огляд',
    failedResolveVehicle: 'Не вдалося завантажити автомобіль',
    qrDetectedLoading: 'QR-код знайдено. Завантаження автомобіля...',
    qrDetectedFailed: 'QR-код знайдено, але автомобіль не вдалося завантажити. Спробуйте ще раз або введіть VIN вручну.',
    qrScanFailed: 'Зараз не вдалося зчитати цей QR-код. Спробуйте ще раз або введіть VIN вручну.',
    vehicleLoadedStatus: 'Автомобіль завантажено.',
    inspectionResult: 'Результат огляду',
    inspectionSubmitted: 'Огляд надіслано',
    vehicleLabel: 'Автомобіль',
    newDamages: 'Нові пошкодження',
    inspectionNumber: 'Огляд',
    scanAnotherVehicle: 'Сканувати інший автомобіль',
    inspectSameVehicleAgain: 'Оглянути цей самий автомобіль ще раз',
    vinLabel: 'Скануйте або введіть VIN',
    vinPlaceholder: 'Скануйте або введіть VIN',
    stopScanner: 'Зупинити QR-сканер',
    scanQr: 'Сканувати QR',
    loadingVehicle: 'Завантаження автомобіля...',
    loadVehicle: 'Завантажити автомобіль',
    vehicleReady: 'Автомобіль готовий',
    changeDriver: 'Змінити водія',
    setDriver: 'Вибрати водія',
    changeVehicle: 'Змінити автомобіль',
    driverNameLabel: 'Ім’я водія',
    waitingDriver: 'Очікування вибору водія',
    startInspection: 'Почати огляд',
    hideOptionalNote: 'Сховати додаткову нотатку',
    addOptionalNote: 'Додати додаткову нотатку',
    optionalNote: 'Додаткова нотатка',
    optionalNotePlaceholder: 'Короткий коментар до цього огляду',
    back: 'Назад',
    submitInspection: 'Надіслати огляд',
    submittingInspection: 'Надсилання огляду...',
    vehicleLoaded: 'Автомобіль завантажено',
    typeYourName: 'Почніть вводити своє ім’я.',
    typeYourNamePlaceholder: 'Почніть вводити своє ім’я',
    searchingEmployees: 'Пошук працівників...',
    noEmployeeFound: 'Поки що не знайдено відповідного працівника.',
    settingsLabel: 'Налаштування FleetCheck',
    settingsTitle: 'Водій, мова та сповіщення',
    settingsBody: 'Один раз виберіть своє ім’я на цьому телефоні. FleetCheck використовуватиме його для кожного наступного огляду, доки ви не зміните водія тут.',
    employeeName: 'Ім’я працівника',
    notificationEmployeeSuggestions: 'Підказки працівників',
    selectedDriver: 'Вибраний водій',
    checkingNotifications: 'Перевірка сповіщень...',
    notificationsUnsupported: 'Сповіщення застосунку не підтримуються в цьому браузері.',
    notificationsNotConfigured: 'Сповіщення застосунку ще не налаштовані на сервері. Але ви все одно можете зберегти водія на цьому пристрої.',
    notificationsBlocked: 'Сповіщення браузера заблоковані на цьому пристрої. Дозвольте їх у налаштуваннях браузера та спробуйте ще раз.',
    cancel: 'Скасувати',
    turningOff: 'Вимкнення...',
    turnOffOnThisDevice: 'Вимкнути на цьому пристрої',
    enabling: 'Увімкнення...',
    updateDevice: 'Оновити пристрій',
    enableNotifications: 'Увімкнути сповіщення',
    done: 'Готово',
    saveDeviceFirst: 'Спочатку виберіть своє ім’я зі списку перед збереженням цього пристрою.',
    notificationsNotEnabledYet: 'Сповіщення застосунку на цьому пристрої ще не ввімкнені.',
    saveProfileFailed: 'Не вдалося зберегти профіль цього пристрою',
    savedDriverAndNotifications: 'Водія та налаштування сповіщень збережено на цьому пристрої.',
    savedDriverOnly: 'Водія збережено на цьому пристрої. Сповіщення можна ввімкнути пізніше.',
    notificationsEnabledOnDevice: 'Сповіщення застосунку ввімкнені на цьому пристрої.',
    notificationsDisabledOnDevice: 'Сповіщення застосунку вимкнені на цьому пристрої.',
    notificationsUnsupportedBrowser: 'Сповіщення застосунку не підтримуються в цьому браузері.',
    notificationsNotConfiguredServer: 'Сповіщення застосунку ще не налаштовані на сервері.',
    selectNameBeforeEnable: 'Спочатку виберіть своє ім’я зі списку перед увімкненням сповіщень.',
    notificationsBlockedError: 'Сповіщення були заблоковані в налаштуваннях браузера.',
    notificationsPermissionMissing: 'Дозвіл на сповіщення не було надано.',
    enableNotificationsFailed: 'Не вдалося ввімкнути сповіщення застосунку',
    disableNotificationsFailed: 'Не вдалося вимкнути сповіщення застосунку',
    loadingTitle: 'Завантаження',
    loadingBody: 'Будь ласка, зачекайте, звіт надсилається.',
    languageLabel: 'Мова',
    next: 'Далі',
    retake: 'Перезняти',
    captureShot: 'Зробити фото',
    rotatePhoneToContinue: 'Поверніть телефон, щоб продовжити',
    rotatePhoneHorizontally: 'Поверніть телефон горизонтально',
    holdLandscape: 'Тримайте телефон у горизонтальному положенні перед зйомкою цього кадру.',
    preparingCamera: 'Підготовка камери...',
    cameraUnavailable: 'Доступ до камери недоступний у цьому браузері.',
    cameraBlocked: 'Доступ до камери заблоковано. Дозвольте його та спробуйте ще раз.',
    scannerPrompt: 'Наведіть камеру на QR-код автомобіля.',
  },
  nl: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Scan de QR-code of voer de VIN handmatig in en start daarna de inspectie met de bestuurder die op dit apparaat is opgeslagen.',
    openSettings: 'FleetCheck-instellingen openen',
    enterValidVin: 'Voer eerst een geldige VIN in.',
    chooseNameFirst: 'Kies eerst je naam in de instellingen.',
    driverNameRequired: 'De naam van de bestuurder is verplicht.',
    captureAllShots: 'Maak alle 8 verplichte foto’s voordat je verzendt.',
    failedSubmit: 'Inspectie kon niet worden verzonden',
    failedResolveVehicle: 'Voertuig kon niet worden geladen',
    qrDetectedLoading: 'QR-code gedetecteerd. Voertuig wordt geladen...',
    qrDetectedFailed: 'QR-code gedetecteerd, maar het voertuig kon niet worden geladen. Probeer opnieuw of voer de VIN handmatig in.',
    qrScanFailed: 'Deze QR-code kan nu niet worden gelezen. Probeer opnieuw of voer de VIN handmatig in.',
    vehicleLoadedStatus: 'Voertuig geladen.',
    inspectionResult: 'Inspectieresultaat',
    inspectionSubmitted: 'Inspectie verzonden',
    vehicleLabel: 'Voertuig',
    newDamages: 'Nieuwe schade',
    inspectionNumber: 'Inspectie',
    scanAnotherVehicle: 'Ander voertuig scannen',
    inspectSameVehicleAgain: 'Hetzelfde voertuig opnieuw inspecteren',
    vinLabel: 'Scan of voer VIN in',
    vinPlaceholder: 'Scan of voer VIN in',
    stopScanner: 'QR-scanner stoppen',
    scanQr: 'QR scannen',
    loadingVehicle: 'Voertuig wordt geladen...',
    loadVehicle: 'Voertuig laden',
    vehicleReady: 'Voertuig klaar',
    changeDriver: 'Bestuurder wijzigen',
    setDriver: 'Bestuurder instellen',
    changeVehicle: 'Voertuig wijzigen',
    driverNameLabel: 'Naam bestuurder',
    waitingDriver: 'Wachten op selectie van bestuurder',
    startInspection: 'Inspectie starten',
    hideOptionalNote: 'Optionele notitie verbergen',
    addOptionalNote: 'Optionele notitie toevoegen',
    optionalNote: 'Optionele notitie',
    optionalNotePlaceholder: 'Korte context voor deze inspectie',
    back: 'Terug',
    submitInspection: 'Inspectie verzenden',
    submittingInspection: 'Inspectie wordt verzonden...',
    vehicleLoaded: 'Voertuig geladen',
    typeYourName: 'Begin met het typen van je naam.',
    typeYourNamePlaceholder: 'Begin met het typen van je naam',
    searchingEmployees: 'Medewerkers zoeken...',
    noEmployeeFound: 'Nog geen passende medewerker gevonden.',
    settingsLabel: 'FleetCheck-instellingen',
    settingsTitle: 'Bestuurder, taal en meldingen',
    settingsBody: 'Kies je naam één keer op deze telefoon. FleetCheck gebruikt die voor elke volgende inspectie totdat je hier de bestuurder wijzigt.',
    employeeName: 'Naam medewerker',
    notificationEmployeeSuggestions: 'Suggesties voor medewerkers',
    selectedDriver: 'Geselecteerde bestuurder',
    checkingNotifications: 'Meldingen controleren...',
    notificationsUnsupported: 'Appmeldingen worden niet ondersteund in deze browser.',
    notificationsNotConfigured: 'Appmeldingen zijn nog niet op de server ingesteld. Je kunt de bestuurder wel op dit apparaat opslaan.',
    notificationsBlocked: 'Browsermeldingen zijn op dit apparaat geblokkeerd. Sta meldingen toe in de browserinstellingen en probeer opnieuw.',
    cancel: 'Annuleren',
    turningOff: 'Uitschakelen...',
    turnOffOnThisDevice: 'Op dit apparaat uitschakelen',
    enabling: 'Inschakelen...',
    updateDevice: 'Apparaat bijwerken',
    enableNotifications: 'Meldingen inschakelen',
    done: 'Gereed',
    saveDeviceFirst: 'Selecteer eerst je naam uit de lijst voordat je dit apparaat opslaat.',
    notificationsNotEnabledYet: 'Appmeldingen zijn op dit apparaat nog niet ingeschakeld.',
    saveProfileFailed: 'Het profiel van dit apparaat kon niet worden opgeslagen',
    savedDriverAndNotifications: 'Bestuurder en meldingsinstellingen zijn op dit apparaat opgeslagen.',
    savedDriverOnly: 'Bestuurder is op dit apparaat opgeslagen. Je kunt meldingen later inschakelen.',
    notificationsEnabledOnDevice: 'Appmeldingen zijn op dit apparaat ingeschakeld.',
    notificationsDisabledOnDevice: 'Appmeldingen zijn op dit apparaat uitgeschakeld.',
    notificationsUnsupportedBrowser: 'Appmeldingen worden niet ondersteund in deze browser.',
    notificationsNotConfiguredServer: 'Appmeldingen zijn nog niet op de server ingesteld.',
    selectNameBeforeEnable: 'Selecteer eerst je naam uit de lijst voordat je meldingen inschakelt.',
    notificationsBlockedError: 'Meldingen zijn geblokkeerd in de browserinstellingen.',
    notificationsPermissionMissing: 'Er is geen toestemming voor meldingen gegeven.',
    enableNotificationsFailed: 'Appmeldingen konden niet worden ingeschakeld',
    disableNotificationsFailed: 'Appmeldingen konden niet worden uitgeschakeld',
    loadingTitle: 'Laden',
    loadingBody: 'Even geduld, het rapport wordt verzonden.',
    languageLabel: 'Taal',
    next: 'Volgende',
    retake: 'Opnieuw maken',
    captureShot: 'Foto maken',
    rotatePhoneToContinue: 'Draai de telefoon om door te gaan',
    rotatePhoneHorizontally: 'Draai de telefoon horizontaal',
    holdLandscape: 'Houd je telefoon horizontaal voordat je deze foto maakt.',
    preparingCamera: 'Camera wordt voorbereid...',
    cameraUnavailable: 'Cameratoegang is niet beschikbaar in deze browser.',
    cameraBlocked: 'Cameratoegang is geblokkeerd. Sta dit toe en probeer opnieuw.',
    scannerPrompt: 'Richt de camera op de QR-code van het voertuig.',
  },
  ro: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Scanează codul QR sau introdu VIN-ul manual, apoi pornește inspecția cu șoferul salvat pe acest dispozitiv.',
    openSettings: 'Deschide setările FleetCheck',
    enterValidVin: 'Introdu mai întâi un VIN valid.',
    chooseNameFirst: 'Mai întâi selectează-ți numele în setări.',
    driverNameRequired: 'Numele șoferului este obligatoriu.',
    captureAllShots: 'Fă toate cele 8 fotografii obligatorii înainte de trimitere.',
    failedSubmit: 'Trimiterea inspecției a eșuat',
    failedResolveVehicle: 'Vehiculul nu a putut fi încărcat',
    qrDetectedLoading: 'Cod QR detectat. Se încarcă vehiculul...',
    qrDetectedFailed: 'Codul QR a fost detectat, dar vehiculul nu a putut fi încărcat. Încearcă din nou sau introdu VIN-ul manual.',
    qrScanFailed: 'Acest cod QR nu poate fi citit acum. Încearcă din nou sau introdu VIN-ul manual.',
    vehicleLoadedStatus: 'Vehicul încărcat.',
    inspectionResult: 'Rezultatul inspecției',
    inspectionSubmitted: 'Inspecția a fost trimisă',
    vehicleLabel: 'Vehicul',
    newDamages: 'Daune noi',
    inspectionNumber: 'Inspecție',
    scanAnotherVehicle: 'Scanează alt vehicul',
    inspectSameVehicleAgain: 'Inspectează din nou același vehicul',
    vinLabel: 'Scanează sau introdu VIN-ul',
    vinPlaceholder: 'Scanează sau introdu VIN-ul',
    stopScanner: 'Oprește scannerul QR',
    scanQr: 'Scanează QR',
    loadingVehicle: 'Se încarcă vehiculul...',
    loadVehicle: 'Încarcă vehiculul',
    vehicleReady: 'Vehicul pregătit',
    changeDriver: 'Schimbă șoferul',
    setDriver: 'Setează șoferul',
    changeVehicle: 'Schimbă vehiculul',
    driverNameLabel: 'Numele șoferului',
    waitingDriver: 'Se așteaptă selectarea șoferului',
    startInspection: 'Pornește inspecția',
    hideOptionalNote: 'Ascunde nota opțională',
    addOptionalNote: 'Adaugă o notă opțională',
    optionalNote: 'Notă opțională',
    optionalNotePlaceholder: 'Scurt context pentru această inspecție',
    back: 'Înapoi',
    submitInspection: 'Trimite inspecția',
    submittingInspection: 'Se trimite inspecția...',
    vehicleLoaded: 'Vehicul încărcat',
    typeYourName: 'Începe să scrii numele tău.',
    typeYourNamePlaceholder: 'Începe să scrii numele tău',
    searchingEmployees: 'Se caută angajați...',
    noEmployeeFound: 'Nu a fost găsit încă niciun angajat potrivit.',
    settingsLabel: 'Setări FleetCheck',
    settingsTitle: 'Șofer, limbă și notificări',
    settingsBody: 'Selectează-ți numele o singură dată pe acest telefon. FleetCheck îl va reutiliza pentru fiecare inspecție până când schimbi șoferul aici.',
    employeeName: 'Numele angajatului',
    notificationEmployeeSuggestions: 'Sugestii de angajați',
    selectedDriver: 'Șofer selectat',
    checkingNotifications: 'Se verifică notificările...',
    notificationsUnsupported: 'Notificările aplicației nu sunt acceptate în acest browser.',
    notificationsNotConfigured: 'Notificările aplicației nu sunt încă configurate pe server. Totuși, poți salva șoferul pe acest dispozitiv.',
    notificationsBlocked: 'Notificările browserului sunt blocate pe acest dispozitiv. Permite-le în setările browserului și încearcă din nou.',
    cancel: 'Anulează',
    turningOff: 'Se dezactivează...',
    turnOffOnThisDevice: 'Dezactivează pe acest dispozitiv',
    enabling: 'Se activează...',
    updateDevice: 'Actualizează dispozitivul',
    enableNotifications: 'Activează notificările',
    done: 'Gata',
    saveDeviceFirst: 'Selectează mai întâi numele tău din listă înainte de a salva acest dispozitiv.',
    notificationsNotEnabledYet: 'Notificările aplicației nu sunt încă activate pe acest dispozitiv.',
    saveProfileFailed: 'Profilul acestui dispozitiv nu a putut fi salvat',
    savedDriverAndNotifications: 'Șoferul și setările notificărilor au fost salvate pe acest dispozitiv.',
    savedDriverOnly: 'Șoferul a fost salvat pe acest dispozitiv. Poți activa notificările mai târziu.',
    notificationsEnabledOnDevice: 'Notificările aplicației sunt activate pe acest dispozitiv.',
    notificationsDisabledOnDevice: 'Notificările aplicației sunt dezactivate pe acest dispozitiv.',
    notificationsUnsupportedBrowser: 'Notificările aplicației nu sunt acceptate în acest browser.',
    notificationsNotConfiguredServer: 'Notificările aplicației nu sunt încă configurate pe server.',
    selectNameBeforeEnable: 'Selectează mai întâi numele tău din listă înainte de a activa notificările.',
    notificationsBlockedError: 'Notificările au fost blocate în setările browserului.',
    notificationsPermissionMissing: 'Permisiunea pentru notificări nu a fost acordată.',
    enableNotificationsFailed: 'Nu s-au putut activa notificările aplicației',
    disableNotificationsFailed: 'Nu s-au putut dezactiva notificările aplicației',
    loadingTitle: 'Se încarcă',
    loadingBody: 'Te rugăm să aștepți, raportul este trimis.',
    languageLabel: 'Limbă',
    next: 'Următorul',
    retake: 'Refă',
    captureShot: 'Fă fotografia',
    rotatePhoneToContinue: 'Rotește telefonul pentru a continua',
    rotatePhoneHorizontally: 'Rotește telefonul pe orizontală',
    holdLandscape: 'Ține telefonul pe orizontală înainte de a face această fotografie.',
    preparingCamera: 'Se pregătește camera...',
    cameraUnavailable: 'Accesul la cameră nu este disponibil în acest browser.',
    cameraBlocked: 'Accesul la cameră a fost blocat. Permite-l și încearcă din nou.',
    scannerPrompt: 'Îndreaptă camera spre codul QR al vehiculului.',
  },
  hu: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'Szkenneld be a QR-kódot vagy írd be kézzel a VIN-t, majd indítsd el az ellenőrzést az ezen az eszközön mentett sofőrrel.',
    openSettings: 'FleetCheck beállítások megnyitása',
    enterValidVin: 'Először adj meg egy érvényes VIN-t.',
    chooseNameFirst: 'Először válaszd ki a nevedet a beállításokban.',
    driverNameRequired: 'A sofőr neve kötelező.',
    captureAllShots: 'Beküldés előtt készítsd el mind a 8 kötelező fényképet.',
    failedSubmit: 'Az ellenőrzés elküldése nem sikerült',
    failedResolveVehicle: 'A jármű betöltése nem sikerült',
    qrDetectedLoading: 'QR-kód felismerve. Jármű betöltése...',
    qrDetectedFailed: 'A QR-kódot felismerte a rendszer, de a jármű betöltése nem sikerült. Próbáld újra, vagy írd be kézzel a VIN-t.',
    qrScanFailed: 'Ez a QR-kód most nem olvasható be. Próbáld újra, vagy írd be kézzel a VIN-t.',
    vehicleLoadedStatus: 'Jármű betöltve.',
    inspectionResult: 'Ellenőrzés eredménye',
    inspectionSubmitted: 'Ellenőrzés elküldve',
    vehicleLabel: 'Jármű',
    newDamages: 'Új sérülések',
    inspectionNumber: 'Ellenőrzés',
    scanAnotherVehicle: 'Másik jármű szkennelése',
    inspectSameVehicleAgain: 'Ugyanazon jármű újbóli ellenőrzése',
    vinLabel: 'VIN szkennelése vagy megadása',
    vinPlaceholder: 'VIN szkennelése vagy megadása',
    stopScanner: 'QR-szkenner leállítása',
    scanQr: 'QR szkennelése',
    loadingVehicle: 'Jármű betöltése...',
    loadVehicle: 'Jármű betöltése',
    vehicleReady: 'Jármű készen áll',
    changeDriver: 'Sofőr módosítása',
    setDriver: 'Sofőr kiválasztása',
    changeVehicle: 'Jármű módosítása',
    driverNameLabel: 'Sofőr neve',
    waitingDriver: 'Sofőr kiválasztására vár',
    startInspection: 'Ellenőrzés indítása',
    hideOptionalNote: 'Opcionális megjegyzés elrejtése',
    addOptionalNote: 'Opcionális megjegyzés hozzáadása',
    optionalNote: 'Opcionális megjegyzés',
    optionalNotePlaceholder: 'Rövid megjegyzés ehhez az ellenőrzéshez',
    back: 'Vissza',
    submitInspection: 'Ellenőrzés elküldése',
    submittingInspection: 'Ellenőrzés küldése...',
    vehicleLoaded: 'Jármű betöltve',
    typeYourName: 'Kezdd el beírni a nevedet.',
    typeYourNamePlaceholder: 'Kezdd el beírni a nevedet',
    searchingEmployees: 'Munkatársak keresése...',
    noEmployeeFound: 'Még nem található megfelelő munkatárs.',
    settingsLabel: 'FleetCheck beállítások',
    settingsTitle: 'Sofőr, nyelv és értesítések',
    settingsBody: 'Válaszd ki egyszer a nevedet ezen a telefonon. A FleetCheck ezt fogja használni minden további ellenőrzésnél, amíg itt meg nem változtatod a sofőrt.',
    employeeName: 'Munkatárs neve',
    notificationEmployeeSuggestions: 'Munkatárs-javaslatok',
    selectedDriver: 'Kiválasztott sofőr',
    checkingNotifications: 'Értesítések ellenőrzése...',
    notificationsUnsupported: 'Az alkalmazásértesítések ebben a böngészőben nem támogatottak.',
    notificationsNotConfigured: 'Az alkalmazásértesítések még nincsenek beállítva a szerveren. Ettől függetlenül a sofőr menthető ezen az eszközön.',
    notificationsBlocked: 'A böngésző értesítései ezen az eszközön le vannak tiltva. Engedélyezd őket a böngésző beállításaiban, majd próbáld újra.',
    cancel: 'Mégse',
    turningOff: 'Kikapcsolás...',
    turnOffOnThisDevice: 'Kikapcsolás ezen az eszközön',
    enabling: 'Bekapcsolás...',
    updateDevice: 'Eszköz frissítése',
    enableNotifications: 'Értesítések bekapcsolása',
    done: 'Kész',
    saveDeviceFirst: 'Először válaszd ki a nevedet a listából, mielőtt elmented ezt az eszközt.',
    notificationsNotEnabledYet: 'Az alkalmazásértesítések még nincsenek bekapcsolva ezen az eszközön.',
    saveProfileFailed: 'Az eszköz profilját nem sikerült menteni',
    savedDriverAndNotifications: 'A sofőr és az értesítési beállítások el lettek mentve ezen az eszközön.',
    savedDriverOnly: 'A sofőr el lett mentve ezen az eszközön. Az értesítéseket később is bekapcsolhatod.',
    notificationsEnabledOnDevice: 'Az alkalmazásértesítések be vannak kapcsolva ezen az eszközön.',
    notificationsDisabledOnDevice: 'Az alkalmazásértesítések ki vannak kapcsolva ezen az eszközön.',
    notificationsUnsupportedBrowser: 'Az alkalmazásértesítések ebben a böngészőben nem támogatottak.',
    notificationsNotConfiguredServer: 'Az alkalmazásértesítések még nincsenek beállítva a szerveren.',
    selectNameBeforeEnable: 'Először válaszd ki a nevedet a listából, mielőtt bekapcsolod az értesítéseket.',
    notificationsBlockedError: 'Az értesítéseket a böngésző beállításaiban letiltották.',
    notificationsPermissionMissing: 'Az értesítési engedély nem lett megadva.',
    enableNotificationsFailed: 'Az alkalmazásértesítések bekapcsolása nem sikerült',
    disableNotificationsFailed: 'Az alkalmazásértesítések kikapcsolása nem sikerült',
    loadingTitle: 'Betöltés',
    loadingBody: 'Kérlek várj, a jelentés küldése folyamatban van.',
    languageLabel: 'Nyelv',
    next: 'Következő',
    retake: 'Újra',
    captureShot: 'Fotó készítése',
    rotatePhoneToContinue: 'Fordítsd el a telefont a folytatáshoz',
    rotatePhoneHorizontally: 'Fordítsd vízszintesen a telefont',
    holdLandscape: 'A fénykép elkészítése előtt tartsd a telefont vízszintesen.',
    preparingCamera: 'Kamera előkészítése...',
    cameraUnavailable: 'A kamera elérése ebben a böngészőben nem érhető el.',
    cameraBlocked: 'A kamera elérése le lett tiltva. Engedélyezd, majd próbáld újra.',
    scannerPrompt: 'Irányítsd a kamerát a jármű QR-kódjára.',
  },
  ar: {
    ...FLEETCHECK_COPY.en,
    pageSubtitle: 'امسح رمز QR أو أدخل رقم VIN يدويًا، ثم ابدأ الفحص باستخدام السائق المحفوظ على هذا الجهاز.',
    openSettings: 'فتح إعدادات FleetCheck',
    enterValidVin: 'أدخل رقم VIN صالحًا أولاً.',
    chooseNameFirst: 'يرجى اختيار اسمك أولاً من الإعدادات.',
    driverNameRequired: 'اسم السائق مطلوب.',
    captureAllShots: 'يجب التقاط جميع الصور الثماني المطلوبة قبل الإرسال.',
    failedSubmit: 'فشل إرسال الفحص',
    failedResolveVehicle: 'تعذر تحميل المركبة',
    qrDetectedLoading: 'تم اكتشاف رمز QR. جارٍ تحميل المركبة...',
    qrDetectedFailed: 'تم اكتشاف رمز QR، ولكن تعذر تحميل المركبة. حاول مرة أخرى أو أدخل رقم VIN يدويًا.',
    qrScanFailed: 'تعذر قراءة رمز QR هذا الآن. حاول مرة أخرى أو أدخل رقم VIN يدويًا.',
    vehicleLoadedStatus: 'تم تحميل المركبة.',
    inspectionResult: 'نتيجة الفحص',
    inspectionSubmitted: 'تم إرسال الفحص',
    vehicleLabel: 'المركبة',
    newDamages: 'أضرار جديدة',
    inspectionNumber: 'الفحص',
    scanAnotherVehicle: 'فحص مركبة أخرى',
    inspectSameVehicleAgain: 'إعادة فحص المركبة نفسها',
    vinLabel: 'امسح أو أدخل رقم VIN',
    vinPlaceholder: 'امسح أو أدخل رقم VIN',
    stopScanner: 'إيقاف ماسح QR',
    scanQr: 'مسح QR',
    loadingVehicle: 'جارٍ تحميل المركبة...',
    loadVehicle: 'تحميل المركبة',
    vehicleReady: 'المركبة جاهزة',
    changeDriver: 'تغيير السائق',
    setDriver: 'اختيار السائق',
    changeVehicle: 'تغيير المركبة',
    driverNameLabel: 'اسم السائق',
    waitingDriver: 'بانتظار اختيار السائق',
    startInspection: 'بدء الفحص',
    hideOptionalNote: 'إخفاء الملاحظة الاختيارية',
    addOptionalNote: 'إضافة ملاحظة اختيارية',
    optionalNote: 'ملاحظة اختيارية',
    optionalNotePlaceholder: 'معلومة قصيرة عن هذا الفحص',
    back: 'رجوع',
    submitInspection: 'إرسال الفحص',
    submittingInspection: 'جارٍ إرسال الفحص...',
    vehicleLoaded: 'تم تحميل المركبة',
    typeYourName: 'ابدأ بكتابة اسمك.',
    typeYourNamePlaceholder: 'ابدأ بكتابة اسمك',
    searchingEmployees: 'جارٍ البحث عن الموظفين...',
    noEmployeeFound: 'لم يتم العثور على موظف مطابق بعد.',
    settingsLabel: 'إعدادات FleetCheck',
    settingsTitle: 'السائق واللغة والإشعارات',
    settingsBody: 'اختر اسمك مرة واحدة على هذا الهاتف. سيستخدمه FleetCheck لكل فحص لاحق حتى تغيّر السائق من هنا.',
    employeeName: 'اسم الموظف',
    notificationEmployeeSuggestions: 'اقتراحات الموظفين',
    selectedDriver: 'السائق المحدد',
    checkingNotifications: 'جارٍ التحقق من الإشعارات...',
    notificationsUnsupported: 'إشعارات التطبيق غير مدعومة في هذا المتصفح.',
    notificationsNotConfigured: 'إشعارات التطبيق غير مهيأة بعد على الخادم. لا يزال بإمكانك حفظ السائق على هذا الجهاز.',
    notificationsBlocked: 'تم حظر إشعارات المتصفح على هذا الجهاز. اسمح بها من إعدادات المتصفح ثم حاول مرة أخرى.',
    cancel: 'إلغاء',
    turningOff: 'جارٍ الإيقاف...',
    turnOffOnThisDevice: 'إيقاف على هذا الجهاز',
    enabling: 'جارٍ التفعيل...',
    updateDevice: 'تحديث الجهاز',
    enableNotifications: 'تفعيل الإشعارات',
    done: 'تم',
    saveDeviceFirst: 'يرجى اختيار اسمك من القائمة أولاً قبل حفظ هذا الجهاز.',
    notificationsNotEnabledYet: 'إشعارات التطبيق غير مفعلة بعد على هذا الجهاز.',
    saveProfileFailed: 'تعذر حفظ ملف هذا الجهاز',
    savedDriverAndNotifications: 'تم حفظ السائق وإعدادات الإشعارات على هذا الجهاز.',
    savedDriverOnly: 'تم حفظ السائق على هذا الجهاز. يمكنك تفعيل الإشعارات لاحقًا.',
    notificationsEnabledOnDevice: 'إشعارات التطبيق مفعلة على هذا الجهاز.',
    notificationsDisabledOnDevice: 'إشعارات التطبيق متوقفة على هذا الجهاز.',
    notificationsUnsupportedBrowser: 'إشعارات التطبيق غير مدعومة في هذا المتصفح.',
    notificationsNotConfiguredServer: 'إشعارات التطبيق غير مهيأة بعد على الخادم.',
    selectNameBeforeEnable: 'يرجى اختيار اسمك من القائمة أولاً قبل تفعيل الإشعارات.',
    notificationsBlockedError: 'تم حظر الإشعارات في إعدادات المتصفح.',
    notificationsPermissionMissing: 'لم يتم منح إذن الإشعارات.',
    enableNotificationsFailed: 'تعذر تفعيل إشعارات التطبيق',
    disableNotificationsFailed: 'تعذر إيقاف إشعارات التطبيق',
    loadingTitle: 'جارٍ التحميل',
    loadingBody: 'يرجى الانتظار، يتم الآن إرسال التقرير.',
    languageLabel: 'اللغة',
    next: 'التالي',
    retake: 'إعادة التصوير',
    captureShot: 'التقاط صورة',
    rotatePhoneToContinue: 'قم بتدوير الهاتف للمتابعة',
    rotatePhoneHorizontally: 'أدر الهاتف أفقيًا',
    holdLandscape: 'أمسك الهاتف بالوضع الأفقي قبل التقاط هذه الصورة.',
    preparingCamera: 'جارٍ تجهيز الكاميرا...',
    cameraUnavailable: 'الوصول إلى الكاميرا غير متاح في هذا المتصفح.',
    cameraBlocked: 'تم حظر الوصول إلى الكاميرا. اسمح به ثم حاول مرة أخرى.',
    scannerPrompt: 'وجّه الكاميرا نحو رمز QR الخاص بالمركبة.',
  },
});

function normalizeFleetCheckLocale(locale) {
  return normalizePersonalQuestionnaireLocale(locale);
}

function resolveFleetCheckCopyLocale(locale) {
  return normalizeFleetCheckLocale(locale);
}

function readSavedFleetCheckLocale() {
  if (typeof window === 'undefined') return 'en';
  try {
    return normalizeFleetCheckLocale(window.localStorage.getItem(FLEETCHECK_LANGUAGE_KEY));
  } catch (_error) {
    return 'en';
  }
}

function getFleetCheckCopy(locale) {
  return FLEETCHECK_COPY[resolveFleetCheckCopyLocale(locale)] || FLEETCHECK_COPY.en;
}

function getLocalizedShotCopy(locale, shotId) {
  const copyLocale = resolveFleetCheckCopyLocale(locale);
  return FLEETCHECK_SHOT_COPY[copyLocale]?.[shotId] || FLEETCHECK_SHOT_COPY.en[shotId] || null;
}

function isFleetCheckRtl(locale) {
  return normalizeFleetCheckLocale(locale) === 'ar';
}

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

function readSavedInspectionDraft() {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(FLEETCHECK_INSPECTION_DRAFT_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;

    const vehicle =
      parsed.vehicle && typeof parsed.vehicle === 'object'
        ? { ...parsed.vehicle }
        : null;
    const vin = normalizeVin(parsed.vin || vehicle?.vin || '');
    const driverSelection = normalizeEmployeeSelection(parsed.driverSelection);
    const driverName = String(parsed.driverName || driverSelection?.label || '').trim();
    const notes = String(parsed.notes || '');

    if (!vin && !vehicle && !driverName && !notes) return null;

    return {
      vin,
      vehicle: vin && vehicle ? { ...vehicle, vin } : null,
      driverSelection,
      driverName,
      driverConfirmed: Boolean(driverName) && hasEmployeeIdentity(driverSelection),
      notes,
    };
  } catch (_error) {
    return null;
  }
}

function persistInspectionDraft(draft) {
  if (typeof window === 'undefined') return;

  try {
    if (!draft) {
      window.localStorage.removeItem(FLEETCHECK_INSPECTION_DRAFT_KEY);
      return;
    }

    const normalizedVehicle =
      draft.vehicle && typeof draft.vehicle === 'object'
        ? { ...draft.vehicle, vin: normalizeVin(draft.vehicle.vin || draft.vin) }
        : null;
    const normalizedVin = normalizeVin(draft.vin || normalizedVehicle?.vin || '');
    const driverSelection = normalizeEmployeeSelection(draft.driverSelection);
    const driverName = String(draft.driverName || driverSelection?.label || '').trim();
    const notes = String(draft.notes || '');

    if (!normalizedVin && !normalizedVehicle && !driverName && !notes) {
      window.localStorage.removeItem(FLEETCHECK_INSPECTION_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(
      FLEETCHECK_INSPECTION_DRAFT_KEY,
      JSON.stringify({
        vin: normalizedVin || null,
        vehicle: normalizedVehicle,
        driverSelection,
        driverName: driverName || null,
        notes: notes || '',
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

function decodeVinFromImageData(imageData) {
  if (!imageData) return '';
  const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return String(qrCode?.data || '');
}

function buildThresholdImageData(sourceImageData) {
  if (!sourceImageData) return null;
  const { width, height, data } = sourceImageData;
  const next = new Uint8ClampedArray(data.length);

  for (let index = 0; index < data.length; index += 4) {
    const luminance = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
    const value = luminance > 156 ? 255 : 0;
    next[index] = value;
    next[index + 1] = value;
    next[index + 2] = value;
    next[index + 3] = 255;
  }

  return new ImageData(next, width, height);
}

function buildCenterCropImageData(sourceImageData, cropRatio = 0.82) {
  if (!sourceImageData) return null;
  const { width, height, data } = sourceImageData;
  const cropWidth = Math.max(1, Math.floor(width * cropRatio));
  const cropHeight = Math.max(1, Math.floor(height * cropRatio));
  const offsetX = Math.max(0, Math.floor((width - cropWidth) / 2));
  const offsetY = Math.max(0, Math.floor((height - cropHeight) / 2));
  const next = new Uint8ClampedArray(cropWidth * cropHeight * 4);

  for (let y = 0; y < cropHeight; y += 1) {
    const sourceRowStart = ((offsetY + y) * width + offsetX) * 4;
    const targetRowStart = y * cropWidth * 4;
    next.set(
      data.slice(sourceRowStart, sourceRowStart + cropWidth * 4),
      targetRowStart,
    );
  }

  return new ImageData(next, cropWidth, cropHeight);
}

async function detectQrCodeFromVideoFrame(video, detector, canvas, context) {
  if (detector) {
    try {
      const barcodes = await detector.detect(video);
      const detectedValue = String(barcodes?.[0]?.rawValue || '').trim();
      if (detectedValue) {
        return detectedValue;
      }
    } catch (_error) {
      // Fall back to jsQR below when the native detector is flaky on live video.
    }
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

  const directResult = decodeVinFromImageData(imageData);
  if (directResult) return directResult;

  const thresholdResult = decodeVinFromImageData(buildThresholdImageData(imageData));
  if (thresholdResult) return thresholdResult;

  const croppedImageData = buildCenterCropImageData(imageData);
  const croppedResult = decodeVinFromImageData(croppedImageData);
  if (croppedResult) return croppedResult;

  const thresholdCroppedResult = decodeVinFromImageData(buildThresholdImageData(croppedImageData));
  if (thresholdCroppedResult) return thresholdCroppedResult;

  return '';
}

const fleetVanPoseCache = new Map();

function isFloodFillBackgroundPixel(data, index) {
  const alpha = data[index + 3];
  if (alpha < 10) return true;
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);

  const nearWhite = red > 232 && green > 232 && blue > 232;
  const nearBlack = red < 18 && green < 18 && blue < 18;
  const paleNeutral = minChannel > 210 && maxChannel - minChannel < 22;

  return nearWhite || nearBlack || paleNeutral;
}

function floodFillTransparentEdges(imageData, width, height) {
  const { data } = imageData;
  const visited = new Uint8Array(width * height);
  const stack = [];

  function tryPush(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = y * width + x;
    if (visited[offset]) return;
    const pixelIndex = offset * 4;
    if (!isFloodFillBackgroundPixel(data, pixelIndex)) return;
    visited[offset] = 1;
    stack.push(offset);
  }

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (stack.length) {
    const offset = stack.pop();
    const x = offset % width;
    const y = Math.floor(offset / width);
    const pixelIndex = offset * 4;
    data[pixelIndex + 3] = 0;

    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }
}

function findOpaqueBounds(imageData, width, height) {
  const { data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 20) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

async function createTransparentVanPose(src) {
  if (!src || typeof window === 'undefined') return src;
  if (fleetVanPoseCache.has(src)) return fleetVanPoseCache.get(src);

  const processed = await new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
        if (!context) {
          resolve(src);
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        floodFillTransparentEdges(imageData, width, height);
        context.putImageData(imageData, 0, 0);

        const bounds = findOpaqueBounds(imageData, width, height);
        if (!bounds) {
          resolve(src);
          return;
        }

        const padding = 8;
        const cropX = Math.max(0, bounds.minX - padding);
        const cropY = Math.max(0, bounds.minY - padding);
        const cropWidth = Math.min(width - cropX, bounds.maxX - bounds.minX + 1 + padding * 2);
        const cropHeight = Math.min(height - cropY, bounds.maxY - bounds.minY + 1 + padding * 2);

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = cropWidth;
        outputCanvas.height = cropHeight;
        const outputContext = outputCanvas.getContext('2d');
        if (!outputContext) {
          resolve(src);
          return;
        }

        outputContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        resolve(outputCanvas.toDataURL('image/png'));
      } catch (_error) {
        resolve(src);
      }
    };
    image.onerror = () => resolve(src);
    image.src = src;
  });

  fleetVanPoseCache.set(src, processed);
  return processed;
}

async function preloadFleetVanPoses() {
  const uniqueSources = [...new Set(Object.values(SHOT_VAN_ICON_ASSETS).filter(Boolean))];
  for (const source of uniqueSources) {
    await createTransparentVanPose(source);
  }
}

function FleetShotVehiclePose({ shotId, large = false, className = '' }) {
  const source = SHOT_VAN_ICON_ASSETS[shotId] || SHOT_VAN_ICON_ASSETS.front;
  const [processedSrc, setProcessedSrc] = useState(() => fleetVanPoseCache.get(source) || source);
  const poseClassName = [
    'fleet-inspection-vehicle-pose',
    large ? 'fleet-inspection-vehicle-pose--large' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    let cancelled = false;

    async function loadPose() {
      if (!source) {
        setProcessedSrc(null);
        return;
      }
      const result = await createTransparentVanPose(source);
      if (!cancelled) {
        setProcessedSrc(result || source);
      }
    }

    void loadPose();
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (!processedSrc) return null;

  return (
    <span className={poseClassName} aria-hidden="true">
      <img src={processedSrc} alt="" />
    </span>
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

  const vinMatch = raw.match(/(?:^|[\s"'`:{[,;])vin(?:\s*|["'`])[:=]\s*["'`]?([A-HJ-NPR-Z0-9-]{11,32})/i);
  if (vinMatch?.[1]) {
    return normalizeVin(vinMatch[1]);
  }

  try {
    const url = new URL(raw);
    const fromQuery = normalizeVin(url.searchParams.get('vin'));
    if (fromQuery) return fromQuery;
    const lastSegment = url.pathname.split('/').filter(Boolean).pop();
    const fromPath = normalizeVin(lastSegment);
    if (fromPath.length >= 11) return fromPath;
  } catch (_error) {}

  try {
    const parsed = JSON.parse(raw);
    const fromJson = normalizeVin(
      parsed?.vin
      || parsed?.VIN
      || parsed?.vehicleVin
      || parsed?.vehicle_vin
      || parsed?.data?.vin
      || parsed?.payload?.vin,
    );
    if (fromJson.length >= 11) return fromJson;
  } catch (_error) {
    // Ignore JSON parse failures and continue to generic pattern matching.
  }

  const genericVinMatch = raw.match(/[A-HJ-NPR-Z0-9]{17}/i);
  if (genericVinMatch?.[0]) {
    return normalizeVin(genericVinMatch[0]);
  }

  const directVin = normalizeVin(raw);
  if (/^[A-HJ-NPR-Z0-9]{11,32}$/i.test(directVin)) {
    return directVin;
  }

  return '';
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
  const savedInspectionDraft = useMemo(() => readSavedInspectionDraft(), []);
  const [locale, setLocale] = useState(() => readSavedFleetCheckLocale());
  const copy = useMemo(() => getFleetCheckCopy(locale), [locale]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQueryVin = normalizeVin(searchParams.get('vin'));
  const initialDraft = initialQueryVin ? null : savedInspectionDraft;
  const initialDriverSelection = initialDraft?.driverSelection || savedPushEmployee;
  const initialDriverName = initialDraft?.driverName || initialDriverSelection?.label || '';
  const [vinInput, setVinInput] = useState(() => initialQueryVin || initialDraft?.vin || '');
  const [vehicle, setVehicle] = useState(() => initialDraft?.vehicle || null);
  const [driverName, setDriverName] = useState(() => initialDriverName);
  const [driverSelection, setDriverSelection] = useState(() => initialDriverSelection);
  const [driverConfirmed, setDriverConfirmed] = useState(() => Boolean(initialDriverName) && hasEmployeeIdentity(initialDriverSelection));
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [driverSuggestions, setDriverSuggestions] = useState([]);
  const [driverSuggestionsLoading, setDriverSuggestionsLoading] = useState(false);
  const [driverSuggestionsError, setDriverSuggestionsError] = useState('');
  const [driverSuggestionsVisible, setDriverSuggestionsVisible] = useState(false);
  const [notes, setNotes] = useState(() => initialDraft?.notes || '');
  const [notesOpen, setNotesOpen] = useState(false);
  const [inspectionStarted, setInspectionStarted] = useState(false);
  const [capturedShots, setCapturedShots] = useState({});
  const [currentShotId, setCurrentShotId] = useState(() => REQUIRED_SHOT_IDS[0] || null);
  const [shotIntro, setShotIntro] = useState({ shotId: null, token: 0, visible: false });
  const [loadingVehicle, setLoadingVehicle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('');
  const [scannerError, setScannerError] = useState('');
  const [vehicleScanHelpOpen, setVehicleScanHelpOpen] = useState(false);
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
  const lastAnimatedShotRef = useRef('');

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

  const shots = useMemo(
    () => (overlaySet?.shots || SHOT_SEQUENCE).map((shot) => ({
      ...shot,
      ...(getLocalizedShotCopy(locale, shot.id) || {}),
    })),
    [locale, overlaySet],
  );
  const currentIndex = Math.max(shots.findIndex((shot) => shot.id === currentShotId), 0);
  const currentShot = shots[currentIndex] || null;
  const capturedCount = REQUIRED_SHOT_IDS.filter((shotId) => capturedShots[shotId]).length;
  const allCaptured = capturedCount === REQUIRED_SHOT_IDS.length;
  const hasConfiguredDriver = hasEmployeeIdentity(driverSelection) && Boolean(driverName.trim());
  const hasDraftDriver = hasEmployeeIdentity(pushEmployeeSelection);
  const vehicleDisplayTitle = vehicle?.licensePlate || vehicle?.vehicleId || vehicle?.vin || copy.vinLabel;
  const vehicleDisplayMeta = vehicle
    ? `${overlaySet?.label || vehicle.vehicleType || copy.vehicleStatusReady} • VIN ${vehicle.vin}`
    : copy.pageSubtitle;
  const driverDisplayName = driverName || pushEmployeeSelection?.label || copy.waitingDriver;
  const deviceStatusLabel = pushEnabled
    ? copy.notificationsEnabledOnDevice
    : (pushSupported ? copy.notificationsNotEnabledYet : copy.notificationsUnsupported);
  const vehicleSummaryTone = vehicle ? 'success' : 'error';
  const driverSummaryTone = hasConfiguredDriver ? 'success' : 'error';
  const settingsSummaryTone = pushEnabled ? 'success' : 'error';
  const queryVin = normalizeVin(searchParams.get('vin'));
  const vehicleAutoResolving = Boolean(queryVin) && !vehicle && !error;
  const vehiclePickerVisible = !vehicle && !inspectionStarted && !vehicleAutoResolving;
  const vehiclePickerMode = scannerActive ? 'scanner' : 'entry';

  useEffect(() => {
    if (!shots.length) {
      setCurrentShotId(REQUIRED_SHOT_IDS[0] || null);
      return;
    }

    if (!currentShotId || !shots.some((shot) => shot.id === currentShotId)) {
      setCurrentShotId(shots[0].id);
    }
  }, [currentShotId, shots]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      void preloadFleetVanPoses();
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!inspectionStarted) {
      lastAnimatedShotRef.current = '';
      setShotIntro((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    if (!currentShot?.id || submitting) {
      setShotIntro((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    if (lastAnimatedShotRef.current === currentShot.id) {
      return;
    }

    lastAnimatedShotRef.current = currentShot.id;
    setShotIntro((prev) => ({
      shotId: currentShot.id,
      token: prev.token + 1,
      visible: true,
    }));

    const timeoutId = window.setTimeout(() => {
      setShotIntro((prev) => (
        prev.shotId === currentShot.id
          ? { ...prev, visible: false }
          : prev
      ));
    }, 920);

    return () => window.clearTimeout(timeoutId);
  }, [currentShot?.id, inspectionStarted, submitting]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = normalizeFleetCheckLocale(locale);
    try {
      window.localStorage.setItem(FLEETCHECK_LANGUAGE_KEY, normalizeFleetCheckLocale(locale));
    } catch (_error) {}
  }, [locale]);

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
      setDriverModalOpen(false);
    }
  }, [vehicle]);

  useEffect(() => {
    if (!vehiclePickerVisible || typeof document === 'undefined') return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [vehiclePickerVisible]);

  useEffect(() => {
    if (scannerActive) return;
    setVehicleScanHelpOpen(false);
  }, [scannerActive]);

  useEffect(() => {
    if (result) {
      persistInspectionDraft(null);
      return;
    }

    persistInspectionDraft({
      vin: vehicle?.vin || vinInput,
      vehicle,
      driverSelection,
      driverName,
      notes,
    });
  }, [driverName, driverSelection, notes, result, vehicle, vinInput]);

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
        setPushError(String(error?.message || copy.notificationsNotConfiguredServer));
      }
    }

    loadPushConfig();
    return () => {
      cancelled = true;
    };
  }, [copy.notificationsNotConfiguredServer, pushSupported]);

  useEffect(() => {
    if (!inspectionStarted || submitting) {
      void releaseLandscapeInspectionMode();
    }
    return () => {
      void releaseLandscapeInspectionMode();
    };
  }, [inspectionStarted, submitting]);

  useEffect(() => {
    if (!inspectionStarted || submitting) return undefined;

    let relockTimeoutId = null;
    const scheduleLandscapeLock = () => {
      if (typeof window === 'undefined') return;
      if (relockTimeoutId) {
        window.clearTimeout(relockTimeoutId);
      }
      relockTimeoutId = window.setTimeout(() => {
        void requestLandscapeInspectionMode();
      }, 120);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleLandscapeLock();
      }
    };

    scheduleLandscapeLock();
    window.addEventListener('orientationchange', scheduleLandscapeLock);
    window.addEventListener('resize', scheduleLandscapeLock);
    window.addEventListener('focus', scheduleLandscapeLock);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (relockTimeoutId) {
        window.clearTimeout(relockTimeoutId);
      }
      window.removeEventListener('orientationchange', scheduleLandscapeLock);
      window.removeEventListener('resize', scheduleLandscapeLock);
      window.removeEventListener('focus', scheduleLandscapeLock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [inspectionStarted, submitting, currentShot?.id]);

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
          const suggestions = (rows || []).filter((row) => String(row?.label || '').trim());
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
    let scanTimeoutId = null;
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
            setScannerStatus(copy.qrDetectedLoading);
            setScannerError('');
            setVinInput(nextVin);
            const resolved = await handleResolveVehicle(nextVin);
            if (resolved) {
              setScannerActive(false);
              return;
            }
            setScannerStatus(copy.qrDetectedFailed);
          }
        } catch (_error) {
          setScannerError(copy.qrScanFailed);
        }
      }
      scanTimeoutId = window.setTimeout(() => {
        frameId = window.requestAnimationFrame(detectLoop);
      }, 180);
    }

    async function startScanner() {
      setScannerError('');
      setScannerStatus(copy.scannerPrompt);
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
            ? copy.cameraBlocked
            : copy.qrScanFailed;
        setScannerError(message);
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      if (scanTimeoutId) window.clearTimeout(scanTimeoutId);
      mediaStream?.getTracks().forEach((track) => track.stop());
    };
  }, [barcodeSupported, cameraSupported, copy.cameraBlocked, copy.qrDetectedFailed, copy.qrDetectedLoading, copy.qrScanFailed, copy.scannerPrompt, scannerActive, vehicle]);

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

  function handleLocaleChange(nextLocale) {
    setLocale(normalizeFleetCheckLocale(nextLocale));
    setPushError('');
    setPushStatus('');
  }

  async function syncDeviceRegistration(employee, permissionOverride = null) {
    const selectedEmployee = normalizeEmployeeSelection(employee);
    if (!hasEmployeeIdentity(selectedEmployee)) {
      throw new Error(copy.saveDeviceFirst);
    }

    const subscription = await getFleetPushSubscription();
    if (!subscription) {
      throw new Error(copy.notificationsNotEnabledYet);
    }

    const permissionState =
      permissionOverride
      || (typeof Notification === 'undefined' ? 'default' : Notification.permission);

    await registerPublicPushDevice({
      employeeRef: selectedEmployee.employeeRef,
      employeeId: selectedEmployee.employeeId,
      kenjoUserId: selectedEmployee.kenjoUserId,
      displayName: selectedEmployee.label,
      subscription: subscription.toJSON(),
      userAgent: navigator.userAgent,
      platform: inferPushPlatform(),
      appKind: 'fleetcheck-pwa',
      permissionState,
    });

    return selectedEmployee;
  }

  async function handleSaveDeviceProfile() {
    const selectedEmployee = normalizeEmployeeSelection(pushEmployeeSelection);
    if (!hasEmployeeIdentity(selectedEmployee)) {
      setPushError(copy.saveDeviceFirst);
      return;
    }

    setPushBusy(true);
    setPushError('');
    setPushStatus('');

    try {
      if (pushEnabled && pushSupported && pushConfig.enabled && pushConfig.publicKey) {
        await syncDeviceRegistration(selectedEmployee);
      }

      commitSelectedDriver(selectedEmployee, { persist: true });
      setPushStatus(
        pushEnabled
          ? copy.savedDriverAndNotifications
          : copy.savedDriverOnly,
      );
      closeSettingsModal({ preserveFeedback: true });
    } catch (error) {
      setPushError(String(error?.message || copy.saveProfileFailed));
    } finally {
      setPushBusy(false);
    }
  }

  async function handleResolveVehicle(explicitVin) {
    const normalizedVin = normalizeVin(explicitVin ?? vinInput);
    if (!normalizedVin) {
      setError(copy.enterValidVin);
      return false;
    }

    setLoadingVehicle(true);
    setError('');
    setResult(null);
    setScannerError('');

    try {
      const resolvedVehicle = await resolveVehicleByVin(normalizedVin);
      setVehicle(resolvedVehicle);
      setScannerActive(false);
      setVehicleScanHelpOpen(false);
      if (!hasConfiguredDriver) {
        openSettingsModal();
      }
      setInspectionStarted(false);
      setSearchParams({ vin: normalizedVin }, { replace: true });
      setCurrentShotId(REQUIRED_SHOT_IDS[0] || null);
      resetCapturedShots();
      setScannerStatus(copy.vehicleLoadedStatus);
      return true;
    } catch (resolveError) {
      setVehicle(null);
      setError(resolveError.message || copy.failedResolveVehicle);
      return false;
    } finally {
      setLoadingVehicle(false);
    }
  }

  function openVehicleScanner() {
    setVehicleScanHelpOpen(false);
    setScannerStatus('');
    setScannerError('');
    setScannerActive(true);
  }

  function closeVehicleScanner() {
    setVehicleScanHelpOpen(false);
    setScannerStatus('');
    setScannerError('');
    setScannerActive(false);
  }

  async function handleCaptureShot(shotId, blob) {
    const previewUrl = URL.createObjectURL(blob);

    setCapturedShots((prev) => {
      if (prev[shotId]?.previewUrl) {
        URL.revokeObjectURL(prev[shotId].previewUrl);
      }

      return {
        ...prev,
        [shotId]: { blob, previewUrl },
      };
    });
  }

  function handleNextShot(shotId) {
    const orderedShotIds = (shots || []).map((shot) => shot.id);
    const shotIndex = orderedShotIds.indexOf(shotId);
    if (shotIndex === -1) return;

    const nextSequentialIndex = Math.min(shotIndex + 1, Math.max(orderedShotIds.length - 1, 0));
    setCurrentShotId(orderedShotIds[nextSequentialIndex] || orderedShotIds[shotIndex] || null);
  }

  function handleRetakeShot(shotId) {
    setCurrentShotId(shotId);
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
      setError(copy.chooseNameFirst);
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
    setCurrentShotId(REQUIRED_SHOT_IDS[getFirstMissingShotIndex(capturedShotsRef.current)] || REQUIRED_SHOT_IDS[0] || null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleConfirmDriverName() {
    if (!driverName.trim()) {
      setError(copy.driverNameRequired);
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
      setError(copy.driverNameRequired);
      return;
    }
    if (!allCaptured) {
      setError(copy.captureAllShots);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await releaseLandscapeInspectionMode();
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
      persistInspectionDraft(null);
    } catch (submitError) {
      setError(submitError.message || copy.failedSubmit);
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
    setCurrentShotId(REQUIRED_SHOT_IDS[0] || null);
    setScannerActive(false);
    setVehicleScanHelpOpen(false);
    setScannerStatus('');
    setScannerError('');
    scannerCooldownUntilRef.current = 0;
    lastScannedVinRef.current = '';
    setSearchParams({}, { replace: true });
    resetCapturedShots();
    persistInspectionDraft(null);
  }

  async function handleEnablePushNotifications() {
    const selectedEmployee = normalizeEmployeeSelection(pushEmployeeSelection);
    if (!pushSupported) {
      setPushError(copy.notificationsUnsupportedBrowser);
      return;
    }
    if (!pushConfig.enabled || !pushConfig.publicKey) {
      setPushError(copy.notificationsNotConfiguredServer);
      return;
    }
    if (!hasEmployeeIdentity(selectedEmployee)) {
      setPushError(copy.selectNameBeforeEnable);
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
            ? copy.notificationsBlockedError
            : copy.notificationsPermissionMissing,
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

      await syncDeviceRegistration(selectedEmployee, permission);
      commitSelectedDriver(selectedEmployee, { persist: true });
      setPushEnabled(true);
      setPushStatus(copy.notificationsEnabledOnDevice);
      closeSettingsModal({ preserveFeedback: true });
    } catch (error) {
      setPushError(String(error?.message || copy.enableNotificationsFailed));
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
      setPushStatus(copy.notificationsDisabledOnDevice);
      closeSettingsModal({ preserveFeedback: true });
    } catch (error) {
      setPushError(String(error?.message || copy.disableNotificationsFailed));
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div
      className={`fleet-inspection-page ${inspectionStarted ? 'fleet-inspection-page--camera' : ''}`}
      dir={isFleetCheckRtl(locale) ? 'rtl' : 'ltr'}
    >
      <div
        key={`fleetcheck-shell-${locale}`}
        className={`fleet-inspection-shell ${inspectionStarted ? 'fleet-inspection-shell--camera' : ''}`}
      >
        {!inspectionStarted ? (
          <div className="fleet-inspection-home">
            <section className="fleet-inspection-public-header fleet-inspection-public-header--top">
              <div className="fleet-inspection-public-header__appbar">
                <div className="fleet-inspection-public-header__brand">
                  <span className="fleet-inspection-public-header__eyebrow">DSP System</span>
                  <span className="fleet-inspection-public-header__brand-text">Fleet Operations</span>
                </div>
                <button
                  type="button"
                  className="fleet-inspection-settings-trigger"
                  onClick={openSettingsModal}
                  aria-label={copy.openSettings}
                  title={copy.settingsLabel}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 3.75l1.06 2.16a1 1 0 0 0 .75.54l2.38.35-1.72 1.68a1 1 0 0 0-.29.88l.4 2.37-2.13-1.12a1 1 0 0 0-.94 0l-2.13 1.12.4-2.37a1 1 0 0 0-.29-.88L7.81 6.8l2.38-.35a1 1 0 0 0 .75-.54L12 3.75zm0 6a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5zM4.5 13.5l1.54.31a1 1 0 0 1 .74.55l.69 1.4 1.54.23-1.11 1.08a1 1 0 0 0-.29.89l.26 1.53-1.37-.72a1 1 0 0 0-.93 0l-1.37.72.26-1.53a1 1 0 0 0-.29-.89L2.29 16l1.54-.23a1 1 0 0 0 .74-.55l.69-1.4zm15 0l.69 1.4a1 1 0 0 0 .74.55l1.54.23-1.11 1.08a1 1 0 0 0-.29.89l.26 1.53-1.37-.72a1 1 0 0 0-.93 0l-1.37.72.26-1.53a1 1 0 0 0-.29-.89L14.79 16l1.54-.23a1 1 0 0 0 .74-.55l.69-1.4z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>

              <div className="fleet-inspection-public-header__hero">
                <div className="fleet-inspection-public-header__copy">
                  <h1>FleetCheck</h1>
                  <p>{copy.pageSubtitle}</p>
                </div>
                <div className="fleet-inspection-public-header__signal">
                  <span className="fleet-inspection-label">{copy.vehicleLabel}</span>
                  <strong>{vehicleDisplayTitle}</strong>
                  <small className="fleet-inspection-muted">{driverDisplayName}</small>
                </div>
              </div>
            </section>

            {!(vehicle && !result && !inspectionStarted) ? (
              <section className="fleet-inspection-card fleet-inspection-app-summary">
                <article
                  className="fleet-inspection-app-summary__item fleet-inspection-app-summary__item--vehicle"
                  data-tone={vehicleSummaryTone}
                >
                  <span className="fleet-inspection-label">{copy.vehicleLabel}</span>
                  <strong>{vehicleDisplayTitle}</strong>
                  <small className="fleet-inspection-muted">{vehicleDisplayMeta}</small>
                </article>
                <article className="fleet-inspection-app-summary__item" data-tone={driverSummaryTone}>
                  <span className="fleet-inspection-label">{copy.selectedDriver}</span>
                  <strong>{driverDisplayName}</strong>
                  <small className="fleet-inspection-muted">
                    {hasConfiguredDriver ? copy.savedDriverOnly : copy.settingsBody}
                  </small>
                </article>
                <article className="fleet-inspection-app-summary__item" data-tone={settingsSummaryTone}>
                  <span className="fleet-inspection-label">{copy.settingsLabel}</span>
                  <strong>{deviceStatusLabel}</strong>
                  <small className="fleet-inspection-muted">
                    {pushEnabled ? copy.notificationsEnabledOnDevice : copy.openSettings}
                  </small>
                </article>
              </section>
            ) : null}

            {!inspectionStarted && pushStatus ? (
              <section className="fleet-inspection-card fleet-inspection-card--banner">
                <div className="fleet-inspection-alert fleet-inspection-alert--success">{pushStatus}</div>
              </section>
            ) : null}

            {!inspectionStarted && pushError ? (
              <section className="fleet-inspection-card fleet-inspection-card--banner">
                <div className="fleet-inspection-alert fleet-inspection-alert--error">{pushError}</div>
              </section>
            ) : null}

            {error ? (
              <div className="fleet-inspection-card fleet-inspection-card--banner">
                <div className="fleet-inspection-alert fleet-inspection-alert--error">{error}</div>
              </div>
            ) : null}

            {result ? (
              <section className="fleet-inspection-card fleet-inspection-card--result">
                <div className="fleet-inspection-grid">
                  <div>
                    <p className="fleet-inspection-label">{copy.inspectionResult}</p>
                    <h2>{RESULT_LABELS[resolveFleetCheckCopyLocale(locale)]?.[result.overall_result] || copy.inspectionSubmitted}</h2>
                    <p className="fleet-inspection-muted">
                      {copy.vehicleLabel} {result.license_plate || result.vehicle_id || result.vin}
                    </p>
                  </div>
                  <div className="fleet-inspection-meta">
                    <span className="fleet-inspection-status" data-tone={resultTone(result.overall_result)}>
                      {RESULT_LABELS[resolveFleetCheckCopyLocale(locale)]?.[result.overall_result] || result.overall_result}
                    </span>
                    <span className="fleet-inspection-meta__chip">
                      {copy.newDamages}: {result.new_damages_count ?? 0}
                    </span>
                    <span className="fleet-inspection-meta__chip">
                      {copy.inspectionNumber} #{result.id}
                    </span>
                  </div>
                </div>
                <div className="fleet-inspection-actions">
                  <button type="button" className="fleet-inspection-button" onClick={startAnotherVehicle}>
                    {copy.scanAnotherVehicle}
                  </button>
                  <button
                    type="button"
                    className="fleet-inspection-button fleet-inspection-button--secondary"
                    onClick={() => {
                      setResult(null);
                      setInspectionStarted(false);
                      setCurrentShotId(REQUIRED_SHOT_IDS[0] || null);
                    }}
                  >
                    {copy.inspectSameVehicleAgain}
                  </button>
                </div>
              </section>
            ) : null}

            {vehicle && !result && !inspectionStarted ? (
              <>
                <section className="fleet-inspection-card fleet-inspection-preflight fleet-inspection-card--preflight">
                  <div className="fleet-inspection-preflight__hero">
                    <div>
                      <p className="fleet-inspection-label">{copy.vehicleReady}</p>
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
                        {driverConfirmed ? copy.changeDriver : copy.setDriver}
                      </button>
                      <button
                        type="button"
                        className="fleet-inspection-button fleet-inspection-button--neutral"
                        onClick={startAnotherVehicle}
                      >
                        {copy.changeVehicle}
                      </button>
                    </div>
                  </div>

                  <div className="fleet-inspection-driver-summary">
                    <div>
                      <span className="fleet-inspection-label">{copy.driverNameLabel}</span>
                      <strong>{driverName || copy.waitingDriver}</strong>
                    </div>
                  </div>

                  <div className="fleet-inspection-preflight__summary">
                    <button
                      type="button"
                      className="fleet-inspection-button fleet-inspection-button--large fleet-inspection-button--scan"
                      onClick={handleStartInspection}
                      disabled={!driverConfirmed}
                    >
                      {copy.startInspection}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="fleet-inspection-note-toggle"
                    onClick={() => setNotesOpen((current) => !current)}
                  >
                    {notesOpen ? copy.hideOptionalNote : copy.addOptionalNote}
                  </button>

                  {notesOpen ? (
                    <div className="fleet-inspection-field">
                      <label htmlFor="inspection-notes">{copy.optionalNote}</label>
                      <textarea
                        id="inspection-notes"
                        className="fleet-inspection-textarea"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder={copy.optionalNotePlaceholder}
                      />
                    </div>
                  ) : null}
                </section>

                <section className="fleet-inspection-card fleet-inspection-app-summary">
                  <article
                    className="fleet-inspection-app-summary__item fleet-inspection-app-summary__item--vehicle"
                    data-tone={vehicleSummaryTone}
                  >
                    <span className="fleet-inspection-label">{copy.vehicleLabel}</span>
                    <strong>{vehicleDisplayTitle}</strong>
                    <small className="fleet-inspection-muted">{vehicleDisplayMeta}</small>
                  </article>
                  <article className="fleet-inspection-app-summary__item" data-tone={driverSummaryTone}>
                    <span className="fleet-inspection-label">{copy.selectedDriver}</span>
                    <strong>{driverDisplayName}</strong>
                    <small className="fleet-inspection-muted">
                      {hasConfiguredDriver ? copy.savedDriverOnly : copy.settingsBody}
                    </small>
                  </article>
                  <article className="fleet-inspection-app-summary__item" data-tone={settingsSummaryTone}>
                    <span className="fleet-inspection-label">{copy.settingsLabel}</span>
                    <strong>{deviceStatusLabel}</strong>
                    <small className="fleet-inspection-muted">
                      {pushEnabled ? copy.notificationsEnabledOnDevice : copy.openSettings}
                    </small>
                  </article>
                </section>
              </>
            ) : null}
          </div>
        ) : null}

        {vehicle && !result && inspectionStarted && currentShot ? (
          <section className="fleet-inspection-session">
            <InspectionCamera
              key={`${locale}:${currentShot.id}`}
              shot={currentShot}
              copy={copy}
              overlayUrl={FLEETCHECK_OVERLAYS_ENABLED ? currentShot.overlayPath : null}
              overlayScale={FLEETCHECK_OVERLAYS_ENABLED ? currentShot.overlayScale : 1}
              currentPhoto={capturedShots[currentShot.id]}
              onCapture={(blob) => handleCaptureShot(currentShot.id, blob)}
              onNext={() => handleNextShot(currentShot.id)}
              onRetake={() => handleRetakeShot(currentShot.id)}
              disabled={submitting}
              stepNumber={Math.min(currentIndex + 1, 8)}
              totalSteps={8}
            />

            {shotIntro.visible && shotIntro.shotId ? (
              <div
                key={`${shotIntro.shotId}:${shotIntro.token}`}
                className="fleet-inspection-shot-intro"
                aria-hidden="true"
              >
                <div className="fleet-inspection-shot-intro__pose">
                  <FleetShotVehiclePose
                    shotId={shotIntro.shotId}
                    className="fleet-inspection-vehicle-pose--intro"
                  />
                </div>
              </div>
            ) : null}

            <div className="fleet-inspection-session__overlay fleet-inspection-session__overlay--top">
              <button
                type="button"
                className="fleet-inspection-session__nav"
                onClick={() => setInspectionStarted(false)}
                aria-label={copy.back}
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
                <div className="fleet-inspection-session__title-copy fleet-inspection-session__title-copy--compact">
                  <strong>{vehicle.licensePlate || vehicle.vehicleId || vehicle.vin}</strong>
                </div>
                <FleetShotVehiclePose shotId={currentShot.id} large />
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
                  {submitting ? copy.submittingInspection : copy.submitInspection}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {submitting ? (
          <div className="fleet-inspection-modal-backdrop">
            <div className="fleet-inspection-modal" role="dialog" aria-modal="true" aria-labelledby="fleet-submit-loading-title">
              <div className="fleet-inspection-modal__header">
                <div>
                  <p className="fleet-inspection-label">{copy.loadingTitle}</p>
                  <h3 id="fleet-submit-loading-title">{copy.loadingTitle}</h3>
                  <p className="fleet-inspection-muted">{copy.loadingBody}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {driverModalOpen && vehicle && !inspectionStarted ? (
          <div className="fleet-inspection-modal-backdrop">
            <div className="fleet-inspection-modal" role="dialog" aria-modal="true" aria-labelledby="fleet-driver-modal-title">
              <div className="fleet-inspection-modal__header">
                <div>
                  <p className="fleet-inspection-label">{copy.vehicleLoaded}</p>
                  <h3 id="fleet-driver-modal-title">{vehicle.licensePlate || vehicle.vehicleId}</h3>
                  <p className="fleet-inspection-muted">{copy.typeYourName}</p>
                </div>
              </div>

              <div className="fleet-inspection-field">
                <label htmlFor="inspection-driver-name">{copy.driverNameLabel}</label>
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
                  placeholder={copy.typeYourNamePlaceholder}
                  autoComplete="off"
                />
                {driverSuggestionsVisible && (driverSuggestionsLoading || driverSuggestions.length || driverSuggestionsError) ? (
                  <div className="fleet-inspection-suggestions" role="listbox" aria-label={copy.driverNameLabel}>
                    {driverSuggestionsLoading ? (
                      <p className="fleet-inspection-suggestions__state">{copy.searchingEmployees}</p>
                    ) : null}
                    {!driverSuggestionsLoading && driverSuggestionsError ? (
                      <p className="fleet-inspection-suggestions__state">{driverSuggestionsError}</p>
                    ) : null}
                    {!driverSuggestionsLoading && !driverSuggestionsError && !driverSuggestions.length && driverName.trim().length >= 2 ? (
                      <p className="fleet-inspection-suggestions__state">{copy.noEmployeeFound}</p>
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
                  {copy.changeVehicle}
                </button>
                <button
                  type="button"
                  className="fleet-inspection-button fleet-inspection-button--scan"
                  onClick={handleConfirmDriverName}
                >
                  {copy.ok}
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
                  <p className="fleet-inspection-label">{copy.settingsLabel}</p>
                  <h3 id="fleet-push-modal-title">{copy.settingsTitle}</h3>
                  <p className="fleet-inspection-muted">{copy.settingsBody}</p>
                </div>
              </div>

              <div className="fleet-inspection-field">
                <label htmlFor="fleet-push-language">{copy.languageLabel}</label>
                <select
                  id="fleet-push-language"
                  className="fleet-inspection-input fleet-inspection-input--large"
                  value={locale}
                  onChange={(event) => handleLocaleChange(event.target.value)}
                >
                  {FLEETCHECK_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.locale} value={option.locale}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fleet-inspection-field">
                <label htmlFor="fleet-push-employee">{copy.employeeName}</label>
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
                  placeholder={copy.typeYourNamePlaceholder}
                  autoComplete="off"
                />
                {pushSuggestionsVisible && (pushSuggestionsLoading || pushSuggestions.length || pushSuggestionsError) ? (
                  <div className="fleet-inspection-suggestions" role="listbox" aria-label={copy.notificationEmployeeSuggestions}>
                    {pushSuggestionsLoading ? (
                      <p className="fleet-inspection-suggestions__state">{copy.searchingEmployees}</p>
                    ) : null}
                    {!pushSuggestionsLoading && pushSuggestionsError ? (
                      <p className="fleet-inspection-suggestions__state">{pushSuggestionsError}</p>
                    ) : null}
                    {!pushSuggestionsLoading && !pushSuggestionsError && !pushSuggestions.length && pushEmployeeQuery.trim().length >= 2 ? (
                      <p className="fleet-inspection-suggestions__state">{copy.noEmployeeFound}</p>
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
                    <span className="fleet-inspection-label">{copy.selectedDriver}</span>
                    <strong>{pushEmployeeSelection.label}</strong>
                    {pushEmployeeSelection.subtitle ? (
                      <small className="fleet-inspection-muted">{pushEmployeeSelection.subtitle}</small>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {pushConfig.loading ? (
                <p className="fleet-inspection-muted">{copy.checkingNotifications}</p>
              ) : null}
              {!pushSupported ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--warning">
                  {copy.notificationsUnsupported}
                </div>
              ) : null}
              {pushSupported && !pushConfig.loading && !pushConfig.enabled ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--warning">
                  {copy.notificationsNotConfigured}
                </div>
              ) : null}
              {pushPermission === 'denied' ? (
                <div className="fleet-inspection-alert fleet-inspection-alert--warning">
                  {copy.notificationsBlocked}
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
                  {copy.cancel}
                </button>
                {pushEnabled ? (
                  <button
                    type="button"
                    className="fleet-inspection-button fleet-inspection-button--neutral"
                    onClick={() => void handleDisablePushNotifications()}
                    disabled={pushBusy}
                  >
                    {pushBusy ? copy.turningOff : copy.turnOffOnThisDevice}
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
                  {pushBusy ? copy.enabling : (pushEnabled ? copy.updateDevice : copy.enableNotifications)}
                </button>
                <button
                  type="button"
                  className="fleet-inspection-button"
                  onClick={handleSaveDeviceProfile}
                  disabled={pushBusy || !hasDraftDriver}
                >
                  {copy.done}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {vehiclePickerVisible ? (
          <div className="fleet-inspection-modal-backdrop fleet-inspection-modal-backdrop--vehicle">
            <div
              className="fleet-inspection-modal fleet-inspection-modal--vehicle"
              role="dialog"
              aria-modal="true"
              aria-labelledby={vehiclePickerMode === 'entry' ? 'fleet-vehicle-picker-title' : undefined}
              aria-label={vehiclePickerMode === 'scanner' ? copy.scanQr : undefined}
            >
              {vehiclePickerMode === 'scanner' ? (
                <div className="fleet-inspection-modal__body fleet-inspection-modal__body--vehicle-scan">
                  <div className="fleet-inspection-vehicle-scan-topbar">
                    <button
                      type="button"
                      className="fleet-inspection-session__nav fleet-inspection-vehicle-scan-topbar__nav"
                      onClick={closeVehicleScanner}
                      aria-label={copy.back}
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

                    <div className="fleet-inspection-vehicle-scan-help">
                      <button
                        type="button"
                        className="fleet-inspection-vehicle-scan-help__trigger"
                        onClick={() => setVehicleScanHelpOpen((current) => !current)}
                        aria-label={copy.vehicleScanHelp || 'Vehicle scan options'}
                        aria-expanded={vehicleScanHelpOpen}
                      >
                        ?
                      </button>

                      {vehicleScanHelpOpen ? (
                        <div className="fleet-inspection-vehicle-scan-help__menu">
                          <button
                            type="button"
                            className="fleet-inspection-vehicle-scan-help__item"
                            onClick={closeVehicleScanner}
                          >
                            {copy.enterVinManually || 'Enter VIN manually'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <section className="fleet-inspection-card fleet-inspection-card--scanner fleet-inspection-card--scanner-embedded fleet-inspection-card--scanner-fullscreen">
                    <div className="fleet-inspection-scan-stage fleet-inspection-scan-stage--vehicle fleet-inspection-scan-stage--fullscreen">
                      <video ref={scannerVideoRef} muted playsInline autoPlay />
                      <div className="fleet-inspection-scan-frame" aria-hidden="true" />
                    </div>
                  </section>

                  <div className="fleet-inspection-vehicle-scan-feedback">
                    {scannerStatus ? <p className="fleet-inspection-muted">{scannerStatus}</p> : null}
                    {scannerError ? (
                      <div className="fleet-inspection-alert fleet-inspection-alert--warning">{scannerError}</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div className="fleet-inspection-modal__header fleet-inspection-modal__header--vehicle">
                    <div>
                      <p className="fleet-inspection-label">{copy.vehicleLabel}</p>
                      <h3 id="fleet-vehicle-picker-title">{copy.loadVehicle}</h3>
                      <p className="fleet-inspection-muted">{copy.pageSubtitle}</p>
                    </div>
                  </div>

                  <div className="fleet-inspection-modal__body fleet-inspection-modal__body--vehicle">
                    <div className="fleet-inspection-field">
                      <label htmlFor="inspection-vin">{copy.vinLabel}</label>
                      <input
                        id="inspection-vin"
                        className="fleet-inspection-input fleet-inspection-input--vin"
                        value={vinInput}
                        onChange={(event) => setVinInput(normalizeVin(event.target.value))}
                        placeholder={copy.vinPlaceholder}
                        autoCapitalize="characters"
                        autoCorrect="off"
                      />
                    </div>

                    <div className="fleet-inspection-vin-actions fleet-inspection-vin-actions--vehicle">
                      {cameraSupported ? (
                        <button
                          type="button"
                          className="fleet-inspection-button fleet-inspection-button--scan"
                          onClick={openVehicleScanner}
                        >
                          {copy.scanQr}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="fleet-inspection-button fleet-inspection-button--neutral"
                        onClick={() => void handleResolveVehicle()}
                        disabled={loadingVehicle}
                      >
                        {loadingVehicle ? copy.loadingVehicle : copy.loadVehicle}
                      </button>
                    </div>

                    {error && !vehicle ? (
                      <div className="fleet-inspection-alert fleet-inspection-alert--warning">{error}</div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {vehicleAutoResolving ? (
          <div className="fleet-inspection-modal-backdrop fleet-inspection-modal-backdrop--vehicle">
            <div
              className="fleet-inspection-modal fleet-inspection-modal--vehicle fleet-inspection-modal--vehicle-loading"
              role="status"
              aria-live="polite"
            >
              <div className="fleet-inspection-vehicle-loader">
                <span className="fleet-inspection-camera__capture-spinner" aria-hidden="true" />
                <strong>{copy.loadingVehicle}</strong>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
