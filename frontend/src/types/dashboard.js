/**
 * @typedef {Object} DashboardSummary
 * @property {string} generatedAt
 * @property {{
 *   period: { start: string, end: string },
 *   kpis: Array<{ key: string, value: unknown, label?: string, format?: string }>,
 *   charts: {
 *     routesByDay: Array<{ date?: string, count?: number }>,
 *     driverStatusDistribution: Array<{ label: string, value: number }>,
 *     vehiclesByStatus: Array<{ status: string, count: number }>,
 *     insuranceVehiclesByStatus: Array<{ label: string, value: number }>,
 *   }
 * }} overview
 * @property {Record<string, number|null>} paveInspections
 * @property {null | {
 *   range: { start: string, end: string },
 *   kpis: Array<{ key: string, value: unknown, label?: string, format?: string }>,
 *   openCasesPreview: object[],
 * }} damagesLast90
 * @property {object[]} recentPaveReports
 * @property {object[]} recentFines
 */

export {};
