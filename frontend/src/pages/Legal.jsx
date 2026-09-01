import React from "react";
import { Link } from "react-router-dom";
import { Stamp } from "lucide-react";

const UPDATED = "1 September 2026";
const COMPANY = "Xanre Tech LTD";
const CONTACT = "xanretech@gmail.com";

const TERMS = (
  <>
    <p>
      VisaScout is operated by {COMPANY} ("we", "us"). By creating an account or using the
      service you agree to these terms.
    </p>
    <h2>What VisaScout is</h2>
    <p>
      VisaScout runs live searches of official government and embassy sources and structures the
      results into a summary, document checklist, fees, processing times and citations. It is an
      <b> informational research tool only. It is not legal advice, not immigration advice, and not a
      guarantee of any visa outcome.</b> Always confirm requirements with the relevant official
      authority before you apply or travel. We are not liable for decisions made, or losses
      incurred, in reliance on VisaScout output.
    </p>
    <h2>Accounts</h2>
    <p>
      You are responsible for activity under your account and for keeping your password secure.
      One person per account. We may suspend accounts that abuse the service, attempt to
      circumvent usage limits, or use it unlawfully.
    </p>
    <h2>Plans and payment</h2>
    <p>
      The Free plan includes a limited number of live lookups. Pro is a recurring subscription
      billed through Stripe that unlocks unlimited lookups, re-checks, PDF export and
      outdated-search email alerts. Prices are shown before you pay. Subscriptions renew
      automatically until cancelled; you can cancel anytime from Settings → Manage billing.
    </p>
    <h2>Acceptable use</h2>
    <p>
      Do not scrape, resell, or bulk-automate the service, attempt to break authentication or
      billing, or submit content that is unlawful. We may rate-limit or block requests to protect
      the service.
    </p>
    <h2>Availability and changes</h2>
    <p>
      The service is provided "as is". Live sources and third-party APIs can be unavailable or
      change without notice. We may update these terms; material changes will be notified by email
      or in-app. Continued use after a change means you accept it.
    </p>
    <h2>Contact</h2>
    <p>Questions about these terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
  </>
);

const PRIVACY = (
  <>
    <p>
      {COMPANY} is the data controller for VisaScout. This notice explains what we collect and why.
      Contact: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
    </p>
    <h2>What we collect</h2>
    <ul>
      <li><b>Account data</b> — your name, email and a hashed password (or Google profile basics if you sign in with Google).</li>
      <li><b>Search data</b> — the nationality, residence, destination and purpose you enter, and the results returned, so you can revisit and re-run them.</li>
      <li><b>Billing data</b> — handled by Stripe. We store your Stripe customer ID and subscription status, not your card details.</li>
      <li><b>Technical data</b> — IP address and browser user-agent, used for security, rate-limiting and abuse prevention.</li>
      <li><b>Product analytics</b> — privacy-friendly, aggregated usage events (e.g. page views, "lookup started") via Vercel Analytics. No cross-site tracking cookies.</li>
    </ul>
    <h2>Why we can use it (legal bases)</h2>
    <p>
      To provide the service you asked for (contract); to secure and improve it (legitimate
      interests); to take payment (contract); and to meet legal obligations.
    </p>
    <h2>Who we share it with (processors)</h2>
    <ul>
      <li>Hosting &amp; database: our cloud host and MongoDB.</li>
      <li>Payments: Stripe.</li>
      <li>Live lookups: the search runs through Anthropic and/or Google AI to query and structure official sources. Your query text is sent to that provider for the duration of the lookup.</li>
      <li>Email: Resend (for outdated-search alerts and feedback delivery).</li>
      <li>Analytics: Vercel.</li>
    </ul>
    <p>We do not sell your personal data.</p>
    <h2>Retention</h2>
    <p>
      Account and search data are kept while your account is active. Delete individual searches
      anytime; email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> to delete your account and
      associated data. Security logs are kept for a short period then automatically purged.
    </p>
    <h2>Your rights</h2>
    <p>
      You can request access, correction, deletion, or a copy of your data, and object to certain
      processing. Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. If you are in the UK/EEA you
      can also complain to your data protection authority (in the UK, the ICO).
    </p>
  </>
);

const REFUND = (
  <>
    <p>
      VisaScout Pro is a monthly subscription billed through Stripe.
    </p>
    <h2>Cancelling</h2>
    <p>
      You can cancel anytime from <b>Settings → Manage billing</b>. Your Pro access continues until
      the end of the current billing period; you are not charged again after that.
    </p>
    <h2>Refunds</h2>
    <p>
      We do not offer partial refunds for time already elapsed in a billing period. If you were
      charged in error, charged after cancelling, or the service was materially unavailable for an
      extended period, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> within 14 days and we will
      review and, where appropriate, refund the affected charge.
    </p>
    <h2>Free plan</h2>
    <p>The Free plan involves no payment and nothing to refund.</p>
  </>
);

const PAGES = {
  terms: { title: "Terms of Service", body: TERMS },
  privacy: { title: "Privacy Policy", body: PRIVACY },
  refund: { title: "Refund & Cancellation Policy", body: REFUND },
};

export default function Legal({ type }) {
  const page = PAGES[type] || PAGES.terms;
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-16 flex items-center">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="h-9 w-9 grid place-items-center bg-forest text-paper stamp-border">
              <Stamp className="h-4 w-4" />
            </span>
            <span className="font-serif text-xl text-forest tracking-tight">VisaScout</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">Legal</p>
        <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-2">{page.title}</h1>
        <p className="text-xs text-muted2 mt-2">Last updated {UPDATED}</p>

        <div className="legal-body mt-8 space-y-4 text-sm text-ink/85 leading-relaxed
          [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-forest [&_h2]:mt-8 [&_h2]:mb-2
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-forest [&_a]:underline">
          {page.body}
        </div>

        <div className="mt-12 pt-6 border-t border-line flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted2">
          <Link to="/terms" className="hover:text-forest">Terms</Link>
          <Link to="/privacy" className="hover:text-forest">Privacy</Link>
          <Link to="/refund" className="hover:text-forest">Refunds</Link>
          <a href={`mailto:${CONTACT}`} className="hover:text-forest">{CONTACT}</a>
        </div>
      </main>
    </div>
  );
}
