// Collects Content-Security-Policy violation reports. Browsers send either the
// legacy report-uri format ({ "csp-report": {...} }) or the Reporting API
// format ([{ type: "csp-violation", body: {...} }]). Each report becomes one
// short log line in the Vercel function logs. Nothing is stored.

const MAX_FIELD = 300;
const MAX_REPORTS = 20;

const clip = value => (value == null ? null : String(value).slice(0, MAX_FIELD));

function parseBody(body) {
  if (body == null) return null;
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    try { return JSON.parse(String(body)); } catch { return null; }
  }
  return typeof body === 'object' ? body : null;
}

function toEntries(payload) {
  if (!payload) return [];
  if (payload['csp-report'] && typeof payload['csp-report'] === 'object') {
    const r = payload['csp-report'];
    return [{
      directive: clip(r['effective-directive'] || r['violated-directive']),
      blocked: clip(r['blocked-uri']),
      page: clip(r['document-uri']),
      source: clip(r['source-file']),
      line: Number.isFinite(Number(r['line-number'])) ? Number(r['line-number']) : null,
    }];
  }
  if (Array.isArray(payload)) {
    return payload
      .filter(item => item && item.type === 'csp-violation' && item.body && typeof item.body === 'object')
      .slice(0, MAX_REPORTS)
      .map(({ body, url }) => ({
        directive: clip(body.effectiveDirective),
        blocked: clip(body.blockedURL),
        page: clip(body.documentURL || url),
        source: clip(body.sourceFile),
        line: Number.isFinite(Number(body.lineNumber)) ? Number(body.lineNumber) : null,
      }));
  }
  return [];
}

export function createCspReportHandler({ log = entry => console.warn('[csp-violation]', JSON.stringify(entry)) } = {}) {
  return async function cspReport(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end();
    }
    for (const entry of toEntries(parseBody(req.body))) {
      if (entry.directive || entry.blocked) log(entry);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  };
}
