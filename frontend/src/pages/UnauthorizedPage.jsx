import React from 'react';
import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="unauthorized-page card">
      <h2>Access denied</h2>
      <p>You don&apos;t have permission to view this page.</p>
      <Link to="/">Go to home</Link>
      <style>{`
        .unauthorized-page { max-width: 480px; margin: 2rem auto; text-align: center; }
        .unauthorized-page h2 { color: #b91c1c; }
        .unauthorized-page a { display: inline-block; margin-top: 1rem; color: #2563eb; }
      `}</style>
    </div>
  );
}
