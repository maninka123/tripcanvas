'use client';

import { useEffect } from 'react';

/** Marks the document once React is interactive (used by end-to-end tests and print styles). */
export function HydrationMarker() {
  useEffect(() => { document.documentElement.dataset.ready = 'true'; }, []);
  return null;
}
