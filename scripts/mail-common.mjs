// scripts/mail-common.mjs
// Shared helpers for LibriQ email dispatch scripts.
// Keeps recipient PII out of source control, masks addresses in logs,
// paces sends with retries, and tracks resumable progress in gitignored files.

import fs from 'node:fs';
import path from 'node:path';

/** Mask an email address for safe logging: j***@example.com */
export function maskEmail(email) {
  const emailStr = String(email || '');
  const at = emailStr.indexOf('@');
  if (at <= 0) return '***';
  const local = emailStr.slice(0, at);
  const domain = emailStr.slice(at + 1);
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Load recipients from an env var (JSON array) or a gitignored local JSON file.
 * Returns [] when nothing is configured (fail closed - never mail a hardcoded list).
 * @param {string} envVar Environment variable name holding a JSON array of addresses.
 * @param {string} fallbackFile Path to a gitignored JSON file of addresses.
 * @returns {string[]}
 */
export function loadRecipients(envVar, fallbackFile) {
  const raw = process.env[envVar];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(String);
    } catch {
      // fall through to file
    }
  }
  if (fallbackFile && fs.existsSync(fallbackFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
      if (Array.isArray(parsed)) return parsed.filter(String);
    } catch {}
  }
  return [];
}

// Mail apps show an "Unsubscribe" button for this header. Replies to
// support@libriq.app land in the Resend inbox; add the address to
// scripts/.suppressed.json (gitignored) or LIBRIQ_EMAIL_SUPPRESSED.
export const UNSUBSCRIBE_MAILTO = 'mailto:support@libriq.app?subject=unsubscribe';
export const BROADCAST_FROM = 'LibriQ <updates@libriq.app>';

/** Resend /emails payload for a broadcast, with the List-Unsubscribe header. */
export function broadcastPayload({ to, subject, html, text }) {
  return {
    from: BROADCAST_FROM,
    to: [to],
    subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${UNSUBSCRIBE_MAILTO}>` },
  };
}

function readAddressList(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string' && value.trim()) : [];
  } catch {
    return [];
  }
}

/**
 * Addresses that asked not to receive broadcasts: the gitignored file plus
 * LIBRIQ_EMAIL_SUPPRESSED (JSON array). Missing or unreadable sources count
 * as empty.
 */
export function loadSuppressed(file = 'scripts/.suppressed.json', envVar = 'LIBRIQ_EMAIL_SUPPRESSED') {
  const fromFile = file && fs.existsSync(file) ? readAddressList(fs.readFileSync(file, 'utf8')) : [];
  const fromEnv = process.env[envVar] ? readAddressList(process.env[envVar]) : [];
  return [...fromFile, ...fromEnv];
}

const normalizeAddress = value => String(value || '').trim().toLowerCase();

/** Drops opted-out addresses (case- and whitespace-insensitive). */
export function filterSuppressed(recipients, suppressed) {
  const blocked = new Set(suppressed.map(normalizeAddress));
  const targets = recipients.filter(email => !blocked.has(normalizeAddress(email)));
  return { targets, suppressed: recipients.length - targets.length };
}

/** Read resumable progress file: { sent: [...], failed: [...] } */
export function readProgress(progressPath) {
  try {
    if (fs.existsSync(progressPath)) {
      const parsed = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      return {
        sent: new Set(Array.isArray(parsed.sent) ? parsed.sent : []),
        failed: Array.isArray(parsed.failed) ? parsed.failed : [],
      };
    }
  } catch {}
  return { sent: new Set(), failed: [] };
}

/** Write resumable progress file. */
export function writeProgress(progressPath, { sent, failed }) {
  try {
    fs.writeFileSync(progressPath, JSON.stringify({ sent: Array.from(sent), failed }, null, 2));
  } catch {}
}

/**
 * Send to recipients sequentially with rate limiting, retries, and resumable progress.
 * Skips recipients already marked sent in the progress file.
 * @param {Object} opts
 * @param {string[]} opts.recipients
 * @param {(email: string) => Promise<unknown>} opts.sendOne Per-recipient send function.
 * @param {number} [opts.delayMs=1000] Delay between sends.
 * @param {number} [opts.maxRetries=3] Retry attempts per recipient.
 * @param {string} [opts.progressPath] Path to gitignored progress file.
 * @param {(info: { email, masked, sent, failed, skipped }) => void} [opts.onProgress]
 * @returns {{ sent: number, failed: number, skipped: number }}
 */
export async function sendSequentially({
  recipients,
  sendOne,
  delayMs = 1000,
  maxRetries = 3,
  progressPath,
  onProgress,
} = {}) {
  const progress = progressPath ? readProgress(progressPath) : { sent: new Set(), failed: [] };
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const email of recipients) {
    if (!email || typeof email !== 'string') continue;
    const masked = maskEmail(email);
    if (progress.sent.has(email)) {
      skipped += 1;
      onProgress?.({ email, masked, sent: false, failed: false, skipped: true });
      continue;
    }

    let lastErr;
    let ok = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await sendOne(email);
        ok = true;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          await sleep(delayMs * attempt); // backoff between retries
        }
      }
    }

    if (ok) {
      sent += 1;
      progress.sent.add(email);
      onProgress?.({ email, masked, sent: true, failed: false, skipped: false });
    } else {
      failed += 1;
      progress.failed.push(email);
      onProgress?.({ email, masked, sent: false, failed: true, skipped: false, error: lastErr?.message });
    }

    if (progressPath) writeProgress(progressPath, { sent: progress.sent, failed: progress.failed });
    // Pace sends so we don't hammer the provider.
    await sleep(delayMs);
  }

  return { sent, failed, skipped };
}
