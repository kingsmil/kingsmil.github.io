'use strict';
// The shop as a Telegram Mini App. Identity comes from Telegram's signed
// initData, which the bot verifies with its own token before it will answer
// anything here; this page never asks for a password and is useless outside
// Telegram, because without a launch signature there is no session to mint.
//
// Asking prices arrive in cents and are only ever displayed. Nothing here can
// change one: no route this page can reach writes a price onto a listing that
// already exists. A seller's own cost goes one way only -- it is sent when
// listing a card, and no response ever carries it back.
(() => {
const tg = window.Telegram && window.Telegram.WebApp;
const $ = id => document.getElementById(id);
const base = window.CARD_API_BASE;

let token = '', role = 'buyer', query = '', offset = 0, total = 0;
let items = [], searchSeq = 0, loading = false, open = null, slot = 0;
let filter = {game: '', condition: '', grades: [], minPrice: 0, maxPrice: 0, sort: ''};
let cartNoteDraft = null, checkoutBusy = false;
let requestBusy = false, requestAttempt = null;
let cart = {items: [], total: 0, asking: 0, revision: 0, notes: '', ready: false};
let tab = 'browse', sellCard = null, sellPhotos = {front: '', back: '', details: []}, sellUploading = 0, requestCard = null;

const money = cents => 'S$' + (Number(cents || 0) / 100).toFixed(2);
// Accepts what a phone keyboard produces and refuses the rest rather than
// guessing: a mistyped offer is the buyer's money.
function cents(text) {
 const clean = String(text == null ? '' : text).trim().replace(/^S\$/i, '').replace(/,/g, '');
 if (!/^\d{1,8}(\.\d{1,2})?$/.test(clean)) return null;
 return Math.round(Number(clean) * 100);
}
const conditionLabel = c => ({M: 'Mint', NM: 'Near mint', LP: 'Light wear', MP: 'Moderate wear', HP: 'Heavy wear', Damaged: 'Damaged'})[c] || c;
// The two games the shop sells, and nothing else: an unrecognised value from
// the server leaves a tile with no accent and no claim about what it is.
const games = {pokemon: {css: 'poke', name: 'Pokémon'}, riftbound: {css: 'rift', name: 'Riftbound'}};

const photoLabel = i => i === 0 ? 'Front' : i === 1 ? 'Back' : 'Condition detail ' + (i - 1);
const grade = item => item.condition === 'Slab' ? (item.slab || 'Graded slab') : conditionLabel(item.condition);

function status(text, error) {
 const node = $('status');
 node.hidden = !text;
 node.textContent = text || '';
 node.classList.toggle('error', !!error);
}
function el(tag, text, cls) {
 const node = document.createElement(tag);
 if (text !== undefined) node.textContent = text;
 if (cls) node.className = cls;
 return node;
}

async function api(path, body) {
 const form = body instanceof FormData;
 const response = await fetch(base + 'shop/' + path, {
  method: 'POST',
  headers: Object.assign(form ? {} : {'Content-Type': 'application/json'}, token ? {Authorization: 'Bearer ' + token} : {}),
  body: form ? body : JSON.stringify(body || {}),
  signal: AbortSignal.timeout(60000),
 });
 if (!response.ok) {
  let message = 'Something went wrong. Please try again.';
  try { message = (await response.json()).error || message; } catch (e) { /* not JSON */ }
  const failure = new Error(message);
  failure.status = response.status;
  throw failure;
 }
 return response.json();
}
// Every handler wants the same thing from a failure: a session that has gone
// sends the buyer back to Telegram, anything else is said out loud.
function fail(failure) {
 if (failure.status === 401) return reopen(failure.message);
 status(failure.message, true);
}

// Photos are plain image URLs now. The bytes behind one photo ID never
// change, so the edge holds them for every buyer and the phone holds them
// between visits; a POST into a blob could be cached by neither, which is why
// the shop used to re-download every thumbnail on every scroll.
//
// Letting <img> do the work also hands the browser back the things it is good
// at and a script is bad at: when to start, how many at once, and what to
// drop. The grid asks for a tile, the card view for something screen-sized --
// never the stored upload, which can be megabytes.
const photoSrc = (id, size) => base + 'shop-photo/' + size + '/' + encodeURIComponent(id);

function thumbnail(photo, name, priority = false) {
 const frame = el('div', undefined, 'frame');
 if (photo) {
  const img = document.createElement('img');
  // Decorative: the card's name is already written beside it. It fades in
  // over the frame's own shimmer rather than appearing half-drawn.
  img.alt = '';
  img.loading = priority ? 'eager' : 'lazy';
  img.fetchPriority = priority ? 'high' : 'auto';
  img.decoding = 'async';
  img.addEventListener('load', () => img.classList.add('ready'));
  img.addEventListener('error', () => {
   frame.classList.add('empty');
   img.replaceWith(document.createTextNode('Photo unavailable'));
  });
  img.src = photoSrc(photo, 'grid');
  if (img.complete && img.naturalWidth > 0) img.classList.add('ready');
  frame.appendChild(img);
 } else {
  frame.classList.add('empty');
  frame.textContent = 'No photo';
 }
 frame.dataset.name = name || '';
 return frame;
}

function card(item, priority) {
 const node = el('button', undefined, 'card');
 node.type = 'button';
 node.setAttribute('role', 'listitem');
 const frame = thumbnail((item.photos || []).find(p => p), item.name, priority);
 // The tile says what it is holding, so the stylesheet can give a slab the
 // grading label's own colours and a ten its gold. The text is unchanged:
 // this is the same grade, told to CSS as well as to the buyer.
 const slab = item.condition === 'Slab';
 if (slab) node.classList.add('graded');
 // Which game, told to CSS as a class and to the buyer as a word. The tile's
 // own colour comes from the first, so the second is what makes that colour
 // mean something rather than decorate.
 const game = games[item.game];
 if (game) node.classList.add(game.css);
 const label = el('span', grade(item), 'pill' + (slab ? ' slab' : ''));
 if (slab && /(^|\s)10(\s|$)/.test(item.slab || '')) label.classList.add('gem');
 frame.appendChild(label);
 node.appendChild(frame);
 const meta = el('p', '#' + item.id, 'meta');
 if (game) {
  meta.append(' · ');
  meta.appendChild(el('span', game.name, 'game'));
 }
 node.append(el('p', item.name, 'name'), meta, el('p', money(item.price), 'price'));
 node.addEventListener('click', () => openListing(item.id));
 return node;
}

function render(from) {
 const grid = $('grid');
 if (!from) grid.replaceChildren();
 const next = document.createDocumentFragment();
 items.slice(from).forEach((item, index) => {
  const node = card(item, from === 0 && index < 4);
  node.style.setProperty('--i', String(Math.min(index, 11)));
  next.appendChild(node);
 });
 grid.appendChild(next);
 $('empty').hidden = items.length > 0 || loading;
 $('more').hidden = items.length >= total;
 markFilters();
}

// How many narrowings are on. The filters are behind a button now, so this is
// the only thing on screen that says any are: a filter the buyer cannot see
// is a filter they cannot think to undo, and an empty grid then looks like an
// empty shop.
function filtersOn() {
 return [filter.game, filter.condition, filter.sort].filter(Boolean).length +
  (filter.grades.length > 0 ? 1 : 0) +
  (filter.minPrice > 0 ? 1 : 0) + (filter.maxPrice > 0 ? 1 : 0);
}

function markFilters() {
 const on = filtersOn();
 $('filterCount').textContent = String(on);
 $('filterCount').hidden = on === 0;
 $('openFilters').classList.toggle('on', on > 0);
 // The sheet's own button says what closing it will show, so the buyer can
 // judge a filter without closing the sheet to look.
 $('doneFilters').textContent = total ? 'Show ' + total + (total === 1 ? ' card' : ' cards') : 'Show results';
}

function showFilters(on) {
 $('filters').hidden = !on;
 $('openFilters').setAttribute('aria-expanded', on ? 'true' : 'false');
 if (on) markFilters();
}

async function load(append) {
 const mine = ++searchSeq;
 loading = true;
 status(append ? 'Loading more…' : 'Loading…');
 try {
  const page = await api('browse', {query, offset: append ? offset : 0, filter});
  if (mine !== searchSeq) return;
  // Advance by what actually came back, so a page the server trimmed cannot
  // make the next request skip a listing.
  offset = (append ? offset : 0) + (page.items || []).length;
  total = page.total || 0;
  const already = append ? items.length : 0;
  items = append ? items.concat(page.items || []) : (page.items || []);
  // Before rendering, not in the finally below: render() asks whether a page
  // is still loading to decide between an empty grid and "nothing matches",
  // and a finally runs after it.
  loading = false;
  render(already);
  status('');
 } catch (failure) {
  if (mine !== searchSeq) return;
  fail(failure);
 } finally {
  if (mine === searchSeq) loading = false;
 }
}

function showPhoto() {
 if (!open) return;
 const slots = (open.photos || []).map((id, index) => ({id, index})).filter(p => p.id);
 const img = $('photo');
 const dots = $('dots');
 $('noPhoto').hidden = slots.length > 0;
 img.hidden = slots.length === 0;
 $('previousPhoto').hidden = $('nextPhoto').hidden = slots.length < 2;
 if (!slots.length) {
  $('photoLabel').textContent = '';
  dots.textContent = '';
  return;
 }
 // Wrapped first, so the label and the dots describe the photo that is
 // actually about to be shown rather than the arrow that was pressed.
 slot = (slot + slots.length) % slots.length;
 $('photoLabel').textContent = photoLabel(slots[slot].index) + (slots.length > 1 ? ' · ' + (slot + 1) + '/' + slots.length : '');
 dots.textContent = '';
 if (slots.length > 1) {
  for (let i = 0; i < slots.length; i++) {
   const dot = el('button', undefined, i === slot ? 'dot on' : 'dot');
   dot.type = 'button';
   dot.setAttribute('aria-label', 'Photo ' + (i + 1));
   dot.addEventListener('click', () => { slot = i; showPhoto(); });
   dots.appendChild(dot);
  }
 }
 img.classList.remove('ready');
 img.onload = () => img.classList.add('ready');
 img.src = photoSrc(slots[slot].id, 'card');
 if (slots.length > 1) {
  const next = new Image();
  next.fetchPriority = 'low';
  next.src = photoSrc(slots[(slot + 1) % slots.length].id, 'card');
 }
}

async function openListing(id) {
 status('Loading…');
 try {
  const detail = await api('listing', {id});
  open = detail.listing;
  slot = 0;
  $('detailName').textContent = open.name;
  // The listing route answers from the stock row, which does not resolve the
  // game, so fall back to the tile this was opened from. A card reached by a
  // deep link has no tile behind it and simply gets no accent.
  const known = items.find(row => row.id === open.id);
  const game = games[open.game || (known && known.game)];
  for (const css of ['poke', 'rift']) $('detail').classList.toggle(css, !!game && game.css === css);
  $('detailMeta').textContent = grade(open) + ' · listing #' + open.id + (game ? ' · ' + game.name : '');
  $('detailPrice').textContent = money(open.price);
  $('detailIncluded').hidden = !open.included;
  $('detailIncluded').textContent = open.included ? 'Includes: ' + open.included : '';
  // An offer already in the cart is what the field starts at, so changing it
  // is an edit rather than a second guess.
  $('offerAmount').value = detail.offer ? (detail.offer / 100).toFixed(2) : '';
  $('addToCart').textContent = detail.offer ? 'Update my offer' : 'Add to cart';
  const ask = $('openInBot');
  ask.hidden = !detail.link;
  if (detail.link) ask.href = detail.link;
  showPhoto();
  show('detail');
  if (tg && tg.BackButton) tg.BackButton.show();
  status('');
 } catch (failure) {
  fail(failure);
 }
}

function closeListing() {
 open = null;
 if (tg && tg.BackButton) tg.BackButton.hide();
 show(tab);
}

// Panels, including the card view, which is a panel the tabs do not name.
const panels = ['browse', 'cart', 'sell', 'requests', 'detail'];
function show(which) {
 status('');
 for (const id of panels) $(id).hidden = id !== which;
 // The sheet is a fixed overlay rather than part of a panel, so leaving the
 // grid would otherwise leave it hanging over whatever comes next.
 showFilters(false);
 if (which !== 'detail') {
  tab = which;
  for (const button of document.querySelectorAll('#tabs button')) button.classList.toggle('active', button.dataset.tab === which);
  if (tg && tg.BackButton) tg.BackButton.hide();
 }
 window.scrollTo(0, 0);
}

function renderCart() {
 const list = $('cartItems');
 list.textContent = '';
 for (const item of cart.items) {
  const row = el('div', undefined, 'cartrow');
  row.appendChild(thumbnail((item.photos || []).find(p => p), item.name));
  const body = el('div', undefined, 'cartbody');
  body.appendChild(el('p', item.name, 'name'));
  body.appendChild(el('p', item.available ? grade(item) + ' · asking ' + money(item.asking) : 'No longer available', item.available ? 'meta' : 'meta gone'));
  const field = el('label', undefined, 'offerfield');
  field.append('Your offer · S$');
  const input = document.createElement('input');
  input.inputMode = 'decimal';
  input.value = (item.offer / 100).toFixed(2);
  input.disabled = !item.available;
  input.addEventListener('change', () => changeOffer(item.id, input.value));
  field.appendChild(input);
  body.appendChild(field);
  const drop = el('button', 'Remove', 'linkbutton');
  drop.type = 'button';
  drop.addEventListener('click', () => cartAction('cart-remove', {id: item.id}));
  body.appendChild(drop);
  row.appendChild(body);
  list.appendChild(row);
 }
 const count = cart.items.length;
 $('cartEmpty').hidden = count > 0;
 $('cartSummary').hidden = count === 0;
 $('cartAsking').textContent = money(cart.asking);
 $('cartTotal').textContent = money(cart.total);
 $('cartNote').value = cartNoteDraft ?? cart.notes ?? '';
 $('checkout').disabled = !cart.ready || checkoutBusy;
 $('checkout').textContent = cart.ready ? 'Send offers' : 'Remove unavailable cards first';
 const badge = $('cartCount');
 const was = badge.textContent;
 badge.hidden = count === 0;
 badge.textContent = String(count);
 if (count && was !== String(count)) {
  badge.classList.remove('pop');
  void badge.offsetWidth; // restart the animation rather than skip it
  badge.classList.add('pop');
 }
}

async function cartAction(path, body) {
 status('Saving…');
 try {
  cart = await api(path, body || {});
  if (path === 'cart-clear' || !cart.items.length || (path === 'cart-note' && (cartNoteDraft || '').trim() === body.note)) cartNoteDraft = null;
  renderCart();
  status('');
 } catch (failure) {
  fail(failure);
  await refreshCart();
 }
}
async function refreshCart() {
 try {
  cart = await api('cart', {});
  renderCart();
 } catch (failure) {
  fail(failure);
 }
}
function changeOffer(id, text) {
 const amount = cents(text);
 if (amount === null || amount <= 0) {
  status('Enter an offer like 250.00', true);
  return renderCart();
 }
 return cartAction('cart-offer', {id, amount});
}

async function addToCart() {
 if (!open) return;
 const amount = cents($('offerAmount').value);
 if (amount === null || amount <= 0) return status('Enter an offer like 250.00', true);
 status('Saving…');
 try {
  cart = await api('cart-offer', {id: open.id, amount});
  renderCart();
  closeListing();
  show('cart');
  status('Offer saved. It is in your cart.');
 } catch (failure) {
  fail(failure);
 }
}

async function checkout() {
 if (checkoutBusy) return;
 checkoutBusy = true;
 $('checkout').disabled = true;
 const note = $('cartNote').value.trim();
 status('Sending…');
 try {
  const result = await api('checkout', {revision: cart.revision, note});
  cartNoteDraft = null;
  await refreshCart();
  status('Offer sent. The seller replies in Telegram.');
 } catch (failure) {
  fail(failure);
  await refreshCart();
 } finally {
  checkoutBusy = false;
  renderCart();
 }
}

// The catalogue finder, shared by listing a card and asking for one. Both need
// a catalogue entry rather than a listing, so neither carries a price.
function catalogue(input, results, onPick) {
 let typed = 0, sequence = 0;
 input.addEventListener('input', () => {
  clearTimeout(typed);
  const text = input.value.trim();
  if (!text) { results.textContent = ''; return; }
  typed = setTimeout(async () => {
   const mine = ++sequence;
   try {
    const found = await api('catalog', {query: text});
    if (mine !== sequence) return;
    results.textContent = '';
    if (!(found.cards || []).length) { results.appendChild(el('p', 'No card by that name.', 'hint')); return; }
    for (const entry of found.cards) {
     const option = el('button', entry.name, 'result');
     option.type = 'button';
     option.addEventListener('click', () => onPick(entry));
     results.appendChild(option);
    }
   } catch (failure) {
    if (mine === sequence) fail(failure);
   }
  }, 250);
 });
}

function showSellPhotoState() {
 $('sellPhotoState').textContent = $('sellSkipPhotos').checked ? 'Photos will not be included.' : [sellPhotos.front && 'Front ready.', sellPhotos.back && 'Back ready.', sellPhotos.details.length && sellPhotos.details.length + ' condition details ready.'].filter(Boolean).join(' ');
}

async function uploadPhoto(input, side) {
 const files = [...(input.files || [])];
 if (!files.length) return;
 if (side === 'details' && files.length > 8) return status('Choose up to eight condition detail photos.', true);
 status('Uploading photo…');
 sellUploading += 1;
 try {
  const savedPhotos = [];
  for (const file of files) {
   const form = new FormData();
   form.append('photo', file, file.name);
   const saved = await api('sell-photo', form);
   savedPhotos.push(saved.photo);
  }
  sellPhotos[side] = side === 'details' ? savedPhotos : savedPhotos[0];
  $('sellSkipPhotos').checked = false;
  showSellPhotoState();
  status('');
 } catch (failure) {
  fail(failure);
 } finally {
  sellUploading -= 1;
 }
}

async function publishListing() {
 if (!sellCard) return;
 const price = cents($('sellPrice').value);
 if (price === null || price <= 0) return status('Enter the asking price, like 299.00', true);
 const cost = $('sellCost').value.trim() ? cents($('sellCost').value) : 0;
 if (cost === null) return status('Enter your cost like 110.00, or leave it blank', true);
 const condition = $('sellCondition').value;
 if (condition === 'Slab' && !$('sellSlab').value.trim()) return status('Enter the grade, like PSA 10', true);
 if (sellUploading) return status('Wait for the photos to finish uploading.', true);
 if (sellPhotos.details.length && !sellPhotos.front && !sellPhotos.back && !$('sellSkipPhotos').checked) return status('Add a front or back photo before condition details.', true);
 const hasPhotos = !$('sellSkipPhotos').checked && !!(sellPhotos.front || sellPhotos.back || sellPhotos.details.length);
 if (!hasPhotos && !$('sellSkipPhotos').checked) return status('Add a photo or choose to skip photos.', true);
 status('Publishing…');
 try {
  const result = await api('sell', {
   cardId: sellCard.id,
   name: sellCard.name,
   condition,
   slab: condition === 'Slab' ? $('sellSlab').value.trim() : '',
   cost,
   price,
   photos: hasPhotos ? (sellPhotos.details.length ? [sellPhotos.front, sellPhotos.back, ...sellPhotos.details] : sellPhotos.back ? [sellPhotos.front, sellPhotos.back] : [sellPhotos.front]) : [],
  });
  resetSell();
  query = '';
  $('search').value = '';
  $('clear').hidden = true;
  await load(false);
  show('browse');
  status('Listing #' + result.listing + ' is live.');
 } catch (failure) {
  fail(failure);
 }
}
function resetSell() {
 sellCard = null;
 sellPhotos = {front: '', back: '', details: []};
 $('sellForm').hidden = true;
 $('sellResults').textContent = '';
 $('sellSearch').value = '';
 $('sellPrice').value = '';
 $('sellCost').value = '';
 $('sellSlab').value = '';
 $('sellFront').value = '';
 $('sellBack').value = '';
 $('sellDetails').value = '';
 $('sellSkipPhotos').checked = false;
 showSellPhotoState();
}

async function sendRequest() {
 if (!requestCard || requestBusy) return;
 const amount = cents($('requestAmount').value);
 if (amount === null || amount <= 0) return status('Enter your budget, like 180.00', true);
 const condition = $('requestCondition').value;
 if (condition === 'Slab' && !$('requestSlab').value.trim()) return status('Enter the lowest grade, like PSA 9', true);
 const payload = {
   cardId: requestCard.id,
   condition,
   slab: condition === 'Slab' ? $('requestSlab').value.trim() : '',
   amount,
   notes: $('requestNotes').value.trim(),
 };
 const fingerprint = JSON.stringify(payload);
 if (!requestAttempt || requestAttempt.fingerprint !== fingerprint) {
  requestAttempt = {fingerprint, key: crypto.randomUUID()};
 }
 requestBusy = true;
 $('requestSend').disabled = true;
 status('Sending...');
 try {
  const result = await api('request', {...payload, submissionKey: requestAttempt.key});
  requestAttempt = null;
  requestCard = null;
  $('requestForm').hidden = true;
  $('requestResults').textContent = '';
  $('requestSearch').value = '';
  $('requestNotes').value = '';
  $('requestAmount').value = '';
  await loadSubmissions();
  status('Request #' + result.request + ' sent.');
 } catch (failure) {
  fail(failure);
 } finally {
  requestBusy = false;
  $('requestSend').disabled = false;
 }
}

const submissionState = {pending: 'Waiting for the shop', quoted: 'Quoted', accepted: 'Accepted', declined: 'Declined', listed: 'Listed', sold: 'Sold', removed: 'Removed'};
const submissionKind = {request: 'Request', buyback: 'Sell to us', consign: 'Consignment'};
async function loadSubmissions(offset = 0) {
 try {
  const found = await api('submissions', {offset});
  const list = $('submissions');
  $('submissionsMore')?.remove();
  if (!offset) list.textContent = '';
  for (const record of found.submissions || []) {
   const row = el('div', undefined, 'submission');
   row.appendChild(el('p', record.name, 'name'));
   const parts = [submissionKind[record.kind] || record.kind, grade(record), 'up to ' + money(record.amount)];
   row.appendChild(el('p', parts.join(' · '), 'meta'));
   row.appendChild(el('p', submissionState[record.status] || record.status, 'state'));
   if (record.quote) row.appendChild(el('p', 'The shop offered ' + money(record.quote), 'meta'));
   if (record.decision) row.appendChild(el('p', record.decision, 'meta'));
   if (record.kind === 'buyback' && ['pending', 'quoted', 'accepted', 'declined'].includes(record.status)) {
    const withdraw = el('button', 'Withdraw submission', 'secondary');
    withdraw.type = 'button';
    withdraw.addEventListener('click', async () => {
     withdraw.disabled = true;
     try {
      await api('submission-withdraw', {id: record.id});
      await loadSubmissions();
     } catch (failure) { fail(failure); withdraw.disabled = false; }
    });
    row.appendChild(withdraw);
   }
   list.appendChild(row);
  }
  if ((found.submissions || []).length === 7) {
   const more = el('button', 'Show older submissions', 'secondary');
   more.id = 'submissionsMore';
   more.type = 'button';
   more.addEventListener('click', () => loadSubmissions(offset + 7));
   list.appendChild(more);
  }
  $('submissionsEmpty').hidden = list.children.length > 0;
 } catch (failure) {
  fail(failure);
 }
}

// A session that has gone (expired, or signed out elsewhere) is not something
// a buyer can fix inside the page: initData is only re-signed by a fresh
// launch, so the honest answer is to say so.
function reopen(message) {
 token = '';
 for (const id of panels) $(id).hidden = true;
 $('tabs').hidden = true;
 $('gate').hidden = false;
 $('gateText').textContent = message || 'This session expired. Close the shop and open it again.';
 status('');
}

// The grade list refines Raw, so it appears with Raw and is cleared on the way
// out. Leaving it set behind a hidden control would narrow the grid by
// something the buyer can no longer see, which looks like an empty shop.
function showGrades() {
 const raw = filter.condition === 'raw';
 $('gradeField').hidden = !raw;
 if (!raw) {
  filter.grades = [];
  for (const chip of document.querySelectorAll('[data-grade]')) tickGrade(chip, false);
 }
}

function tickGrade(chip, on) {
 chip.classList.toggle('active', on);
 chip.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function applyFilters() {
 filter.minPrice = cents($('minPrice').value) || 0;
 filter.maxPrice = cents($('maxPrice').value) || 0;
 filter.sort = $('sort').value;
 load(false);
}

let typing = 0;
function wireUp() {
 $('search').addEventListener('input', event => {
  query = event.target.value.trim();
  $('clear').hidden = !query;
  clearTimeout(typing);
  typing = setTimeout(() => load(false), 250);
 });
 $('clear').addEventListener('click', () => {
  $('search').value = '';
  query = '';
  $('clear').hidden = true;
  load(false);
 });
 // One chip in each group is the chosen one, and the empty value is the group
 // being switched off rather than a filter of its own.
 for (const chip of document.querySelectorAll('.chip[data-game], .chip[data-condition]')) {
  chip.addEventListener('click', () => {
   const kind = chip.dataset.game !== undefined ? 'game' : 'condition';
   for (const other of chip.parentElement.querySelectorAll('.chip')) other.classList.toggle('active', other === chip);
   filter[kind] = chip.dataset[kind];
   if (kind === 'condition') showGrades();
   load(false);
  });
 }
 // Grades tick rather than choose: a buyer who will take NM or LP is asking
 // one question, not two, and none ticked is every grade rather than none.
 for (const chip of document.querySelectorAll('.chip[data-grade]')) {
  chip.addEventListener('click', () => {
   tickGrade(chip, !chip.classList.contains('active'));
   filter.grades = [...document.querySelectorAll('.chip[data-grade].active')].map(ticked => ticked.dataset.grade);
   load(false);
  });
 }
 // One button beside the search box opens the lot. The filters apply as they
 // are touched, the same as when they were a row of chips, so the sheet needs
 // no apply step and closing it is never a decision.
 $('openFilters').addEventListener('click', () => showFilters(true));
 $('closeFilters').addEventListener('click', () => showFilters(false));
 $('doneFilters').addEventListener('click', () => showFilters(false));
 $('filterScrim').addEventListener('click', () => showFilters(false));
 document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('filters').hidden) showFilters(false);
 });
 $('minPrice').addEventListener('change', applyFilters);
 $('maxPrice').addEventListener('change', applyFilters);
 $('sort').addEventListener('change', applyFilters);
 $('resetFilters').addEventListener('click', () => {
  filter = {game: '', condition: '', grades: [], minPrice: 0, maxPrice: 0, sort: ''};
  $('minPrice').value = '';
  $('maxPrice').value = '';
  $('sort').value = '';
  for (const chip of document.querySelectorAll('[data-grade]')) tickGrade(chip, false);
  $('gradeField').hidden = true;
  for (const chip of document.querySelectorAll('.chip[data-game], .chip[data-condition]')) chip.classList.toggle('active', !chip.dataset.game && !chip.dataset.condition);
  load(false);
 });
 $('more').addEventListener('click', () => load(true));
 $('back').addEventListener('click', closeListing);
 $('previousPhoto').addEventListener('click', () => { slot -= 1; showPhoto(); });
 $('nextPhoto').addEventListener('click', () => { slot += 1; showPhoto(); });
 $('addToCart').addEventListener('click', addToCart);
 $('openInBot').addEventListener('click', event => {
  if (tg && tg.openTelegramLink && $('openInBot').href) {
   event.preventDefault();
   tg.openTelegramLink($('openInBot').href);
  }
 });
 $('cartNote').addEventListener('input', () => { cartNoteDraft = $('cartNote').value; });
 $('saveNote').addEventListener('click', () => cartAction('cart-note', {note: $('cartNote').value.trim()}));
 $('clearCart').addEventListener('click', () => cartAction('cart-clear', {}));
 $('checkout').addEventListener('click', checkout);
 for (const button of document.querySelectorAll('#tabs button')) {
  button.addEventListener('click', () => {
   show(button.dataset.tab);
   if (button.dataset.tab === 'cart') refreshCart();
   if (button.dataset.tab === 'requests') loadSubmissions();
  });
 }
 $('sellCondition').addEventListener('change', () => { $('sellSlabField').hidden = $('sellCondition').value !== 'Slab'; });
 $('requestCondition').addEventListener('change', () => { $('requestSlabField').hidden = $('requestCondition').value !== 'Slab'; });
 catalogue($('sellSearch'), $('sellResults'), entry => {
  sellCard = entry;
  $('sellCard').textContent = entry.name;
  $('sellForm').hidden = false;
  $('sellResults').textContent = '';
 });
 catalogue($('requestSearch'), $('requestResults'), entry => {
  requestCard = entry;
  $('requestCard').textContent = entry.name;
  $('requestForm').hidden = false;
  $('requestResults').textContent = '';
 });
 $('sellFront').addEventListener('change', () => uploadPhoto($('sellFront'), 'front'));
 $('sellBack').addEventListener('change', () => uploadPhoto($('sellBack'), 'back'));
 $('sellDetails').addEventListener('change', () => uploadPhoto($('sellDetails'), 'details'));
 $('sellSkipPhotos').addEventListener('change', showSellPhotoState);
 $('sellPublish').addEventListener('click', publishListing);
 $('sellCancel').addEventListener('click', resetSell);
 $('requestSend').addEventListener('click', sendRequest);
 $('requestCancel').addEventListener('click', () => {
  requestCard = null;
  $('requestForm').hidden = true;
  $('requestSearch').value = '';
 });
 if (tg && tg.BackButton) tg.BackButton.onClick(closeListing);
}

async function start() {
 wireUp();
 if (!tg || !tg.initData) {
  $('gateText').textContent = 'Open this from the card bot in Telegram.';
  return;
 }
 const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
 for (const method of ['setHeaderColor', 'setBackgroundColor', 'setBottomBarColor']) {
  try { tg[method]?.(background); } catch { /* Older Telegram clients may reject custom colors. */ }
 }
 tg.ready();
 tg.expand();
 try {
  const session = await api('login', {initData: tg.initData});
  token = session.token;
  role = session.role || 'buyer';
  document.body.dataset.role = role;
  // Listing a card is refused by the server for anyone else, so the tab is
  // shown to the roles that can use it rather than offered and then denied.
  $('tabs').querySelector('[data-tab="sell"]').hidden = role === 'buyer';
  $('gate').hidden = true;
  $('tabs').hidden = false;
  show('browse');
  await load(false);
  await refreshCart();
 } catch (failure) {
  $('gateText').textContent = failure.message;
 }
}

start();
})();
