
import { storeExcelToDailyUploadRows } from "backend/excelParser";
import { parseAndStoreTimeChecks } from "backend/timechecks";

export async function DailyUploads_afterInsert(item, context) {
  console.log("HOOK START DailyUploads_afterInsert", item?._id);
  try {
    const r = await storeExcelToDailyUploadRows(item);
    console.log("HOOK OK storeExcelToDailyUploadRows inserted:", r?.inserted);
    await parseAndStoreTimeChecks(item);
    console.log("HOOK OK parseAndStoreTimeChecks finished");
  } catch (e) {
    console.error("HOOK ERROR", e);
  }
  return item;
}

export async function DailyUploads_afterUpdate(item, context) {
  console.log("HOOK START DailyUploads_afterUpdate", item?._id);
  try {
    const r = await storeExcelToDailyUploadRows(item);
    console.log("HOOK OK storeExcelToDailyUploadRows inserted:", r?.inserted);
    await parseAndStoreTimeChecks(item);
    console.log("HOOK OK parseAndStoreTimeChecks finished (update)");
  } catch (e) {
    console.error("HOOK ERROR (update)", e);
  }
  return item;
}
