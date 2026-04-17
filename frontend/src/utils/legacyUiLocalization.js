import { normalizePortalLanguage } from './portalLocale.js';
import { translations } from '../translations.js';

const CORE_TEXT_BY_SOURCE = {
  'Search across the system': { en: 'Search across the system', de: 'Im gesamten System suchen' },
  'Previous result': { en: 'Previous result', de: 'Vorheriges Ergebnis' },
  'Next result': { en: 'Next result', de: 'Nächstes Ergebnis' },
  'Clear search': { en: 'Clear search', de: 'Suche löschen' },
  'Searching...': { en: 'Searching...', de: 'Suche läuft...' },
  'Searching…': { en: 'Searching...', de: 'Suche läuft...' },
  'No system results': { en: 'No system results', de: 'Keine Systemergebnisse' },
  Result: { en: 'Result', de: 'Ergebnis' },
  'Nothing found on this page': { en: 'Nothing found on this page', de: 'Auf dieser Seite nichts gefunden' },
  'Loading...': { en: 'Loading...', de: 'Wird geladen...' },
  'Loading…': { en: 'Loading...', de: 'Wird geladen...' },
  'Loading details...': { en: 'Loading details...', de: 'Details werden geladen...' },
  'Loading details…': { en: 'Loading details...', de: 'Details werden geladen...' },
  Save: { en: 'Save', de: 'Speichern' },
  'Saved.': { en: 'Saved.', de: 'Gespeichert.' },
  'Saving...': { en: 'Saving...', de: 'Wird gespeichert...' },
  'Saving…': { en: 'Saving...', de: 'Wird gespeichert...' },
  Cancel: { en: 'Cancel', de: 'Abbrechen' },
  Close: { en: 'Close', de: 'Schließen' },
  Edit: { en: 'Edit', de: 'Bearbeiten' },
  Delete: { en: 'Delete', de: 'Löschen' },
  Download: { en: 'Download', de: 'Herunterladen' },
  Upload: { en: 'Upload', de: 'Hochladen' },
  Assign: { en: 'Assign', de: 'Zuweisen' },
  Refresh: { en: 'Refresh', de: 'Aktualisieren' },
  Export: { en: 'Export', de: 'Exportieren' },
  Actions: { en: 'Actions', de: 'Aktionen' },
  Action: { en: 'Action', de: 'Aktion' },
  Status: { en: 'Status', de: 'Status' },
  Active: { en: 'Active', de: 'Aktiv' },
  Inactive: { en: 'Inactive', de: 'Inaktiv' },
  Enabled: { en: 'Enabled', de: 'Aktiviert' },
  Disabled: { en: 'Disabled', de: 'Deaktiviert' },
  Yes: { en: 'Yes', de: 'Ja' },
  No: { en: 'No', de: 'Nein' },
  All: { en: 'All', de: 'Alle' },
  Group: { en: 'Group', de: 'Gruppe' },
  Name: { en: 'Name', de: 'Name' },
  Description: { en: 'Description', de: 'Beschreibung' },
  Date: { en: 'Date', de: 'Datum' },
  Time: { en: 'Time', de: 'Zeit' },
  Type: { en: 'Type', de: 'Typ' },
  Preview: { en: 'Preview', de: 'Vorschau' },
  Details: { en: 'Details', de: 'Details' },
  Security: { en: 'Security', de: 'Sicherheit' },
  Notifications: { en: 'Notifications', de: 'Benachrichtigungen' },
  Pending: { en: 'Pending', de: 'Ausstehend' },
  Completed: { en: 'Completed', de: 'Abgeschlossen' },
  Failed: { en: 'Failed', de: 'Fehlgeschlagen' },
  Cancelled: { en: 'Cancelled', de: 'Storniert' },
  Sent: { en: 'Sent', de: 'Gesendet' },
  Unknown: { en: 'Unknown', de: 'Unbekannt' },
  Cars: { en: 'Cars', de: 'Fahrzeuge' },
  Damages: { en: 'Damages', de: 'Schäden' },
  Routes: { en: 'Routes', de: 'Routen' },
  Comment: { en: 'Comment', de: 'Kommentar' },
  Driver: { en: 'Driver', de: 'Fahrer' },
  Drivers: { en: 'Drivers', de: 'Fahrer' },
  Grade: { en: 'Grade', de: 'Bewertung' },
  Month: { en: 'Month', de: 'Monat' },
  Amount: { en: 'Amount', de: 'Betrag' },
  Count: { en: 'Count', de: 'Anzahl' },
  Rating: { en: 'Rating', de: 'Bewertung' },
  Year: { en: 'Year', de: 'Jahr' },
  Week: { en: 'Week', de: 'Woche' },
  KPI: { en: 'KPI', de: 'KPI' },
  File: { en: 'File', de: 'Datei' },
  View: { en: 'View', de: 'Ansehen' },
  Lock: { en: 'Lock', de: 'Sperren' },
  Unlock: { en: 'Unlock', de: 'Entsperren' },
  Deactivate: { en: 'Deactivate', de: 'Deaktivieren' },
  Reactivate: { en: 'Reactivate', de: 'Reaktivieren' },
  Suspended: { en: 'Suspended', de: 'Gesperrt' },
  Invited: { en: 'Invited', de: 'Eingeladen' },
  'PAVE Inspections': { en: 'PAVE Inspections', de: 'PAVE-Prüfungen' },
  'Add User': { en: 'Add User', de: 'Benutzer hinzufügen' },
  'Add Role': { en: 'Add Role', de: 'Rolle hinzufügen' },
  'Assign Driver': { en: 'Assign Driver', de: 'Fahrer zuweisen' },
  'Add Car': { en: 'Add Car', de: 'Fahrzeug hinzufügen' },
  'Delete report': { en: 'Delete report', de: 'Bericht löschen' },
  'Delete task': { en: 'Delete task', de: 'Aufgabe löschen' },
  'Open inspection': { en: 'Open inspection', de: 'Prüfung öffnen' },
  'Open completed inspection': { en: 'Open completed inspection', de: 'Abgeschlossene Prüfung öffnen' },
  'Back to list': { en: 'Back to list', de: 'Zurück zur Liste' },
  'Captured photos': { en: 'Captured photos', de: 'Erfasste Fotos' },
  'Comparison summary': { en: 'Comparison summary', de: 'Vergleichszusammenfassung' },
  'Detected changes': { en: 'Detected changes', de: 'Erkannte Änderungen' },
  'Reminder task': { en: 'Reminder task', de: 'Erinnerungsaufgabe' },
  Submitted: { en: 'Submitted', de: 'Übermittelt' },
  'New damages': { en: 'New damages', de: 'Neue Schäden' },
  'Inspection date': { en: 'Inspection date', de: 'Prüfungsdatum' },
  'Report plate': { en: 'Report plate', de: 'Berichts-Kennzeichen' },
  Expiry: { en: 'Expiry', de: 'Ablauf' },
  'Users & Access': { en: 'Users & Access', de: 'Benutzer & Zugriff' },
  'Roles & Permissions': { en: 'Roles & Permissions', de: 'Rollen & Berechtigungen' },
  Integrations: { en: 'Integrations', de: 'Integrationen' },
  'Audit Log': { en: 'Audit Log', de: 'Audit-Protokoll' },
  'Feature Flags': { en: 'Feature Flags', de: 'Feature-Flags' },
  'KPI Settings': { en: 'KPI Settings', de: 'KPI-Einstellungen' },
  'Payroll Settings': { en: 'Payroll Settings', de: 'Payroll-Einstellungen' },
  'Cars / Fleet Settings': { en: 'Cars / Fleet Settings', de: 'Fahrzeug- / Flotteneinstellungen' },
  'Driver Settings': { en: 'Driver Settings', de: 'Fahrereinstellungen' },
  'Route / Dispatch Settings': { en: 'Route / Dispatch Settings', de: 'Routen- / Dispatch-Einstellungen' },
  'Advanced / System Config': { en: 'Advanced / System Config', de: 'Erweitert / Systemkonfiguration' },
};

