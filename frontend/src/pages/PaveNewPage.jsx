import { useEffect } from 'react';

export default function PaveNewPage() {

  useEffect(() => {
    const WIDGET_SCRIPT_SRC = 'https://dashboard.paveapi.com/js/launch-widget.js';
    const CONTAINER_ID = 'pave-widget-container';
    const WIDGET_SRC = 'https://dashboard.paveapi.com/widget/33c11572-326b-4151-98ea-f39db6d56dcc';

    function initWidget() {
      if (typeof window === 'undefined') return;
      if (window.__paveWidgetInitialized) return;
      if (typeof window.initPAVELauncher === 'function') {
        try {
          const container = document.getElementById(CONTAINER_ID);
          if (container) container.innerHTML = '';
          window.initPAVELauncher({
            container: CONTAINER_ID,
            src: WIDGET_SRC,
          });
          window.__paveWidgetInitialized = true;
        } catch {
          // ignore widget init errors to avoid breaking page
        }
      }
    }

    const existing = document.querySelector(`script[src="${WIDGET_SCRIPT_SRC}"]`);
    if (existing) {
      initWidget();
      return;
    }

    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_SRC;
    script.async = true;
    script.onload = initWidget;
    document.body.appendChild(script);

    // no cleanup: widget script can stay globally
  }, []);

  return (
    <section className="card">
      <h2>New PAVE Inspection</h2>
      <p className="muted">Use the PAVE widget below to create a new inspection session.</p>
      <div id="pave-widget-container" style={{ marginBottom: '1rem' }} />
    </section>
  );
}
