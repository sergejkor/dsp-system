/**
 * JSDoc shapes for dashboard API (backend uses plain JS).
 * @typedef {Object} DashboardSummary
 * @property {string} generatedAt
 * @property {object} overview - same shape as GET /api/analytics/overview
 * @property {Record<string, unknown>} paveInspections
 * @property {null | { range: { start: string, end: string }, kpis: Array<{ key: string, value: unknown, label: string, format?: string }>, openCasesPreview: object[] }} damagesLast90
 * @property {object[]} recentPaveReports
 * @property {object[]} recentFines
 * @property {Array<{ id: number, vehicle_id?: string, license_plate?: string, planned_workshop_name?: string, planned_workshop_from?: string, planned_workshop_to?: string }>} recentWorkshopAppointments
 */

export {};