const EMPLOYEE_TEXT_BY_SOURCE = {
  'Employee Profile': { en: 'Employee Profile', de: 'Mitarbeiterprofil' },
  'No employee selected. Please open this page from Kenjo Sync or the employees list.': {
    en: 'No employee selected. Please open this page from Kenjo Sync or the employees list.',
    de: 'Kein Mitarbeiter ausgewählt. Bitte öffnen Sie diese Seite über Kenjo Sync oder die Mitarbeiterliste.',
  },
  'Loading employee data from Kenjo...': { en: 'Loading employee data from Kenjo...', de: 'Mitarbeiterdaten werden aus Kenjo geladen...' },
  'Loading employee data from Kenjo…': { en: 'Loading employee data from Kenjo...', de: 'Mitarbeiterdaten werden aus Kenjo geladen...' },
  Rescue: { en: 'Rescue', de: 'Rettungseinsätze' },
  'Loading rescues...': { en: 'Loading rescues...', de: 'Rettungseinsätze werden geladen...' },
  'No rescues in current or last month.': { en: 'No rescues in current or last month.', de: 'Keine Rettungseinsätze im aktuellen oder letzten Monat.' },
  Overview: { en: 'Overview', de: 'Übersicht' },
  Employment: { en: 'Employment', de: 'Beschäftigung' },
  'Time Off': { en: 'Time Off', de: 'Abwesenheit' },
  'Carry over days': { en: 'Carry over days', de: 'Übertragene Tage' },
  'Remaining vacation': { en: 'Remaining vacation', de: 'Resturlaub' },
  'Starting balance': { en: 'Starting balance', de: 'Startsaldo' },
  'Personal & Contact': { en: 'Personal & Contact', de: 'Persönliches & Kontakt' },
  'Financial & Custom': { en: 'Financial & Custom', de: 'Finanzen & Zusatzfelder' },
  Performance: { en: 'Performance', de: 'Leistung' },
  'Performance tools are available after the employee is linked to Kenjo.': {
    en: 'Performance tools are available after the employee is linked to Kenjo.',
    de: 'Performance-Tools sind verfügbar, sobald der Mitarbeiter mit Kenjo verknüpft ist.',
  },
  'PAVE Summary': { en: 'PAVE Summary', de: 'PAVE-Zusammenfassung' },
  'Worked Hours (Last Month)': { en: 'Worked Hours (Last Month)', de: 'Arbeitsstunden (letzter Monat)' },
  'Full Time (Last Month)': { en: 'Full Time (Last Month)', de: 'Sollstunden (letzter Monat)' },
  'Overtime (Last Month)': { en: 'Overtime (Last Month)', de: 'Überstunden (letzter Monat)' },
  'Are you sure you want to deactivate the employee?': {
    en: 'Are you sure you want to deactivate the employee?',
    de: 'Möchten Sie den Mitarbeiter wirklich deaktivieren?',
  },
  'Contract signed': { en: 'Contract signed', de: 'Vertrag unterschrieben' },
  'Add Advance': { en: 'Add Advance', de: 'Vorschuss hinzufügen' },
  'Advances for this month': { en: 'Advances for this month', de: 'Vorschüsse für diesen Monat' },
  'Loading KPI data...': { en: 'Loading KPI data...', de: 'KPI-Daten werden geladen...' },
  'Loading KPI data…': { en: 'Loading KPI data...', de: 'KPI-Daten werden geladen...' },
  'Average KPI:': { en: 'Average KPI:', de: 'Durchschnittlicher KPI:' },
  'Current remaining vacation': { en: 'Current remaining vacation', de: 'Aktueller Resturlaub' },
};
const ANALYTICS_TEXT_BY_SOURCE = {
  'Management intelligence': { en: 'Management intelligence', de: 'Management-Übersicht' },
  'Current section': { en: 'Current section', de: 'Aktueller Bereich' },
  'Recent saved views': { en: 'Recent saved views', de: 'Zuletzt gespeicherte Ansichten' },
  'Executive summary': { en: 'Executive summary', de: 'Management-Zusammenfassung' },
  'Routes completed by day': { en: 'Routes completed by day', de: 'Abgeschlossene Routen pro Tag' },
  'Driver status': { en: 'Driver status', de: 'Fahrerstatus' },
  'Vehicles by status': { en: 'Vehicles by status', de: 'Fahrzeuge nach Status' },
  'Insurance vehicles by status': { en: 'Insurance vehicles by status', de: 'Versicherte Fahrzeuge nach Status' },
  'Routes trend and 7-day projection': { en: 'Routes trend and 7-day projection', de: 'Routentrend und 7-Tage-Prognose' },
  'Routes vs driver capacity': { en: 'Routes vs driver capacity', de: 'Routen im Vergleich zur Fahrerkapazität' },
  'Payroll trend and next-month forecast': { en: 'Payroll trend and next-month forecast', de: 'Payroll-Trend und Prognose für den nächsten Monat' },
  'HR movement trend': { en: 'HR movement trend', de: 'HR-Bewegungstrend' },
  'Performance score trend': { en: 'Performance score trend', de: 'Performance-Score-Trend' },
  'Questions This Section Can Answer': { en: 'Questions This Section Can Answer', de: 'Fragen, die dieser Bereich beantwortet' },
  'Operations volume trend': { en: 'Operations volume trend', de: 'Trend des Operations-Volumens' },
  'Productivity per driver-day': { en: 'Productivity per driver-day', de: 'Produktivität pro Fahrer-Tag' },
  'Attendance trend': { en: 'Attendance trend', de: 'Anwesenheitstrend' },
  'Monthly payroll trend and forecast': { en: 'Monthly payroll trend and forecast', de: 'Monatlicher Payroll-Trend und Prognose' },
  'Bonus vs advances vs deductions': { en: 'Bonus vs advances vs deductions', de: 'Bonus vs. Vorschüsse vs. Abzüge' },
  'Driver active mix': { en: 'Driver active mix', de: 'Aktivitätsmix der Fahrer' },
  'Top drivers by routes': { en: 'Top drivers by routes', de: 'Top-Fahrer nach Routen' },
  'Daily routes trend and next-week forecast': { en: 'Daily routes trend and next-week forecast', de: 'Täglicher Routentrend und Prognose für nächste Woche' },
  'Weekly route projection': { en: 'Weekly route projection', de: 'Wöchentliche Routenprognose' },
  'Overall score trend and projection': { en: 'Overall score trend and projection', de: 'Gesamt-Score-Trend und Prognose' },
  'Key performance drivers': { en: 'Key performance drivers', de: 'Wichtige Leistungstreiber' },
  'Inspection throughput trend': { en: 'Inspection throughput trend', de: 'Trend beim Prüfungsdurchsatz' },
  'Inspection status distribution': { en: 'Inspection status distribution', de: 'Verteilung der Prüfungsstatus' },
  'Fleet status mix': { en: 'Fleet status mix', de: 'Flottenstatus-Mix' },
  'Driver assignment coverage': { en: 'Driver assignment coverage', de: 'Abdeckung der Fahrerzuweisung' },
  'Upcoming workshops': { en: 'Upcoming workshops', de: 'Bevorstehende Werkstatttermine' },
  'Monthly hires vs terminations': { en: 'Monthly hires vs terminations', de: 'Monatliche Einstellungen vs. Kündigungen' },
  'Net movement and next-month projection': { en: 'Net movement and next-month projection', de: 'Netto-Bewegung und Prognose für den nächsten Monat' },
  'Insurance status': { en: 'Insurance status', de: 'Versicherungsstatus' },
  'Premium by status': { en: 'Premium by status', de: 'Prämie nach Status' },
  'Damages by status': { en: 'Damages by status', de: 'Schäden nach Status' },
  'Cases trend (by month)': { en: 'Cases trend (by month)', de: 'Falltrend (pro Monat)' },
  'Expiring documents by type': { en: 'Expiring documents by type', de: 'Auslaufende Dokumente nach Typ' },
  'Expiry timeline': { en: 'Expiry timeline', de: 'Ablauf-Zeitachse' },
  'Total per week': { en: 'Total per week', de: 'Gesamt pro Woche' },
  'Week starting': { en: 'Week starting', de: 'Woche ab' },
  'Total per month': { en: 'Total per month', de: 'Gesamt pro Monat' },
  'Primary table': { en: 'Primary table', de: 'Haupttabelle' },
  'New hires': { en: 'New hires', de: 'Neueinstellungen' },
  'Start date': { en: 'Start date', de: 'Startdatum' },
  'No new hires in this period.': { en: 'No new hires in this period.', de: 'In diesem Zeitraum gibt es keine Neueinstellungen.' },
  Terminations: { en: 'Terminations', de: 'Kündigungen' },
  'Termination date': { en: 'Termination date', de: 'Kündigungsdatum' },
  'No terminations in this period.': { en: 'No terminations in this period.', de: 'In diesem Zeitraum gibt es keine Kündigungen.' },
  'No drilldown data available.': { en: 'No drilldown data available.', de: 'Keine Drilldown-Daten verfügbar.' },
  'View name': { en: 'View name', de: 'Ansichtsname' },
  'Planned Workshop appointments': { en: 'Planned Workshop appointments', de: 'Geplante Werkstatttermine' },
  'Public Intake': { en: 'Public Intake', de: 'Öffentliche Eingänge' },
  'Personalfragebogen pending': { en: 'Personalfragebogen pending', de: 'Personalfragebogen ausstehend' },
  'Open review queue': { en: 'Open review queue', de: 'Offene Prüfwarteschlange' },
  'Schadenmeldung pending': { en: 'Schadenmeldung pending', de: 'Schadenmeldung ausstehend' },
  'Open damage queue': { en: 'Open damage queue', de: 'Offene Schadenswarteschlange' },
  'Latest Personalfragebogen': { en: 'Latest Personalfragebogen', de: 'Letzte Personalfragebogen' },
  'No submissions yet.': { en: 'No submissions yet.', de: 'Noch keine Einreichungen.' },
  'Latest Schadenmeldung': { en: 'Latest Schadenmeldung', de: 'Letzte Schadenmeldung' },
};
const QUESTIONS_TEXT_BY_SOURCE = {
  'How many routes do we complete per day?': { en: 'How many routes do we complete per day?', de: 'Wie viele Routen schließen wir pro Tag ab?' },
  'How many drivers are active each day?': { en: 'How many drivers are active each day?', de: 'Wie viele Fahrer sind pro Tag aktiv?' },
  'What is the routes-per-driver productivity trend?': { en: 'What is the routes-per-driver productivity trend?', de: 'Wie entwickelt sich die Produktivität bei Routen pro Fahrer?' },
  'Which days create the highest operational pressure?': { en: 'Which days create the highest operational pressure?', de: 'An welchen Tagen ist der operative Druck am höchsten?' },
  'Is route volume stable or volatile week to week?': { en: 'Is route volume stable or volatile week to week?', de: 'Ist das Routenvolumen von Woche zu Woche stabil oder volatil?' },
  'What does the next short-term route projection look like?': { en: 'What does the next short-term route projection look like?', de: 'Wie sieht die nächste kurzfristige Routenprognose aus?' },
  'Which drivers completed the most routes?': { en: 'Which drivers completed the most routes?', de: 'Welche Fahrer haben die meisten Routen abgeschlossen?' },
  'What is the active vs inactive driver mix?': { en: 'What is the active vs inactive driver mix?', de: 'Wie verteilt sich der Mix aus aktiven und inaktiven Fahrern?' },
  'Is workload balanced across the driver base?': { en: 'Is workload balanced across the driver base?', de: 'Ist die Arbeitslast über die Fahrerbasis hinweg ausgewogen?' },
  'Which contracts end soon and may affect capacity?': { en: 'Which contracts end soon and may affect capacity?', de: 'Welche Verträge enden bald und können die Kapazität beeinflussen?' },
  'How are newer drivers ramping up?': { en: 'How are newer drivers ramping up?', de: 'Wie entwickeln sich neue Fahrer in der Einarbeitung?' },
  'Do we have enough active driver coverage?': { en: 'Do we have enough active driver coverage?', de: 'Haben wir genügend aktive Fahrerabdeckung?' },
  'How much variable payroll are we paying this month?': { en: 'How much variable payroll are we paying this month?', de: 'Wie viel variable Payroll zahlen wir in diesem Monat?' },
  'Which employees have the highest payouts?': { en: 'Which employees have the highest payouts?', de: 'Welche Mitarbeiter haben die höchsten Auszahlungen?' },
  'How do bonus, deductions and advances compare?': { en: 'How do bonus, deductions and advances compare?', de: 'Wie verhalten sich Bonus, Abzüge und Vorschüsse zueinander?' },
  'What is the monthly payroll trend?': { en: 'What is the monthly payroll trend?', de: 'Wie ist der monatliche Payroll-Trend?' },
  'What is the next-month payroll forecast?': { en: 'What is the next-month payroll forecast?', de: 'Wie lautet die Payroll-Prognose für den nächsten Monat?' },
  'Are advances creating pressure on payouts?': { en: 'Are advances creating pressure on payouts?', de: 'Erzeugen Vorschüsse Druck auf die Auszahlungen?' },
  'How strong is daily attendance over the selected period?': { en: 'How strong is daily attendance over the selected period?', de: 'Wie stark ist die tägliche Anwesenheit im ausgewählten Zeitraum?' },
  'What does presence look like day by day?': { en: 'What does presence look like day by day?', de: 'Wie sieht die Anwesenheit Tag für Tag aus?' },
  'Where do staffing gaps appear?': { en: 'Where do staffing gaps appear?', de: 'Wo entstehen Personallücken?' },
  'Is there a recurring weekly attendance pattern?': { en: 'Is there a recurring weekly attendance pattern?', de: 'Gibt es ein wiederkehrendes wöchentliches Anwesenheitsmuster?' },
  'Which days have the strongest staffing coverage?': { en: 'Which days have the strongest staffing coverage?', de: 'An welchen Tagen ist die Personalabdeckung am stärksten?' },
  'What does the near-term attendance projection show?': { en: 'What does the near-term attendance projection show?', de: 'Was zeigt die kurzfristige Anwesenheitsprognose?' },
  'How many vacation days were taken each month in the selected year?': { en: 'How many vacation days were taken each month in the selected year?', de: 'Wie viele Urlaubstage wurden im ausgewählten Jahr pro Monat genommen?' },
  'Which selected employees used the most vacation days?': { en: 'Which selected employees used the most vacation days?', de: 'Welche ausgewählten Mitarbeiter haben die meisten Urlaubstage genutzt?' },
  'How is vacation load distributed over the year?': { en: 'How is vacation load distributed over the year?', de: 'Wie verteilt sich die Urlaubslast über das Jahr?' },
  'How many sick days were taken each month in the selected year?': { en: 'How many sick days were taken each month in the selected year?', de: 'Wie viele Krankheitstage wurden im ausgewählten Jahr pro Monat genommen?' },
  'Which selected employees had the most sick days?': { en: 'Which selected employees had the most sick days?', de: 'Welche ausgewählten Mitarbeiter hatten die meisten Krankheitstage?' },
  'How is sick-day load distributed over the year?': { en: 'How is sick-day load distributed over the year?', de: 'Wie verteilt sich die Krankheitslast über das Jahr?' },
  'What is the total route volume?': { en: 'What is the total route volume?', de: 'Wie hoch ist das gesamte Routenvolumen?' },
  'What is the route trend over time?': { en: 'What is the route trend over time?', de: 'Wie entwickelt sich der Routentrend im Zeitverlauf?' },
  'How do routes behave on weekly cadence?': { en: 'How do routes behave on weekly cadence?', de: 'Wie verhalten sich Routen im Wochenrhythmus?' },
  'How does volume evolve month over month?': { en: 'How does volume evolve month over month?', de: 'Wie entwickelt sich das Volumen von Monat zu Monat?' },
  'Which days create the highest route spikes?': { en: 'Which days create the highest route spikes?', de: 'An welchen Tagen entstehen die größten Routenspitzen?' },
  'What is the projected route volume for the next weeks?': { en: 'What is the projected route volume for the next weeks?', de: 'Wie hoch ist das prognostizierte Routenvolumen für die nächsten Wochen?' },
  'How is the overall score trending week to week?': { en: 'How is the overall score trending week to week?', de: 'Wie entwickelt sich der Gesamtscore von Woche zu Woche?' },
  'Is safety improving faster than delivery quality?': { en: 'Is safety improving faster than delivery quality?', de: 'Verbessert sich die Sicherheit schneller als die Lieferqualität?' },
  'How is rank at DBX9 moving over time?': { en: 'How is rank at DBX9 moving over time?', de: 'Wie entwickelt sich das Ranking bei DBX9 im Zeitverlauf?' },
  'Which compliance metrics trend down first?': { en: 'Which compliance metrics trend down first?', de: 'Welche Compliance-Metriken verschlechtern sich zuerst?' },
  'Is capacity reliability stable enough?': { en: 'Is capacity reliability stable enough?', de: 'Ist die Kapazitätszuverlässigkeit stabil genug?' },
  'What is the projected score trajectory?': { en: 'What is the projected score trajectory?', de: 'Wie verläuft die prognostizierte Score-Entwicklung?' },
  'How many inspections are we processing over time?': { en: 'How many inspections are we processing over time?', de: 'Wie viele Prüfungen bearbeiten wir im Zeitverlauf?' },
  'What is the inspection status mix?': { en: 'What is the inspection status mix?', de: 'Wie ist der Mix der Prüfungsstatus?' },
  'Are unresolved safety states accumulating?': { en: 'Are unresolved safety states accumulating?', de: 'Häufen sich ungelöste Sicherheitszustände an?' },
  'What is the daily inspection trend?': { en: 'What is the daily inspection trend?', de: 'Wie ist der tägliche Prüfungstrend?' },
  'Is safety throughput speeding up or slowing down?': { en: 'Is safety throughput speeding up or slowing down?', de: 'Wird der Sicherheitsdurchsatz schneller oder langsamer?' },
  'What is the fleet status breakdown?': { en: 'What is the fleet status breakdown?', de: 'Wie ist die Verteilung der Flottenstatus?' },
  'How many cars are missing a driver assignment?': { en: 'How many cars are missing a driver assignment?', de: 'Wie vielen Fahrzeugen fehlt eine Fahrerzuweisung?' },
  'What share of fleet sits in maintenance?': { en: 'What share of fleet sits in maintenance?', de: 'Welcher Anteil der Flotte befindet sich in Wartung?' },
  'How strong is fleet assignment coverage?': { en: 'How strong is fleet assignment coverage?', de: 'Wie stark ist die Abdeckung der Flottenzuweisung?' },
  'Where do idle vehicles or bottlenecks show up?': { en: 'Where do idle vehicles or bottlenecks show up?', de: 'Wo zeigen sich Leerlauf-Fahrzeuge oder Engpässe?' },
  'How many hires and terminations do we have?': { en: 'How many hires and terminations do we have?', de: 'Wie viele Einstellungen und Kündigungen gibt es?' },
  'What is the monthly employee movement trend?': { en: 'What is the monthly employee movement trend?', de: 'Wie ist der monatliche Mitarbeiterbewegungstrend?' },
  'Are we growing or shrinking headcount?': { en: 'Are we growing or shrinking headcount?', de: 'Wächst oder schrumpft die Mitarbeiterzahl?' },
  'Is termination volume increasing?': { en: 'Is termination volume increasing?', de: 'Steigt das Kündigungsvolumen?' },
  'What does the next-month HR projection look like?': { en: 'What does the next-month HR projection look like?', de: 'Wie sieht die HR-Prognose für den nächsten Monat aus?' },
  'Which documents expire in the next 90 days?': { en: 'Which documents expire in the next 90 days?', de: 'Welche Dokumente laufen in den nächsten 90 Tagen ab?' },
  'When do expiry peaks happen?': { en: 'When do expiry peaks happen?', de: 'Wann treten Ablaufspitzen auf?' },
  'Which document types create the biggest compliance risk?': { en: 'Which document types create the biggest compliance risk?', de: 'Welche Dokumenttypen erzeugen das größte Compliance-Risiko?' },
  'How much renewal workload is coming soon?': { en: 'How much renewal workload is coming soon?', de: 'Wie viel Verlängerungsaufwand kommt bald auf uns zu?' },
  'What is the insurance portfolio overview?': { en: 'What is the insurance portfolio overview?', de: 'Wie sieht die Übersicht des Versicherungsportfolios aus?' },
  'Which contracts expire soon?': { en: 'Which contracts expire soon?', de: 'Welche Verträge laufen bald aus?' },
  'Where is data quality weak, like missing VIN?': { en: 'Where is data quality weak, like missing VIN?', de: 'Wo ist die Datenqualität schwach, zum Beispiel bei fehlender VIN?' },
  'Which vehicles have claims and how concentrated are they?': { en: 'Which vehicles have claims and how concentrated are they?', de: 'Welche Fahrzeuge haben Schadensfälle und wie stark konzentrieren sie sich?' },
  'How does premium load vary by status?': { en: 'How does premium load vary by status?', de: 'Wie variiert die Prämienlast nach Status?' },
  'How many damage cases and costs are open?': { en: 'How many damage cases and costs are open?', de: 'Wie viele Schadensfälle und Kosten sind offen?' },
  'Which damage cases are still open?': { en: 'Which damage cases are still open?', de: 'Welche Schadensfälle sind noch offen?' },
  'Where are damage files incomplete?': { en: 'Where are damage files incomplete?', de: 'Wo sind Schadensakten unvollständig?' },
  'What is the trend in monthly damage cases?': { en: 'What is the trend in monthly damage cases?', de: 'Wie entwickelt sich der Trend bei monatlichen Schadensfällen?' },
  'Where do documentation gaps create risk?': { en: 'Where do documentation gaps create risk?', de: 'Wo erzeugen Dokumentationslücken Risiken?' },
};
const SETTINGS_TEXT_BY_SOURCE = {
  'Track who changed what and when.': { en: 'Track who changed what and when.', de: 'Nachverfolgen, wer was wann geändert hat.' },
  'Entity type': { en: 'Entity type', de: 'Entitätstyp' },
  'Role permissions': { en: 'Role permissions', de: 'Rollenberechtigungen' },
  'Feature flag': { en: 'Feature flag', de: 'Feature-Flag' },
  'No audit entries.': { en: 'No audit entries.', de: 'Keine Audit-Einträge.' },
  'Changed by': { en: 'Changed by', de: 'Geändert von' },
  'Audit entry': { en: 'Audit entry', de: 'Audit-Eintrag' },
  'Configure and monitor external integrations. Credentials are not shown.': {
    en: 'Configure and monitor external integrations. Credentials are not shown.',
    de: 'Externe Integrationen konfigurieren und überwachen. Zugangsdaten werden nicht angezeigt.',
  },
  'No integrations. Run seed:settings.': { en: 'No integrations. Run seed:settings.', de: 'Keine Integrationen vorhanden. Bitte seed:settings ausführen.' },
  'Last sync:': { en: 'Last sync:', de: 'Letzte Synchronisierung:' },
  'Test connection': { en: 'Test connection', de: 'Verbindung testen' },
  'Manage system users, roles, and access.': { en: 'Manage system users, roles, and access.', de: 'Systembenutzer, Rollen und Zugriffe verwalten.' },
  'Search by name, email, role...': { en: 'Search by name, email, role...', de: 'Nach Name, E-Mail oder Rolle suchen...' },
  'Search by name, email, role…': { en: 'Search by name, email, role...', de: 'Nach Name, E-Mail oder Rolle suchen...' },
  'All statuses': { en: 'All statuses', de: 'Alle Status' },
  'Last login': { en: 'Last login', de: 'Letzter Login' },
  'Reset pwd': { en: 'Reset pwd', de: 'Passwort zurücksetzen' },
  'Disable login': { en: 'Disable login', de: 'Login deaktivieren' },
  'Enable login': { en: 'Enable login', de: 'Login aktivieren' },
  'No users.': { en: 'No users.', de: 'Keine Benutzer.' },
  'User added': { en: 'User added', de: 'Benutzer hinzugefügt' },
  'Password reset': { en: 'Password reset', de: 'Passwort zurückgesetzt' },
  'User locked': { en: 'User locked', de: 'Benutzer gesperrt' },
  'User unlocked': { en: 'User unlocked', de: 'Benutzer entsperrt' },
  'User deactivated': { en: 'User deactivated', de: 'Benutzer deaktiviert' },
  'User reactivated': { en: 'User reactivated', de: 'Benutzer reaktiviert' },
  'Deactivate this user?': { en: 'Deactivate this user?', de: 'Diesen Benutzer deaktivieren?' },
};

