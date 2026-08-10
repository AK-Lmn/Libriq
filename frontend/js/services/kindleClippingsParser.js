export function parseKindleClippings(input) {
  const text = typeof input === 'string' ? input : '';
  const blocks = text.replace(/\r\n?/g, '\n').split(/^\s*=+\s*$/m);
  const booksByKey = new Map();
  let highlights = 0;
  let notes = 0;

  for (const block of blocks) {
    const entry = parseBlock(block);
    if (!entry) continue;
    const key = `${entry.title}\u0000${entry.author || ''}`;
    let book = booksByKey.get(key);
    if (!book) {
      book = { title: entry.title, author: entry.author, entries: [] };
      booksByKey.set(key, book);
    }
    book.entries.push(entry.clipping);
    if (entry.clipping.type === 'highlight') highlights += 1;
    else notes += 1;
  }

  const books = Array.from(booksByKey.values());
  return {
    books,
    totals: {
      books: books.length,
      highlights,
      notes,
    },
  };
}

function parseBlock(block) {
  const lines = String(block || '').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length < 3) return null;

  const heading = parseHeading(lines[0]);
  if (!heading.title) return null;

  let metadataIndex = 1;
  while (metadataIndex < lines.length && !lines[metadataIndex].trim()) metadataIndex += 1;
  const metadata = lines[metadataIndex]?.trim() || '';
  const typeMatch = metadata.match(/^[-–—]\s*Your\s+(Highlight|Note)\b/i);
  if (!typeMatch) return null;

  const type = typeMatch[1].toLowerCase();
  const locationMatch = metadata.match(/\bLocation\s+([^|]+)/i);
  const addedAtMatch = metadata.match(/\bAdded on\s+(.+)$/i);
  const body = lines.slice(metadataIndex + 1).join('\n').trim();
  if (!body) return null;

  return {
    ...heading,
    clipping: {
      type,
      location: locationMatch ? locationMatch[1].trim() : null,
      addedAt: addedAtMatch ? addedAtMatch[1].trim() : null,
      text: body,
    },
  };
}

function parseHeading(value) {
  const heading = String(value || '').trim();
  const authorMatch = heading.match(/^(.*?)\s+\(([^()]*)\)\s*$/);
  if (!authorMatch) return { title: heading, author: null };
  const title = authorMatch[1].trim();
  const author = authorMatch[2].trim();
  return { title, author: author || null };
}
