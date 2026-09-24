import 'dotenv/config';
import { syncAtlasEmails } from '../src/modules/atlas/atlasSyncService.js';

try {
  const result = await syncAtlasEmails();
  console.log('[atlas] sync completed');
  console.log(`emailsScanned: ${result.emailsScanned}`);
  console.log(`emailsMatched: ${result.emailsMatched}`);
  console.log(`emailsImported: ${result.emailsImported}`);
  console.log(`shipmentsImported: ${result.shipmentsImported}`);
  console.log(`routes: ${result.routes}`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`[atlas] ${error.messageId || 'email'}: ${error.error}`);
    process.exitCode = 1;
  }
} catch (error) {
  const message = String(error?.message || error);
  console.error(`[atlas] sync failed: ${message.replaceAll(String(process.env.ATLAS_IMAP_PASSWORD || '\0'), '[redacted]')}`);
  process.exitCode = 1;
}
