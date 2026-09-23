import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool } from '../../../db.js';
import router from '../fleetRentalsRoutes.js';
import { documentMime } from '../rentalDocuments.js';

test('preview types are inferred from file content; HTML never becomes a preview', () => {
  assert.equal(documentMime(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(documentMime(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(documentMime(Buffer.from([255,216,255])), 'image/jpeg');
  assert.equal(documentMime(Buffer.from('<svg onload="alert(1)">')), 'application/octet-stream');
  assert.equal(documentMime(Buffer.alloc(0)), 'application/octet-stream');
});

test('documents API stores multiple files in car documents and enforces vehicle ownership', async () => {
  const original = pool.query;
  const stored = [];
  pool.query = async (sql, values) => {
    if (sql.startsWith('INSERT')) {
      const [car_id, document_type, file_content, file_name] = values;
      const row = { id: stored.length + 1, car_id, document_type, file_content, file_name, has_file: true };
      stored.push(row);
      const { file_content: _, ...metadata } = row;
      return { rows: [metadata] };
    }
    if (sql.startsWith('SELECT file_name')) return { rows: stored.filter(row => row.car_id === values[0] && row.id === values[1]) };
    return { rows: stored.filter(row => row.car_id === values[0]).map(({ file_content, ...row }) => row) };
  };
  const app = express();
  app.use((req, _res, next) => { req.user = { role_code: 'super_admin' }; next(); });
  app.use('/rentals', router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/rentals`;
  try {
    for (const type of ['handover_protocol', 'rental_attachment']) {
      const body = new FormData();
      body.append('file', new Blob(['%PDF-1.7\nTEST']), 'Übergabe.pdf');
      body.append('document_type', type);
      const result = await fetch(`${base}/7/documents`, { method: 'POST', body });
      assert.equal(result.status, 201);
      assert.equal((await result.json()).file_name, 'Übergabe.pdf');
    }
    const listing = await (await fetch(`${base}/7/documents`)).json();
    assert.equal(listing.length, 2);
    const file = await fetch(`${base}/7/documents/1`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await file.text(), '%PDF-1.7\nTEST');
    assert.equal((await fetch(`${base}/8/documents/1`)).status, 404);
    assert.equal((await fetch(`${base}/invalid/documents`)).status, 400);
    const tooLarge = new FormData();
    tooLarge.append('file', new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]), 'large.pdf');
    tooLarge.append('document_type', 'handover_protocol');
    assert.equal((await fetch(`${base}/7/documents`, { method: 'POST', body: tooLarge })).status, 400);
    assert.equal(stored.length, 2);
  } finally {
    pool.query = original;
    await new Promise(resolve => server.close(resolve));
  }
});
