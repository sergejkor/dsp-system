import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getRentalDocuments, uploadRentalDocument, getRentalDocumentFile } from '../services/fleetRentalsApi';

const RentalDocuments = forwardRef(function RentalDocuments({ carId, copy: c, onBusyChange, disabled }, ref) {
  const input = useRef(null);
  const uploadType = useRef('handover_protocol');
  const alive = useRef(true);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  async function load() {
    setLoading(true); setError('');
    try {
      const rows = await getRentalDocuments(carId);
      if (alive.current) setDocuments(previous => [...new Map([...previous, ...rows].map(row => [row.id, row])).values()]);
    } catch (err) { if (alive.current) setError(err.message); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { load(); }, [carId]);
  function choose(type) {
    if (uploading || disabled) return;
    uploadType.current = type;
    input.current.click();
  }
  useImperativeHandle(ref, () => ({ uploadProtocol: () => choose('handover_protocol') }));
  async function upload(event) {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    setUploading(true); onBusyChange(true); setError(''); setNotice('');
    const failures = [];
    let count = 0;
    try {
      for (const file of files) {
        if (!file.size || file.size > 15 * 1024 * 1024) { failures.push(`${file.name}: ${c.fileSize}`); continue; }
        try {
          const row = await uploadRentalDocument(carId, file, uploadType.current);
          if (alive.current) setDocuments(rows => [row, ...rows]);
          count++;
        } catch (err) { failures.push(`${file.name}: ${err.message}`); }
      }
      if (alive.current) {
        setError(failures.join('\n'));
        setNotice(count ? c.uploaded.replace('{n}', count) : '');
      }
    } finally { if (alive.current) { setUploading(false); onBusyChange(false); } }
  }
  async function open(file) {
    setOpening(file.id); setError('');
    try {
      const blob = await getRentalDocumentFile(carId, file.id);
      if (alive.current) setPreview({ url: URL.createObjectURL(blob), type: blob.type, name: file.file_name || 'document' });
    } catch (err) { if (alive.current) setError(err.message); }
    finally { if (alive.current) setOpening(null); }
  }
  return <section className="fr-documents">
    <input ref={input} type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={upload} />
    <div className="fr-documents-heading"><h3>{c.documents}</h3><button type="button" className="fr-button" disabled={uploading || disabled} onClick={() => choose('rental_attachment')}>{c.addAttachments}</button></div>
    <p className="fr-help">{c.documentsHelp}</p>
    {loading && <p className="fr-help" role="status">{c.loadingDocuments}</p>}
    {uploading && <p className="fr-help" role="status">{c.uploading}</p>}
    {notice && <p className="fr-notice" role="status">{notice}</p>}
    {error && <div className="fr-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}<button className="fr-button" type="button" disabled={loading || uploading} onClick={load}>{c.refresh}</button></div>}
    {!loading && !documents.length && <p className="fr-help">{c.noDocuments}</p>}
    <ul className="fr-document-list">{documents.map(file => <li key={file.id}><div><strong>{file.file_name || file.document_type}</strong><small>{file.document_type === 'handover_protocol' ? 'Übergabeprotokoll' : file.document_type}</small></div>
      <button className="fr-button" type="button" disabled={!file.has_file || opening != null} onClick={() => open(file)}>{opening === file.id ? c.loadingDocuments : file.has_file ? c.viewDocument : c.fileUnavailable}</button></li>)}</ul>
    {preview && <div className="fr-file-preview"><div className="fr-documents-heading"><strong>{preview.name}</strong><div><a className="fr-button" href={preview.url} download={preview.name}>{c.download}</a><button className="fr-button" type="button" onClick={() => setPreview(null)}>{c.close}</button></div></div>
      {preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.name} /> : preview.type === 'application/pdf' ? <iframe src={preview.url} title={preview.name} /> : <p className="fr-help">{c.downloadToView}</p>}
    </div>}
  </section>;
});
export default RentalDocuments;
