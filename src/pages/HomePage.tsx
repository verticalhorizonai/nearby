// Home (F6.1; REQ-05-01; spec 3.11.1; design/home.html). Not a marketing site: it introduces the demonstration, in
// this order: header and hero, Two sides, How the demo works, What is real and what is sample, How to test, footer.
// The footer's source link appears only when `GET /api/config/public` returns `repoUrl` (task 75).
import type { MouseEvent, ReactNode } from 'react';
import { ArrowRight, CalendarDays, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageShell } from '@/components/layout/PageShell';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { HeroDrawing } from '@/components/home/HeroDrawing';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MCP_PATH } from '@/shared/types';

const label = 'text-label uppercase text-secondary-text';
const sectionHeading = 'font-display text-4xl font-bold leading-tight tracking-[-0.015em]'; // 36 px at every width (3.11.2)

/** "How it works" scrolls to section 3, smoothly unless the visitor asks for reduced motion (REQ-08-03). */
function useScrollTo(id: string) {
  const reduced = useReducedMotion();
  return (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(id);
    if (!target || typeof target.scrollIntoView !== 'function') return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
  };
}

function Dot({ tone }: { tone: 'accent' | 'primary' }) {
  return <span aria-hidden="true" className={cn('mt-2 h-2 w-2 flex-none rounded-full', tone === 'accent' ? 'bg-accent-pink' : 'bg-primary')} />;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-3">
      <div className="font-display text-[44px] font-extrabold leading-none text-primary" aria-hidden="true">
        {n}
      </div>
      <h3 className="text-[19px] font-bold">{title}</h3>
      <p className="text-body-text">{children}</p>
    </li>
  );
}

