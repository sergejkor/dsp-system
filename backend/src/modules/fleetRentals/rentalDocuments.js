import { query } from '../../db.js';
import { rentalError } from './rentalValidation.js';

export function documentMime(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString())) return 'image/gif';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}

export async function listRentalDocuments(carId) {
  const result = await query(`SELECT id, document_type, file_name, created_at,
    (file_content IS NOT NULL) AS has_file FROM car_documents WHERE car_id = $1 ORDER BY created_at DESC, id DESC`, [carId]);
  return result.rows;
}

export async function addRentalDocument(carId, file, type) {
  if (!file?.buffer?.length) throw rentalError('Choose a non-empty file.');
  if (!['handover_protocol', 'rental_attachment'].includes(type)) throw rentalError('Invalid document type.');
  const originalName = String(file.originalname || 'document');
  const decodedName = Buffer.from(originalName, 'latin1').toString('utf8');
  const name = (decodedName.includes('\uFFFD') || /[^\u0000-\u00ff]/.test(originalName) ? originalName : decodedName)
    .replace(/[\r\n\x00-\x1f]/g, '').slice(0, 255);
  const result = await query(`INSERT INTO car_documents (car_id, document_type, file_content, file_name)
    SELECT id, $2, $3, $4 FROM cars WHERE id = $1
    RETURNING id, document_type, file_name, created_at, true AS has_file`, [carId, type, file.buffer, name]);
  if (!result.rows[0]) throw rentalError('Vehicle not found.', 404);
  return result.rows[0];
}

export async function readRentalDocument(carId, docId) {
  const result = await query(`SELECT file_name, file_content FROM car_documents WHERE car_id = $1 AND id = $2`, [carId, docId]);
  const file = result.rows[0];
  if (!file?.file_content) throw rentalError('Document not found.', 404);
  return file;
}
