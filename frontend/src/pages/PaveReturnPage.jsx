import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

/** Redirect /pave/return/:sessionKey to /pave?return=sessionKey so list can highlight or open the session. */
export default function PaveReturnPage() {
  const { sessionKey } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/pave?return=${encodeURIComponent(sessionKey || '')}`, { replace: true });
  }, [sessionKey, navigate]);
  return <p>Redirecting…</p>;
}
