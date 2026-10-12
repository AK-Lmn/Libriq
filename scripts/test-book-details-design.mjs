import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = process.env.LIBRIQ_BOOK_DETAILS_ARTIFACTS;
if (output) await fs.mkdir(output, { recursive: true });
const css = await fs.readFile(path.join(root, 'css/features/book-details.css'), 'utf8');
const source = await fs.readFile(path.join(root, 'js/features/bookDetails/bookDetailsPage.js'), 'utf8');
assert.doesNotMatch(css + source, /figma\.com\/api\/mcp\/asset|var\(--gold/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /max-width: 767px/);
assert.match(css, /var\(--glass-fill-3\)/);
assert.match(css, /var\(--glass-solid-1\)/);
assert.match(css, /var\(--glass-blur-modal\)/);
const assets = await fs.readdir(path.join(root, 'assets/revamp/book-details'));
assert.equal(assets.length, 13);
for (const name of assets) {
  const svg = await fs.readFile(path.join(root, 'assets/revamp/book-details', name), 'utf8');
  assert.match(svg, /<svg[^>]*viewBox="0 0 (6 6|14 14|18 18|20 20)"/);
  assert.ok(svg.length > 100);
}

const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const styles = [...index.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('\n');
const fixture = `<!doctype html><html lang="en" data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<link rel="stylesheet" href="css/features/book-details.css"></head><body>
  <div id="app"><button id="fixtureTrigger">Open fixture book</button></div>
  <div class="modal-overlay" id="bookDetailsModal" role="dialog" aria-modal="true" aria-labelledby="bookDetailsModalTitle" hidden>
    <div class="modal modal--sheet book-details-modal"><div class="modal-header"><h2 class="modal-title" id="bookDetailsModalTitle">Book Details</h2><button class="modal-close" aria-label="Close">Close</button></div><div class="modal-body" id="bookDetailsBody"></div></div>
  </div><script type="module">
  import {createBookDetailsPage} from './js/features/bookDetails/bookDetailsPage.js';
  import {Utils} from './js/utils.js';
  import {LIBRIQ} from './js/data.js';
  let book;
  window.calls = [];
  const storage = {getBookById: () => book, updateBook: (id, updates) => Object.assign(book, updates), removeBook: () => window.calls.push('remove')};
  const feature = createBookDetailsPage({storage, utils: {...Utils, toast: (text) => window.calls.push(text)}, constants: LIBRIQ,
    bookApi: {getSourceLabels: () => ['Open Library'], normalizeSource: value => value}, confirmAction: () => true,
    actions: {getMetadataQuality: () => ({className:'verified', label:'Metadata verified'}), parseShelfInput: value => value.split(',').map(tag => tag.trim()).filter(Boolean),
      showProgressModal: () => window.calls.push('progress'), setStatus: () => window.calls.push('finished'),
      setRating: (id, rating) => Object.assign(book, {rating:book.rating === rating ? null : rating}), refreshMetadata: async () => ({status:'no-new'}),
      toggleFavorite: () => {book.isFavorite = !book.isFavorite; return book;}}});
  window.renderFixture = data => {book = structuredClone(data); document.getElementById('fixtureTrigger').focus(); feature.render(book.id);};
  window.fixtureBook = () => structuredClone(book);
  window.fixtureReady = true;
  </script></body></html>`;

const types = {'.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.png':'image/png'};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {res.writeHead(200, {'content-type':'text/html'}); res.end(fixture); return;}
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Invalid fixture path');
    res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
    res.end(await fs.readFile(file));
  } catch {res.writeHead(404); res.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const book = {id:'design-fixture', title:'The Midnight Library', author:'Matt Haig', status:'reading', currentPage:86, pageCount:304,
  rating:4, genres:['Literary fiction'], tags:['Fiction','Favorites','Book club'], publishYear:2020, publisher:'Canongate', language:'English',
  dateAdded:'2026-05-04', isbn:'9781786892737', metadataSource:'openlibrary', metadataSources:['openlibrary'], readableSourceLinks:['https://archive.org/details/fixture', 'javascript:alert(1)'],
  description:'Between life and death there is a library, and within that library, the shelves go on for ever. Every book offers a chance to try another life you could have lived.\nWhat would you choose?',
  notes:'This book makes me think about how small choices can open very different paths. I want to return to the passages about regret and possibility.',
  notesUpdatedAt:'2026-05-10', quotes:[{id:'fixture-quote', text:'The only way to learn is to live.', page:86, note:'A reminder to keep moving forward.'}, {id:'kindle-note', text:'', note:'A Kindle note without a highlight.', page:44, source:'kindle'}]};
const empty = {id:'empty-fixture', title:'A title without metadata', author:'Unknown author', status:'wishlist', rating:null, tags:[], genres:[], quotes:[]};
const report = [];
const errors = [];
const failed = [];
let browser;
try {
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if (response.status() >= 400) failed.push(response.url());});
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.fixtureReady);

  async function render(data, theme, viewport, reduced = false) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion:'reduce'});
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}, {name:'prefers-reduced-transparency',value:reduced ? 'reduce' : 'no-preference'}]});
    await page.evaluate(({data, theme}) => {document.documentElement.dataset.theme = theme; window.renderFixture(data); document.getElementById('bookDetailsModal').scrollTop = 0;}, {data, theme});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.querySelectorAll('.book-details-icon')].every(img => img.complete && img.naturalWidth));
  }

  async function checkLayout(name) {
    const result = await page.evaluate(() => {
      const modal = document.getElementById('bookDetailsModal');
      const panel = modal.firstElementChild;
      const parse = value => {const parts = value.match(/[\d.]+/g)?.map(Number) || [0,0,0]; return [...parts.slice(0,3), parts.length > 3 ? parts[3] : 1];};
      const compose = (fg,bg) => [...fg.slice(0,3).map((v,i) => v * fg[3] + bg[i] * (1-fg[3])), 1];
      const luminance = rgb => rgb.slice(0,3).map(v => {v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;}).reduce((v,x,i) => v+x*[.2126,.7152,.0722][i],0);
      const rootBg = parse(getComputedStyle(document.body).backgroundColor);
      const background = el => {if (!el || el === document.body) return rootBg; return compose(parse(getComputedStyle(el).backgroundColor), background(el.parentElement));};
      const contrast = [];
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const el = walker.currentNode.parentElement;
        if (!el.getClientRects().length || ['STYLE','SCRIPT'].includes(el.tagName)) continue;
        const fg = parse(getComputedStyle(el).color), bg = background(el);
        const a = luminance(compose(fg,bg)), b = luminance(bg);
        contrast.push({text:walker.currentNode.textContent.trim().slice(0,55), ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05), color:getComputedStyle(el).color, background:bg});
      }
      for (const el of panel.querySelectorAll('input,textarea')) {
        for (const pseudo of [null,'::placeholder']) {
          if (pseudo && !el.getAttribute('placeholder')) continue;
          const color = getComputedStyle(el,pseudo).color;
          const bg = background(el);
          const a = luminance(compose(parse(color),bg)), b = luminance(bg);
          contrast.push({text:`${el.id}${pseudo || ''}`,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color,background:bg});
        }
      }
      const cover = panel.querySelector('.book-cover').getBoundingClientRect();
      const overflowing = [...panel.querySelectorAll('*')].filter(el => el.getClientRects().length && (el.getBoundingClientRect().right > panel.getBoundingClientRect().right + 1 || el.getBoundingClientRect().left < panel.getBoundingClientRect().left - 1)).map(el => el.id || el.className);
      return {overflow:modal.scrollWidth > modal.clientWidth, documentOverflow:document.documentElement.scrollWidth > innerWidth, overflowing,
        cover:{width:cover.width,height:cover.height}, padding:getComputedStyle(panel).padding, panelWidth:panel.getBoundingClientRect().width,
        minContrast:Math.min(...contrast.map(item => item.ratio)), badContrast:contrast.filter(item => item.ratio < 4.5),
        blur:getComputedStyle(panel).backdropFilter, modalBlur:getComputedStyle(modal).backdropFilter,
        alpha:parse(getComputedStyle(panel).backgroundColor)[3],
        backTop:panel.querySelector('.book-details-back').getBoundingClientRect().top,
        smallTargets:innerWidth < 768 ? [...panel.querySelectorAll('button,input,a')].filter(el => el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44).map(el => el.id || el.textContent.trim()) : [],
        icons:[...panel.querySelectorAll('.book-details-icon')].map(img => ({src:img.getAttribute('src'), loaded:img.complete && img.naturalWidth > 0, proportion:img.clientWidth / img.clientHeight}))};
    });
    assert.equal(result.overflow, false, `${name}: modal overflow`);
    assert.equal(result.documentOverflow, false, `${name}: document overflow`);
    assert.deepEqual(result.overflowing, [], `${name}: content overflow`);
    assert.equal(result.cover.width,184);
    assert.equal(result.cover.height,276);
    assert.ok(result.backTop >= 0, `${name}: header must start within viewport`);
    assert.deepEqual(result.smallTargets, [], `${name}: mobile touch targets`);
    assert.deepEqual(result.badContrast, [], `${name}: text contrast below AA`);
    assert.ok(result.icons.every(icon => icon.loaded && icon.proportion === 1), `${name}: icon loading/proportion`);
    report.push({name,...result});
    if (output) {
      const panel = page.locator('.book-details-modal');
      await page.locator('#bookDetailsModal').evaluate(el => {el.style.position = 'relative'; el.style.inset = 'auto'; el.style.maxHeight = 'none'; el.style.height = 'auto'; el.scrollTop = 0;});
      await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});
      await panel.screenshot({path:path.join(output,`${name}-panel.png`)});
      await page.locator('#bookDetailsModal').evaluate(el => {el.style.position = ''; el.style.inset = ''; el.style.maxHeight = ''; el.style.height = '';});
    }
    return result;
  }

  for (const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740},{width:1024,height:900}]) {
    for (const theme of ['dark','light']) {
      const name = `${viewport.width}-${theme}`;
      await render(book,theme,viewport);
      const result = await checkLayout(name);
      assert.equal(result.padding,viewport.width < 768 ? '20px' : viewport.width < 1200 ? '32px' : '40px');
      if (viewport.width < 768) assert.equal(result.blur,'none');
    }
  }
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    for (const theme of ['dark','light']) {
      await render(book,theme,viewport,true);
      const result = await checkLayout(`${viewport.width}-${theme}-reduced-transparency`);
      assert.equal(result.alpha,1);
      assert.equal(result.blur,viewport.width < 768 ? 'none' : 'blur(0px)');
      assert.equal(result.modalBlur,'blur(0px)');
      await render(empty,theme,viewport);
      await checkLayout(`${viewport.width}-${theme}-empty`);
      assert.equal(await page.locator('.quote-empty-state').count(),1);
      assert.equal(await page.locator('.book-details-progress').count(),0);
    }
  }

  await render(book,'dark',{width:1440,height:1000});
  assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
  assert.equal(await page.locator('#app').evaluate(el => el.inert),true);
  assert.equal(await page.locator('.book-details-back').evaluate(el => el === document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button',{name:'Remove book',exact:true}).evaluate(el => el === document.activeElement),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.book-details-back').evaluate(el => el === document.activeElement),true);
  await page.getByRole('button',{name:'Rate 5 out of 5'}).click();
  assert.equal(await page.locator('.book-details-rating-text').textContent(),'5/5');
  assert.equal(await page.getByRole('button',{name:'Rate 5 out of 5'}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Rate 5 out of 5'}).click();
  assert.equal(await page.locator('.book-details-rating-text').textContent(),'Not rated');
  assert.equal(await page.getByRole('button',{name:'Rate 5 out of 5'}).getAttribute('aria-pressed'),'false');
  await page.locator('#bookNotesTextarea').fill('Changed private notes');
  await page.locator('#saveBookNoteBtn').click();
  assert.equal(await page.evaluate(() => window.fixtureBook().notes),'Changed private notes');
  await page.locator('#clearBookNoteBtn').click();
  assert.equal(await page.evaluate(() => window.fixtureBook().notes),'');
  await page.locator('#bookShelvesInput').fill('Favorites, Club');
  await page.locator('#saveBookShelvesBtn').click();
  assert.deepEqual(await page.evaluate(() => window.fixtureBook().tags),['Favorites','Club']);
  await page.locator('#bookQuoteTextInput').fill('A new favorite line');
  await page.locator('#bookQuotePageInput').fill('42');
  await page.locator('#saveBookQuoteBtn').click();
  assert.equal(await page.locator('.quote-list-item').count(),3);
  await page.locator('.quote-list-item').first().getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('#bookQuoteTextInput').fill('Edited line');
  await page.locator('#saveBookQuoteBtn').click();
  assert.equal(await page.locator('.quote-list-text').first().textContent(),'Edited line');
  await page.locator('.quote-list-item').first().getByRole('button',{name:'Delete',exact:true}).click();
  assert.equal(await page.locator('.quote-list-item').count(),2);
  await page.locator('.quote-list-item').last().getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('#bookQuoteNoteInput').fill('Updated Kindle note');
  await page.locator('#saveBookQuoteBtn').click();
  assert.equal(await page.evaluate(() => window.fixtureBook().quotes.find(quote => quote.id === 'kindle-note').source),'kindle');
  assert.equal(await page.locator('.quote-list-text').last().textContent(),'Updated Kindle note');
  await page.getByRole('button',{name:'Add to favorites',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Remove from favorites',exact:true}).getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.id === 'fixtureTrigger');
  assert.equal(await page.locator('#app').evaluate(el => el.inert),false);
  assert.equal(await page.locator('#bookDetailsModal').getAttribute('hidden'),'');
  await render(book,'dark',{width:1440,height:1000});
  await page.getByRole('button',{name:'Mark Finished',exact:true}).click();
  assert.ok(await page.evaluate(() => window.calls.includes('finished')));
  await render(book,'dark',{width:1440,height:1000});
  await page.getByRole('button',{name:'Refresh metadata',exact:true}).click();
  assert.ok(await page.evaluate(() => window.calls.includes('No new metadata found')));
  await page.getByRole('button',{name:'Remove book',exact:true}).click();
  assert.ok(await page.evaluate(() => window.calls.includes('remove')));
  await render(book,'dark',{width:1440,height:1000});
  await page.locator('.modal-close').click();
  assert.equal(await page.locator('#bookDetailsModal').getAttribute('hidden'),'');
  await render(book,'dark',{width:1440,height:1000});
  await page.locator('#bookDetailsModal').click({position:{x:10,y:10}});
  assert.equal(await page.locator('#bookDetailsModal').getAttribute('hidden'),'');
  await page.route('**/fixture-cover.png', async route => route.fulfill({body:await fs.readFile(path.join(root,'assets/icons/icon-192.png')),contentType:'image/png'}));
  await render({...book,coverUrl:`${baseUrl}/fixture-cover.png`},'dark',{width:1440,height:1000});
  await page.waitForFunction(() => document.querySelector('.book-cover img')?.naturalWidth > 0);
  assert.equal(await page.locator('.book-cover img').getAttribute('alt'),'Cover of The Midnight Library');
  assert.equal(await page.locator('.book-cover img').getAttribute('src'),`${baseUrl}/fixture-cover.png`);

  const tokens = await fs.readFile(path.join(root,'css/tokens.css'),'utf8');
  const unsupported = tokens.replace('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))','@supports (display: block)');
  assert.notEqual(unsupported,tokens);
  await page.route('**/css/tokens.css', route => route.fulfill({body:unsupported,contentType:'text/css'}));
  await page.reload();
  await page.waitForFunction(() => window.fixtureReady);
  await render(book,'dark',{width:1440,height:1000});
  const fallback = await checkLayout('1440-dark-simulated-unsupported-backdrop');
  assert.equal(fallback.alpha,1);
  assert.equal(fallback.blur,'blur(0px)');
  assert.equal(fallback.modalBlur,'blur(0px)');
  await render(book,'dark',{width:1440,height:1000});
  await page.getByRole('button',{name:'Update Progress',exact:true}).click();
  assert.ok(await page.evaluate(() => window.calls.includes('progress')));
  await render(book,'dark',{width:390,height:844});
  await page.locator('.book-details-back').click();
  assert.equal(await page.locator('#bookDetailsModal').getAttribute('hidden'),'');
  assert.deepEqual(errors,[]);
  assert.deepEqual(failed,[]);
  if (output) await fs.writeFile(path.join(output,'report.json'),JSON.stringify({layouts:report,interactions:'passed',errors,failed},null,2));
  console.log(`Book Details design renderer passed: ${report.length} layouts, AA contrast, asset loading, private workspace actions, dialog focus trap/Escape/restoration. Authentication unchanged.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
