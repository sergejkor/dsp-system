
import { Permissions, webMethod } from 'wix-web-module';
import { purgeMonthData } from 'backend/jobs/purgeMonthlyData';

export const resetSelectedMonth = webMethod(
  Permissions.Admin,
  async (year, monthIndex0) => {
    return await purgeMonthData(year, monthIndex0);
  }
);
