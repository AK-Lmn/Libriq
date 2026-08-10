# Book APIs and Providers

## Provider Roles

LibriQ uses several public sources with deliberately separate responsibilities:

- **Google Books** is a primary search and metadata provider.
- **Open Library** is a primary search provider and supplies richer work, edition, author, and subject metadata.
- **Open Library Subjects** power additional Discover rails.
- **Gutendex / Project Gutenberg** power the Free Classics Discover rail.
- **Internet Archive** supplies readable or archive links when available.

Gutendex and Internet Archive do not replace Google Books or Open Library in normal search.

## Search and Normalization

Primary results are normalized into a shared book shape, merged, and deduplicated using ISBN, title, author, provider IDs, and other identity signals. Available fields can include cover, page count, genres, subjects, description, publisher, publication date, language, and source badges.

Open Library enrichment can use works, editions, authors, and subjects. Book Details displays compact subject information rather than exposing an unbounded provider list.

Metadata refresh fills missing provider fields without overwriting progress, status, rating, favorite state, private notes, or quotes. Saved books remain backward compatible and do not require a destructive migration.

## Keys and Configuration

Open Library, Gutendex, and Internet Archive do not require API keys for LibriQ's current public usage. Google Books works best with a configured Google Books API key but can still use its public endpoint. When Google Books is limited or unavailable, LibriQ can fall back to Open Library results.

See [Deployment](DEPLOYMENT.md) for key configuration.

## Offline Behavior

Live provider search requires an internet connection. Saved-library search, sorting, filtering, details, notes, ratings, and progress remain local and usable offline. Cached results are labeled clearly, and the UI does not imply that a fresh provider request occurred while disconnected.

## Data Limitations

Providers do not supply complete metadata for every title. When a description is unavailable, LibriQ shows a safe fallback rather than generating or inventing one. Covers can fail when the provider has no valid image or a browser extension blocks the external request.

Internet Archive URLs are exposed only when useful readable or archive metadata exists. LibriQ does not change its primary search behavior to force an archive result.

## Privacy

Provider searches send the query and requested filters needed for book discovery. Private notes, quotes, ratings, reading progress, favorites, and the saved library are not sent to metadata providers as part of normal search.
