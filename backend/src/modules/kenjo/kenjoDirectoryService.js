export function getKenjoModuleInfo() {
  return {
    module: 'kenjo',
    status: 'migration-placeholder',
    sources: [
      'legacy/wix/pages/KenjoSync.js',
      'legacy/wix/frontend/lightbox/ConflictTab.js',
      'legacy/wix/backend/kenjo.js',
      'legacy/wix/backend/kenjoEmployees.jsw',
      'legacy/wix/backend/payrollApi.jsw',
    ],
  };
}

const kenjoDirectoryService = {
  getKenjoModuleInfo,
};

export default kenjoDirectoryService;