const CARS_AND_DAMAGES_TEXT_BY_SOURCE = {
  'Manage fleet: view, assign drivers, log maintenance, track documents.': {
    en: 'Manage fleet: view, assign drivers, log maintenance, track documents.',
    de: 'Flotte verwalten: Fahrzeuge anzeigen, Fahrer zuweisen, Wartung erfassen und Dokumente verfolgen.',
  },
  'Search cars...': { en: 'Search cars...', de: 'Fahrzeuge suchen...' },
  'Search cars…': { en: 'Search cars...', de: 'Fahrzeuge suchen...' },
  'Press Esc to clear search': { en: 'Press Esc to clear search', de: 'Esc drücken, um die Suche zu löschen' },
  'Vehicle Status': { en: 'Vehicle Status', de: 'Fahrzeugstatus' },
  'Vehicle Type': { en: 'Vehicle Type', de: 'Fahrzeugtyp' },
  'Export Cars': { en: 'Export Cars', de: 'Fahrzeuge exportieren' },
  'No cars found.': { en: 'No cars found.', de: 'Keine Fahrzeuge gefunden.' },
  'Show VIN QR code': { en: 'Show VIN QR code', de: 'VIN-QR-Code anzeigen' },
  'Maintenance due': { en: 'Maintenance due', de: 'Wartung fällig' },
  'Registration expiring within 30 days': { en: 'Registration expiring within 30 days', de: 'Zulassung läuft innerhalb von 30 Tagen ab' },
  'Selected car:': { en: 'Selected car:', de: 'Ausgewähltes Fahrzeug:' },
  'Loading vehicles...': { en: 'Loading vehicles...', de: 'Fahrzeuge werden geladen...' },
  'Loading vehicles…': { en: 'Loading vehicles...', de: 'Fahrzeuge werden geladen...' },
  'No vehicles found for this card.': { en: 'No vehicles found for this card.', de: 'Für diese Karte wurden keine Fahrzeuge gefunden.' },
  'Total Vehicles': { en: 'Total Vehicles', de: 'Fahrzeuge gesamt' },
  'All vehicles in the fleet': { en: 'All vehicles in the fleet', de: 'Alle Fahrzeuge der Flotte' },
  'In Maintenance': { en: 'In Maintenance', de: 'In Wartung' },
  'Vehicles under maintenance': { en: 'Vehicles under maintenance', de: 'Fahrzeuge in Wartung' },
  'Vehicles not available for operations': { en: 'Vehicles not available for operations', de: 'Fahrzeuge nicht für den Betrieb verfügbar' },
  'Without Driver': { en: 'Without Driver', de: 'Ohne Fahrer' },
  'Vehicles without assigned or planned driver': { en: 'Vehicles without assigned or planned driver', de: 'Fahrzeuge ohne zugewiesenen oder geplanten Fahrer' },
  'Expiring Documents': { en: 'Expiring Documents', de: 'Ablaufende Dokumente' },
  'Defleeting Candidates': { en: 'Defleeting Candidates', de: 'Defleeting-Kandidaten' },
  'Vehicles marked for defleeting': { en: 'Vehicles marked for defleeting', de: 'Für Defleeting markierte Fahrzeuge' },
  'Grounded Cars': { en: 'Grounded Cars', de: 'Stillgelegte Fahrzeuge' },
  'Vehicles with grounded status': { en: 'Vehicles with grounded status', de: 'Fahrzeuge mit Status Stillgelegt' },
  'VIN QR code': { en: 'VIN QR code', de: 'VIN-QR-Code' },
  'Manage damages: view, edit, add and upload files per case.': {
    en: 'Manage damages: view, edit, add and upload files per case.',
    de: 'Schäden verwalten: Fälle anzeigen, bearbeiten, hinzufügen und Dateien hochladen.',
  },
  'Search...': { en: 'Search...', de: 'Suchen...' },
  'Search…': { en: 'Search...', de: 'Suchen...' },
  'Add Damage': { en: 'Add Damage', de: 'Schaden hinzufügen' },
  Sort: { en: 'Sort', de: 'Sortieren' },
  'No damage cases.': { en: 'No damage cases.', de: 'Keine Schadensfälle.' },
  'Case Closed': { en: 'Case Closed', de: 'Fall abgeschlossen' },
  'View Damage': { en: 'View Damage', de: 'Schaden ansehen' },
  'Secure channel': { en: 'Secure channel', de: 'Sicherer Kanal' },
  User: { en: 'User', de: 'Benutzer' },
  Message: { en: 'Message', de: 'Nachricht' },
  'System message': { en: 'System message', de: 'Systemnachricht' },
  Chat: { en: 'Chat', de: 'Chat' },
};

