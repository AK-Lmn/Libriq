// The one HTML escape for text placed into innerHTML or attribute values.
// Same output as Utils.sanitize; importable by modules that don't take Utils.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ENTITIES[character]);
}
