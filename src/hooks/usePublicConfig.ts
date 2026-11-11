// The public, browser-safe config (`GET /api/config/public`): the map browser key and the repo link (REQ-02-01,
// REQ-05-01). Read once per mount; a failure reads as "no key", so the map draws the SVG plot without an error.
import { useEffect, useState } from 'react';
import type { PublicConfig } from '@/shared/types';
import { api } from './useApi';

const EMPTY: PublicConfig = { repoUrl: null, googleMapsBrowserKey: null };

/** `undefined` while loading, then the config. */
export function usePublicConfig(): PublicConfig | undefined {
  const [config, setConfig] = useState<PublicConfig | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api
      .get<PublicConfig>('/api/config/public')
      .catch(() => EMPTY)
      .then((c) => {
        if (live) setConfig(c);
      });
    return () => {
      live = false;
    };
  }, []);
  return config;
}