export function HomePage() {
  const config = usePublicConfig();
  const toHow = useScrollTo('how');
  const toSample = useScrollTo('sample');
  // The MCP server lives on this same origin (build ruling 42).
  const mcpAddress = `${typeof window === 'undefined' ? '' : window.location.origin}${MCP_PATH}`;
  const tryDemo = cn(buttonVariants(), 'no-underline hover:text-primary-foreground text-primary-foreground');

  return (
    <PageShell
      side="public"
      bare
      header={
        <SiteHeader>
          <nav aria-label="Home sections" className="flex flex-wrap items-center gap-x-7 gap-y-1 text-[15px] font-medium">
            <a href="#how" onClick={toHow} className="flex min-h-touch items-center text-foreground no-underline hover:text-primary">
              How it works
            </a>
            <a href="#sample" onClick={toSample} className="flex min-h-touch items-center text-foreground no-underline hover:text-primary">
              What is sample
            </a>
          </nav>
          <Link to="/seats" className={tryDemo}>
            Try the demo
          </Link>
        </SiteHeader>
      }
    >
      {/* 1. Hero */}
      <section aria-labelledby="hero-heading" className="mx-auto flex max-w-content flex-wrap items-center gap-14 px-4 pb-[72px] pt-6 sm:px-8 sm:pt-10">
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-[22px]">
          <p className={cn(label, 'flex items-center gap-2')}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-pink" />
            An AI agent for local offers, paid with PayPal
          </p>
          <h1 id="hero-heading" className="font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.025em] sm:text-[60px]">
            The deal that is already on your way.
          </h1>
          <p className="max-w-[520px] text-lg leading-[1.55] text-body-text sm:text-[19px]">
            Nearby reads where your calendar takes you this week, finds one or two offers that fit each stop, and tells you why in a sentence. Say
            yes once and it pays with PayPal.
          </p>
          <div className="flex flex-wrap gap-3.5 pt-1.5">
            <Link to="/seats" className={cn(tryDemo, 'min-h-[56px] px-7 text-[17px]')}>
              Try the demo
              <ArrowRight className="!size-[18px]" strokeWidth={2.4} aria-hidden="true" />
            </Link>
            <a
              href="#how"
              onClick={toHow}
              className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-[56px] px-7 text-[17px] text-foreground no-underline hover:text-foreground')}
            >
              How it works
            </a>
          </div>
          <p className="text-sm text-secondary-text">No account and no setup. One tap puts you in a seat.</p>
        </div>
        <HeroDrawing />
      </section>

      {/* 2. Two sides */}
      <section aria-labelledby="sides-heading" className="border-y border-border bg-card">
        <div className="mx-auto flex max-w-content flex-col gap-8 px-4 py-[72px] sm:px-8">
          <div className="flex flex-col gap-2">
            <p className={label}>Two sides, one loop</p>
            <h2 id="sides-heading" className={sectionHeading}>
              A shopper says yes. A shop sees the sale.
            </h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-6">
            <div className="flex flex-col gap-3.5 rounded-section border border-border bg-background p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-panel bg-primary text-primary-foreground">
                <CalendarDays className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="font-display text-2xl font-bold">Shopper</h3>
              <p className="text-body-text">
                Connect the demo calendar, see up to two picks for each appointment with a one-sentence reason, say yes, and pay in the PayPal sandbox.
              </p>
            </div>
            <div className="flex flex-col gap-3.5 rounded-section border border-border bg-background p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-panel bg-accent-pink text-primary-foreground">
                <Store className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="font-display text-2xl font-bold">Merchant</h3>
              <p className="text-body-text">Post an offer in a minute and watch sales arrive as shoppers buy.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. How the demo works */}
      <section id="how" aria-labelledby="how-heading" className="mx-auto flex max-w-content scroll-mt-4 flex-col gap-8 px-4 py-[72px] sm:px-8">
        <div className="flex flex-col gap-2">
          <p className={label}>How the demo works</p>
          <h2 id="how-heading" className={sectionHeading}>
            Three steps, about two minutes.
          </h2>
        </div>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-6 p-0">
          <Step n={1} title="Choose a seat">
            One tap puts you in the shopper&rsquo;s week or behind a sample merchant&rsquo;s counter.
          </Step>
          <Step n={2} title="Say yes to a pick">
            As the shopper, say yes to a pick and approve it on PayPal&rsquo;s sandbox page.
          </Step>
          <Step n={3} title="Watch the sale arrive">
            Switch seat to that merchant and see the sale on its dashboard. Open the merchant in a second window to watch it arrive.
          </Step>
        </ol>
      </section>

      {/* 4. What is real and what is sample; 5. How to test */}
      <div id="sample" className="mx-auto grid max-w-content scroll-mt-4 grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-6 px-4 pb-20 sm:px-8">
        <section aria-labelledby="sample-heading" className="flex flex-col gap-4 rounded-section border border-border bg-card p-8">
          <h2 id="sample-heading" className="font-display text-[26px] font-bold">
            What is real and what is sample
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-body-text">
            <li className="flex gap-3">
              <Dot tone="accent" />
              The merchants and offers are made up.
            </li>
            <li className="flex gap-3">
              <Dot tone="accent" />
              The appointments come from a demo calendar.
            </li>
            <li className="flex gap-3">
              <Dot tone="primary" />
              The places on the map are real places from Google, shown for context.
            </li>
            <li className="flex gap-3">
              <Dot tone="primary" />
              The agent is Claude. It chooses among matched offers and writes each reason.
            </li>
            <li className="flex gap-3">
              <Dot tone="primary" />
              Payments are PayPal sandbox payments.
            </li>
          </ul>
        </section>
        <section aria-labelledby="test-heading" className="flex flex-col justify-between gap-4 rounded-section bg-banner p-8 text-background" data-testid="how-to-test">
          <div className="flex flex-col gap-3">
            <h2 id="test-heading" className="font-display text-[26px] font-bold">
              How to test
            </h2>
            <p className="text-on-dark-muted">
              Pay with the PayPal sandbox buyer account given in the testing notes of the submission. No real card or account is needed.
            </p>
          </div>
          <Link
            to="/seats"
            className="flex min-h-touch items-center self-start rounded-full bg-background px-[26px] font-semibold text-foreground no-underline transition-colors duration-150 hover:bg-tint hover:text-foreground"
          >
            Try the demo
          </Link>
        </section>
      </div>

      {/* Bring your own agent (build ruling 42): the public MCP server and what an assistant can and cannot do. */}
      <section aria-labelledby="agent-heading" className="mx-auto flex max-w-content flex-col gap-4 px-4 pb-20 sm:px-8" data-testid="bring-your-own-agent">
        <div className="flex flex-col gap-2">
          <p className={label}>For AI assistants</p>
          <h2 id="agent-heading" className={sectionHeading}>
            Bring your own agent
          </h2>
        </div>
        <p className="max-w-[720px] text-body-text">
          Any assistant that speaks MCP can search Nearby&rsquo;s sample offers. Add this address to your MCP client as a Streamable HTTP
          server; there is no sign-in.
        </p>
        <code className="block max-w-full self-start overflow-x-auto rounded-panel border border-border bg-card px-4 py-3 text-[15px] font-semibold" data-testid="mcp-address">
          {mcpAddress}
        </code>
        <ul className="m-0 flex max-w-[720px] list-none flex-col gap-3 p-0 text-body-text">
          <li className="flex gap-3">
            <Dot tone="primary" />
            <span>
              <strong className="font-semibold text-foreground">find_offers_near</strong> gives the offers Nearby would show for a place and a
              start time, matched by the same rules as the app.
            </span>
          </li>
          <li className="flex gap-3">
            <Dot tone="primary" />
            <span>
              <strong className="font-semibold text-foreground">get_offer</strong> gives one offer&rsquo;s details.
            </span>
          </li>
          <li className="flex gap-3">
            <Dot tone="accent" />
            <span>Neither tool can buy. Your assistant hands you a link; you open it, tap Yes in Nearby and approve the payment on PayPal.</span>
          </li>
        </ul>
      </section>

      {/* 6. Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-content flex-wrap justify-between gap-3 px-4 py-7 text-sm text-secondary-text sm:px-8">
          <span>Sample data notice: every merchant, offer and appointment in this demo is made up.</span>
          {config?.repoUrl && (
            <a href={config.repoUrl} className="inline-flex min-h-touch items-center font-semibold" rel="noopener">
              Source repository
            </a>
          )}
        </div>
      </footer>
    </PageShell>
  );
}
