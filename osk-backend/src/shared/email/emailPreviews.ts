import { renderEmailTemplate } from './emailTemplates';
import type { EmailTemplateKey } from '../../modules/email/emailSettings.model';
import type { PreviewableEmailType } from './notificationEmails';

/**
 * Sample-data renderer for the admin's email preview pane.
 *
 * Each entry mirrors the real send helper in `notificationEmails.ts`
 * but uses safe placeholder values so the admin can see the exact
 * HTML structure of every email type with every template applied.
 */
export function renderEmailPreview(
  template: EmailTemplateKey,
  type: PreviewableEmailType,
): { html: string; text: string; subject: string } {
  const samples: Record<
    PreviewableEmailType,
    { subject: string; title: string; body: string; buttonHref: string; buttonLabel: string }
  > = {
    welcome: {
      subject: 'Welcome to OSK, Alex',
      title: 'Welcome to OSK',
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi Alex — your account is ready. Browse, save listings, send inquiries to owners and agents, or list your own property if you're selling. We&rsquo;re glad you&rsquo;re here.</p>`,
      buttonHref: 'https://example.com/dashboard',
      buttonLabel: 'Open your dashboard',
    },
    verify: {
      subject: 'Confirm your OSK email',
      title: 'Confirm your OSK email',
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi Alex — welcome to OSK. Tap the button below to verify your email and unlock saved listings, inquiries and messaging.</p>`,
      buttonHref: 'https://example.com/verify-email?token=sample',
      buttonLabel: 'Verify email',
    },
    'reset-password': {
      subject: 'Reset your OSK password',
      title: 'Reset your OSK password',
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi Alex — you (or someone using your email) asked to reset your OSK password. Use the button below within the next hour.</p>
             <p style="margin:0;font-size:13px;">If you didn&rsquo;t request this, ignore this email and your password stays the same.</p>`,
      buttonHref: 'https://example.com/reset-password?token=sample',
      buttonLabel: 'Reset password',
    },
    'subscription-activated': {
      subject: 'Your Gold plan is active',
      title: 'Gold plan activated',
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi Alex — your subscription to <strong>Gold</strong> is live. You can start using every feature on your tier right away.</p>
             <p style="margin:0 0 14px;font-size:14px;">You&rsquo;ll be charged <strong>99 USD</strong> and your next renewal is on <strong>Jan 15, 2026</strong>.</p>`,
      buttonHref: 'https://example.com/dashboard/subscription',
      buttonLabel: 'Manage subscription',
    },
    'subscription-cancelled': {
      subject: 'Your Gold subscription is cancelled',
      title: 'Subscription cancelled',
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi Alex — we&rsquo;ve cancelled your <strong>Gold</strong> plan as requested.</p>
             <p style="margin:0 0 14px;font-size:14px;">You&rsquo;ll keep access to <strong>Gold</strong> until <strong>Jan 15, 2026</strong>, then the account drops back to the free tier.</p>`,
      buttonHref: 'https://example.com/pricing',
      buttonLabel: 'See plans again',
    },
    'property-approved': {
      subject: 'Approved: Sunlit Corner Penthouse',
      title: 'Your listing is live',
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi Alex — your listing <strong>Sunlit Corner Penthouse</strong> has been approved and is now visible to buyers. Share the link below or jump into your dashboard to see views and inquiries roll in.</p>`,
      buttonHref: 'https://example.com/property/sunlit-corner-penthouse',
      buttonLabel: 'View your live listing',
    },
    'property-rejected': {
      subject: 'Action needed: Sunlit Corner Penthouse',
      title: 'Your listing needs changes',
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi Alex — we couldn&rsquo;t publish <strong>Sunlit Corner Penthouse</strong> this round.</p>
             <p style="margin:0 0 12px;font-size:14px;">Here&rsquo;s what our team flagged:</p>
             <p style="margin:0 0 16px;padding:14px 16px;background:#f7e7e6;border-left:4px solid #b91c1c;border-radius:6px;font-size:14px;line-height:1.55;white-space:pre-wrap;">The price field looks inconsistent with the area size, and the floor plan image is missing. Please double-check and add a clear floor plan before resubmitting.</p>
             <p style="margin:0 0 16px;font-size:14px;">Edit the listing, then click <em>Submit for review</em> again. We aim to re-check within one business day.</p>`,
      buttonHref: 'https://example.com/dashboard/listings/sunlit-corner-penthouse/edit',
      buttonLabel: 'Edit listing',
    },
  };

  const sample = samples[type];
  const { html, text } = renderEmailTemplate(template, sample);
  return { html, text, subject: sample.subject };
}