const TEXT_BY_SOURCE = {
  ...CORE_TEXT_BY_SOURCE,
  ...EMPLOYEE_TEXT_BY_SOURCE,
  ...ANALYTICS_TEXT_BY_SOURCE,
  ...QUESTIONS_TEXT_BY_SOURCE,
  ...SETTINGS_TEXT_BY_SOURCE,
  ...CARS_AND_DAMAGES_TEXT_BY_SOURCE,
};

function normalizeSourceText(value) {
  return String(value || '')
    .replace(/â€¦/g, '…')
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '–')
    .replace(/â†’/g, '→')
    .replace(/Â·/g, '·')
    .replace(/Ã—/g, '×')
    .replace(/Ã„/g, 'Ä')
    .replace(/Ã–/g, 'Ö')
    .replace(/Ãœ/g, 'Ü')
    .replace(/Ã¤/g, 'ä')
    .replace(/Ã¶/g, 'ö')
    .replace(/Ã¼/g, 'ü')
    .replace(/ÃŸ/g, 'ß');
}

function flattenTranslationLeaves(input, output = {}) {
  if (!input || typeof input !== 'object') return output;
  Object.values(input).forEach((value) => {
    if (typeof value === 'string') {
      const normalized = normalizeSourceText(value).trim();
      if (normalized) {
        output[normalized] = value;
      }
      return;
    }
    if (value && typeof value === 'object') {
      flattenTranslationLeaves(value, output);
    }
  });
  return output;
}

