// Any path that is not a Nearby page: the banner and header still show (spec 3.11.1; ruling 14).
import { Link } from 'react-router-dom';
import { PageShell } from '@/components/layout/PageShell';

export function NotFoundPage() {
  return (
    <PageShell side="public" mainClassName="pt-8">
      <h1 className="font-display text-4xl font-bold">Page not found</h1>
      <p className="mt-2 text-body-text">
        This page is not part of Nearby. <Link to="/" className="inline-flex min-h-touch items-center">Go to the home page</Link>
      </p>
    </PageShell>
  );
}
