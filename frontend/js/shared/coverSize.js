// Books keep Open Library's large cover (-L, ~330x500, ~50 KB). Most places
// draw covers far smaller, where the medium size (-M, 180px wide, ~19 KB) is
// enough. Rather than guess per call site, offer both and let the browser
// pick from the laid-out width and screen density:
//   srcset="…-M.jpg 180w, …-L.jpg 500w" sizes="auto, 160px"
// sizes="auto" (lazy images, Chromium) uses the real layout width; browsers
// without it use the 160px hint, which still picks -L on 2x screens, so no
// cover gets blurrier than before. Other hosts and the large detail cover are
// left as they are.
const OPEN_LIBRARY_LARGE = /^(https:\/\/covers\.openlibrary\.org\/b\/[a-z]+\/[^/?#]+)-L\.jpg(\?[^#]*)?$/;

export function coverSources(url, sizeClass = 'cover-md') {
  if (typeof url !== 'string' || sizeClass === 'cover-xl') return { src: url, srcset: '' };
  const match = OPEN_LIBRARY_LARGE.exec(url);
  if (!match) return { src: url, srcset: '' };
  const [, base, query = ''] = match;
  const medium = `${base}-M.jpg${query}`;
  return { src: medium, srcset: `${medium} 180w, ${url} 500w` };
}

// Attribute string for an <img>; `escape` is the caller's HTML escaper.
export function coverImgAttrs(url, sizeClass, escape) {
  const { src, srcset } = coverSources(url, sizeClass);
  if (!srcset) return `src="${escape(src)}"`;
  return `src="${escape(src)}" srcset="${escape(srcset)}" sizes="auto, 160px"`;
}
