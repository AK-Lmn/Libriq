import assert from 'node:assert/strict';
import { parseKindleClippings } from '../frontend/js/services/kindleClippingsParser.js';

const separator = '==========';

const single = parseKindleClippings(`The Hobbit (J. R. R. Tolkien)
- Your Highlight on page 12 | Location 180-181 | Added on Monday, January 1, 2024 10:00:00 AM

In a hole in the ground there lived a hobbit.
${separator}`);

assert.deepEqual(single, {
  books: [{
    title: 'The Hobbit',
    author: 'J. R. R. Tolkien',
    entries: [{
      type: 'highlight',
      location: '180-181',
      addedAt: 'Monday, January 1, 2024 10:00:00 AM',
      text: 'In a hole in the ground there lived a hobbit.',
    }],
  }],
  totals: { books: 1, highlights: 1, notes: 0 },
});

const mixed = parseKindleClippings(`Dune (Frank Herbert)
- Your Highlight on page 5 | Location 70-71 | Added on Tuesday, January 2, 2024 9:00:00 AM

Fear is the mind-killer.
${separator}
Dune (Frank Herbert)
- Your Note on page 5 | Location 71 | Added on Tuesday, January 2, 2024 9:01:00 AM

Remember this passage.
${separator}
Pride and Prejudice (Jane Austen)
- Your Highlight on page 1 | Location 10 | Added on Wednesday, January 3, 2024 8:00:00 AM

It is a truth universally acknowledged.
${separator}`);

assert.equal(mixed.books.length, 2);
assert.equal(mixed.books[0].entries.length, 2);
assert.deepEqual(mixed.books[0].entries.map(entry => entry.type), ['highlight', 'note']);
assert.deepEqual(mixed.totals, { books: 2, highlights: 2, notes: 1 });

const missingAuthor = parseKindleClippings(`Authorless Book
- Your Highlight at Location 22 | Added on Thursday, January 4, 2024 7:00:00 AM

An unattributed passage.
${separator}`);

assert.equal(missingAuthor.books[0].author, null);
assert.equal(missingAuthor.books[0].title, 'Authorless Book');

const malformed = parseKindleClippings(`Broken Book (Nobody)
This metadata is invalid

Ignored text
${separator}
Empty Highlight (Nobody)
- Your Highlight at Location 1 | Added on Friday, January 5, 2024 6:00:00 AM

${separator}
${separator}
Valid Book (Valid Author)
- Your Note at Location 2 | Added on Friday, January 5, 2024 6:01:00 AM

Keep this note.
${separator}`);

assert.deepEqual(malformed.totals, { books: 1, highlights: 0, notes: 1 });
assert.equal(malformed.books[0].title, 'Valid Book');

const windows = parseKindleClippings('Windows Book (Reader)\r\n- Your Highlight at Location 8 | Added on Saturday, January 6, 2024 5:00:00 AM\r\n\r\nCRLF content.\r\n==========\r\n');
assert.equal(windows.books[0].entries[0].text, 'CRLF content.');
assert.deepEqual(windows.totals, { books: 1, highlights: 1, notes: 0 });

const unicode = parseKindleClippings(`百年孤独 (Gabriel García Márquez)
- Your Highlight at Location 42 | Added on domingo, 7 enero 2024

Muchos años después, frente al pelotón de fusilamiento… 📚
${separator}`);

assert.equal(unicode.books[0].title, '百年孤独');
assert.equal(unicode.books[0].author, 'Gabriel García Márquez');
assert.equal(unicode.books[0].entries[0].text, 'Muchos años después, frente al pelotón de fusilamiento… 📚');
assert.deepEqual(unicode.totals, { books: 1, highlights: 1, notes: 0 });

assert.deepEqual(parseKindleClippings('not a clippings file'), {
  books: [],
  totals: { books: 0, highlights: 0, notes: 0 },
});

console.log('Kindle clippings parser tests passed');
