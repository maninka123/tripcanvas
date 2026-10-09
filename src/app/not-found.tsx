import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <main id="main" className="page" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 96 }}>
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden><Compass size={26} /></div>
        <h1 className="display" style={{ fontSize: 40 }}>We couldn’t find that</h1>
        <p>The trip may have been deleted, or it hasn’t been shared with this account.</p>
        <Link className="btn btn-primary" href="/">Back to My Trips</Link>
      </div>
    </main>
  );
}
