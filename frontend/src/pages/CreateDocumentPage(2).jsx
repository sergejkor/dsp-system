import { Link } from 'react-router-dom';

export default function CreateDocumentPage() {
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ marginBottom: '0.35rem' }}>Create Document</h2>
        <p className="muted" style={{ margin: 0, maxWidth: '56rem' }}>
          This page is now available in the sidebar. The next step is the document generator flow with employee
          selection, template selection, contract dates and automatic download of the created file.
        </p>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '1rem 1.1rem',
          background: '#f8fafc',
          maxWidth: '52rem',
        }}
      >
        <strong>Templates are already managed here:</strong>
        <p style={{ margin: '0.55rem 0 0' }}>
          Open <Link to="/settings/create-documents">Settings → Create Document</Link> to upload template files,
          write explanations and manage the samples that will be used for document generation.
        </p>
      </div>
    </section>
  );
}
