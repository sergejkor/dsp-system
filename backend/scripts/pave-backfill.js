import 'dotenv/config';
import { backfillPaveReports } from '../src/modules/pave/paveBackfillService.js';

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    const a = String(raw || '');
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    out[k] = v == null ? true : v;
  }
  return out;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const dateFrom = args.from || args.dateFrom || null;
  const dateTo = args.to || args.dateTo || null;
  const maxEmails = Number(args.max || args.maxEmails || 500);
  const reprocessExisting = ['1', 'true', 'yes', 'on'].includes(String(args.reprocess || 'false').toLowerCase());

  const result = await backfillPaveReports({
    dateFrom,
    dateTo,
    maxEmails,
    provider: 'pave',
    sender: args.sender || '',
    subjectContains: args.subject || '',
    reprocessExisting,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

run().catch((err) => {
  console.error('pave-backfill failed:', err?.message || err);
  process.exit(1);
});