const EN_TRANSLATION_LEAVES = flattenTranslationLeaves(translations.en);
const DE_TRANSLATION_LEAVES = flattenTranslationLeaves(translations.de);

const TRANSLATION_TEXT_BY_SOURCE = Object.entries(EN_TRANSLATION_LEAVES).reduce((accumulator, [englishText]) => {
  const germanText = DE_TRANSLATION_LEAVES[englishText];
  if (germanText && germanText !== englishText) {
    accumulator[englishText] = {
      en: englishText,
      de: germanText,
    };
  }
  return accumulator;
}, {});

const PATTERN_TRANSLATORS = [
  {
    test: /^Edit [—-] /,
    translate: (value, language) => `${language === 'de' ? 'Bearbeiten — ' : 'Edit — '}${value.replace(/^Edit [—-] /, '')}`,
  },
  {
    test: /^Permissions [—-] /,
    translate: (value, language) => `${language === 'de' ? 'Berechtigungen — ' : 'Permissions — '}${value.replace(/^Permissions [—-] /, '')}`,
  },
  {
    test: /^Reset password [—-] /,
    translate: (value, language) => `${language === 'de' ? 'Passwort zurücksetzen — ' : 'Reset password — '}${value.replace(/^Reset password [—-] /, '')}`,
  },
  {
    test: /^Inspection #/,
    translate: (value, language) => (language === 'de' ? value.replace(/^Inspection #/, 'Prüfung #') : value),
  },
  {
    test: /^Difference /,
    translate: (value, language) => (language === 'de' ? value.replace(/^Difference /, 'Abweichung ') : value),
  },
  {
    test: /^New damages: /,
    translate: (value, language) => (language === 'de' ? value.replace(/^New damages: /, 'Neue Schäden: ') : value),
  },
  {
    test: /^Sort by /,
    translate: (value, language) => (language === 'de' ? value.replace(/^Sort by /, 'Sortieren nach ') : value),
  },
  {
    test: /^Current remaining vacation \(\d{4}\)$/,
    translate: (value, language) => (language === 'de' ? value.replace(/^Current remaining vacation/, 'Aktueller Resturlaub') : value),
  },
];

const TEXT_NODE_SOURCE = new WeakMap();
const ATTRIBUTE_SOURCE = new WeakMap();
const ATTRIBUTE_NAMES = ['placeholder', 'title', 'aria-label', 'value'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);

function resolveTranslation(source, language) {
  const normalizedLanguage = normalizePortalLanguage(language);
  const normalizedSource = normalizeSourceText(source);
  const entry = TEXT_BY_SOURCE[normalizedSource] || TRANSLATION_TEXT_BY_SOURCE[normalizedSource];
  if (entry) return entry[normalizedLanguage] || entry.en || source;
  const pattern = PATTERN_TRANSLATORS.find((candidate) => candidate.test.test(normalizedSource));
  if (pattern) return pattern.translate(normalizedSource, normalizedLanguage);
  return source;
}

function translatePreservingWhitespace(rawValue, language) {
  if (!rawValue) return rawValue;
  const leading = rawValue.match(/^\s*/)?.[0] || '';
  const trailing = rawValue.match(/\s*$/)?.[0] || '';
  const trimmed = rawValue.trim();
  if (!trimmed) return rawValue;
  const translated = resolveTranslation(trimmed, language);
  return `${leading}${translated}${trailing}`;
}

function localizeTextNode(node, language) {
  if (!node?.parentElement) return;
  if (SKIP_TAGS.has(node.parentElement.tagName)) return;
  const original = TEXT_NODE_SOURCE.has(node) ? TEXT_NODE_SOURCE.get(node) : node.nodeValue;
  if (!TEXT_NODE_SOURCE.has(node)) {
    TEXT_NODE_SOURCE.set(node, original);
  }
  const translated = translatePreservingWhitespace(original, language);
  if (translated !== node.nodeValue) {
    node.nodeValue = translated;
  }
}

function localizeAttributes(element, language) {
  if (!element || SKIP_TAGS.has(element.tagName)) return;
  let originalValues = ATTRIBUTE_SOURCE.get(element);
  if (!originalValues) {
    originalValues = new Map();
    ATTRIBUTE_SOURCE.set(element, originalValues);
  }

  ATTRIBUTE_NAMES.forEach((attributeName) => {
    if (!element.hasAttribute(attributeName)) return;
    const currentValue = element.getAttribute(attributeName);
    if (!originalValues.has(attributeName)) {
      originalValues.set(attributeName, currentValue);
    }
    const translated = resolveTranslation(originalValues.get(attributeName), language);
    if (translated !== currentValue) {
      element.setAttribute(attributeName, translated);
    }
  });
}

export function applyLegacyUiLocalization(root, language) {
  if (!root || typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, null);
  let currentNode = walker.currentNode;
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      localizeTextNode(currentNode, language);
    } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
      localizeAttributes(currentNode, language);
    }
    currentNode = walker.nextNode();
  }
}
