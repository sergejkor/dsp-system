
function rebuildAll() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    logEvent('rebuildAll', 'INFO', 'START');
    syncKenjoEmployees();
    syncKPIFromGoogleSheet();
    syncWorkedDaysFromKenjo();
    syncWorkedDaysMonthFromKenjo();
    buildEmployeeMaster();
    buildWeeklyFacts();
    buildEmployeeCard();
    buildWixExport();
    logEvent('rebuildAll', 'INFO', 'DONE');
  } catch (error) {
    logError('rebuildAll', error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function rebuildCalculationsOnly() {
  try {
    logEvent('rebuildCalculationsOnly', 'INFO', 'START');
    buildEmployeeMaster();
    buildWeeklyFacts();
    buildEmployeeCard();
    buildWixExport();
    logEvent('rebuildCalculationsOnly', 'INFO', 'DONE');
  } catch (error) {
    logError('rebuildCalculationsOnly', error);
    throw error;
  }
}

function syncSourcesOnly() {
  try {
    logEvent('syncSourcesOnly', 'INFO', 'START');
    syncKenjoEmployees();
    syncKPIFromGoogleSheet();
    syncWorkedDaysFromKenjo();
    logEvent('syncSourcesOnly', 'INFO', 'DONE');
  } catch (error) {
    logError('syncSourcesOnly', error);
    throw error;
  }
}
