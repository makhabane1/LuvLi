/* =============================================================================
   vision-board.js — Luvli Vision Board
   -----------------------------------------------------------------------------
   Manages boards, items, and Pinterest URL fetching.
   Persists to the same localStorage key as the rest of Luvli.
   ========================================================================== */
'use strict';

function vbId(id) { return document.getElementById(id); }
function vbAll(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/* ------------------------------ UI module -------------------------------- */
const VUI = (() => {
  function toast(opts) {
    const o = typeof opts === 'string' ? { body: opts } : (opts || {});
    const stack = vbId('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="toast-ico">' + ico(o.icon || 'heart') + '</span>' +
      '<div class="toast-text"><div class="toast-title">' + Utils.escapeHtml(o.title || 'Luvli') + '</div>' +
      (o.body ? '<div class="toast-body">' + Utils.escapeHtml(o.body) + '</div>' : '') + '</div>';
    stack.appendChild(el);
    while (stack.children.length > 4) stack.removeChild(stack.firstChild);
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 320); }, o.duration || 5000);
  }
  let ob = null, lf = null;
  function ab(a) { return '<button class="btn btn-' + (a.variant || 'soft') + '" type="button" data-action="' + a.action + '"' + (a.attrs ? ' ' + a.attrs : '') + '>' + a.label + '</button>'; }
  function modal(opts) {
    const o = opts || {}; closeModal();
    const root = vbId('modalRoot'); if (!root) return;
    lf = document.activeElement;
    const b = document.createElement('div');
    b.className = 'modal-backdrop';
    b.innerHTML = '<div class="modal' + (o.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + Utils.escapeHtml(o.title || 'Luvli') + '">' +
      '<div class="modal-head"><div><h2 class="modal-title">' + (o.title || '') + '</h2>' + (o.sub ? '<p class="modal-sub">' + o.sub + '</p>' : '') +
      '</div><button class="modal-close" type="button" data-close="1" aria-label="Close">' + ico('x') + '</button></div>' +
      '<div class="modal-body">' + (o.bodyHtml || '') + '</div>' +
      ((o.actions && o.actions.length) ? '<div class="modal-foot">' + o.actions.map(ab).join('') + '</div>' : '') + '</div>';
    root.appendChild(b); ob = b;
    b.addEventListener('click', (e) => { if (e.target === b || e.target.getAttribute('data-close')) closeModal(); });
    document.addEventListener('keydown', onEsc);
    const f = b.querySelector('input, select, textarea'); if (f) setTimeout(() => f.focus(), 80);
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    if (!ob) return; ob.remove(); ob = null;
    document.removeEventListener('keydown', onEsc);
    if (lf && lf.focus) { try { lf.focus(); } catch (e) {} } lf = null;
  }
  function confirm(opts) {
    const o = opts || {};
    modal({ title: o.title || 'Are you sure?', sub: o.sub || '', bodyHtml: o.bodyHtml || '',
      actions: [{ label: o.cancelLabel || 'Never mind', action: 'modal-cancel', variant: 'ghost' },
        { label: o.confirmLabel || 'Yes, please', action: o.confirmAction, variant: o.variant || 'primary' }] });
  }
  return { toast, modal, closeModal, confirm };
})();

const VisionBoard = (() => {
  const K = 'visionboard';
  let active = null, masonry = false, pendingRm = null;

  function get() {
    const s = Storage.get();
    if (!s[K]) {
      s[K] = { boards: [{ id: Utils.uid('vb'), name: 'My Dream Life', emoji: '✨', createdAt: Date.now() }], items: [] };
      Storage.save();
    }
    return s[K];
  }
  function save(vb) {
    const s = Storage.get();
    s[K] = vb;
    Storage.save();
    // Storage.save() alone doesn't notify subscribers — only Storage.update()
    // does that normally. Vision Board bypasses update() (it mutates its own
    // object directly rather than through a mutator callback), so it emits
    // explicitly here. This is what lets js/data-sync-supabase.js's
    // Storage.subscribe() listener notice vision board changes at all.
    if (typeof Storage.emit === 'function') Storage.emit('visionboard');
  }
  function render() { ensureActiveExists(); renderBoards(); renderGrid(); renderCounts(); }

  /**
   * The board list can be replaced underneath us (a cloud pull swaps in the
   * account's real boards after init() already picked one), so `active` must
   * always be re-checked against the current list — otherwise the grid filters
   * by a board that no longer exists, and new items get attached to it and are
   * rejected by the database (vision_board_items.board_id is a real FK).
   */
  function ensureActiveExists() {
    const vb = get();
    if (active && !vb.boards.some((b) => b.id === active)) active = vb.boards[0] ? vb.boards[0].id : null;
  }

  /* --------------------------- private photo storage ---------------------------
     Uploaded photos live in the private 'vision-board' Supabase Storage bucket at
     <user id>/<item id>.jpg (supabase/migrations/0011_vision_board_storage.sql).
     The item stores 'sb:<path>' rather than the image itself; showing it needs a
     short-lived signed URL, fetched in batches and cached here. With no real
     backend (local provider) photos fall back to an inline data: URL — but
     downscaled first, so they stay small either way. */
  const BUCKET = 'vision-board';
  const SB_PREFIX = 'sb:';
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const signed = {};     // path -> { url, exp }
  const failedAt = {};   // path -> when signing last failed (stops a retry loop)
  let signing = false;

  function cloudReady() {
    const provider = typeof Auth !== 'undefined' && Auth.activeProvider && Auth.activeProvider();
    return Boolean(provider && provider.isLocal === false && window.supabaseClient && Auth.current());
  }

  function storagePath(url) {
    const u = String(url || '');
    return u.indexOf(SB_PREFIX) === 0 ? u.slice(SB_PREFIX.length) : null;
  }

  function displayUrl(item) {
    const path = storagePath(item.url);
    if (!path) return item.url;
    const hit = signed[path];
    return hit && hit.exp > Date.now() ? hit.url : BLANK;
  }

  /** Sign any stored photos that are missing or about to expire, then repaint. */
  function refreshSignedUrls() {
    if (signing || !cloudReady()) return;
    const soon = Date.now() + 5 * 60 * 1000;
    const recent = Date.now() - 60 * 1000;
    const paths = get().items.map((i) => storagePath(i.url))
      .filter((p) => p && !(signed[p] && signed[p].exp > soon) && !(failedAt[p] > recent));
    if (!paths.length) return;
    signing = true;
    window.supabaseClient.storage.from(BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      const ok = {};
      (data || []).forEach((row) => {
        if (row && row.signedUrl) { signed[row.path] = { url: row.signedUrl, exp: Date.now() + 55 * 60 * 1000 }; ok[row.path] = true; }
      });
      paths.forEach((p) => { if (!ok[p]) failedAt[p] = Date.now(); });
    }).catch(() => {
      paths.forEach((p) => { failedAt[p] = Date.now(); });
    }).finally(() => { signing = false; renderGrid(); });
  }

  /** Shrink a photo to at most 1600px on its long side, as JPEG — a ~4MB phone photo becomes a few hundred KB. */
  function downscale(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const src = URL.createObjectURL(blob);
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(src);
        canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('Could not process image'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Could not read image')); };
      img.src = src;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  }

  function uploadPhoto(blob, itemId) {
    const path = Auth.current().id + '/' + itemId + '.jpg';
    return window.supabaseClient.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      .then(({ error }) => { if (error) throw error; return SB_PREFIX + path; });
  }

  /** One-time move of any older inline (base64) photos into private storage, freeing localStorage. */
  function migrateInlinePhotos() {
    if (!cloudReady()) return Promise.resolve();
    const inline = get().items.filter((i) => String(i.url || '').indexOf('data:image/') === 0);
    if (!inline.length) return Promise.resolve();
    return inline.reduce((chain, item) => chain.then(() =>
      fetch(item.url).then((r) => r.blob()).then(downscale).then((blob) => uploadPhoto(blob, item.id)).then((newUrl) => {
        const vb = get();
        const target = vb.items.find((i) => i.id === item.id);
        if (target) { target.url = newUrl; save(vb); }
      }).catch(() => { /* leave it inline; try again next visit */ })
    ), Promise.resolve()).then(() => refreshSignedUrls());
  }

  function renderBoards() {
    const vb = get(); const nav = vbId('vbBoardsNav'); if (!nav) return;
    if (!vb.boards.length) { nav.innerHTML = '<span class="chip chip-soft">No boards yet.</span>'; return; }
    nav.innerHTML = vb.boards.map((b) => {
      const n = vb.items.filter((i) => i.boardId === b.id).length;
      const on = b.id === active;
      return '<button class="vb-board-chip' + (on ? ' is-active' : '') + '" type="button" data-board="' + b.id + '">' +
        '<span>' + (b.emoji || '✨') + '</span><span>' + Utils.escapeHtml(b.name) + '</span>' +
        '<span class="vb-board-chip-count">' + n + '</span></button>';
    }).join('');
  }

  function renderGrid() {
    const vb = get(); const grid = vbId('vbGrid'); const empty = vbId('vbEmpty'); const title = vbId('vbCurrentBoardTitle');
    if (!grid) return;
    let items = vb.items;
    if (active) {
      items = items.filter((i) => i.boardId === active);
      const b = vb.boards.find((x) => x.id === active);
      if (title && b) title.textContent = b.name;
    } else { if (title) title.textContent = 'All items'; }
    if (!items.length) { grid.innerHTML = ''; if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    grid.className = 'vb-grid' + (masonry ? ' is-masonry' : '');
    grid.innerHTML = items.map((item) => {
      const sz = item.size || '';
      const note = item.note ? '<div class="vb-item-overlay"><span class="vb-item-note">' + Utils.escapeHtml(item.note) + '</span></div>' : '';
      const pin = item.source === 'pinterest' ? '<button class="vb-item-btn" type="button" data-act="source" title="Pinterest">' + ico('pinterest') + '</button>' : '';
      return '<div class="vb-item ' + sz + '" data-id="' + item.id + '">' +
        '<img class="vb-item-img" src="' + Utils.escapeHtml(displayUrl(item)) + '" alt="' + Utils.escapeHtml(item.note || 'Vision') + '" loading="lazy" />' +
        note + '<div class="vb-item-actions">' + pin +
        '<button class="vb-item-btn" type="button" data-act="note" title="Edit">' + ico('pencil') + '</button>' +
        '<button class="vb-item-btn" type="button" data-act="remove" title="Remove">' + ico('trash') + '</button>' +
        '</div></div>';
    }).join('');
    refreshSignedUrls();
  }

  function renderCounts() {
    const vb = get();
    const bc = vbId('vbBoardCount'); const ic = vbId('vbItemCount');
    if (bc) bc.textContent = vb.boards.length + ' board' + (vb.boards.length !== 1 ? 's' : '');
    if (ic) ic.textContent = vb.items.length + ' item' + (vb.items.length !== 1 ? 's' : '');
  }

  function setActive(id) { active = id === active ? null : id; render(); }

  function createBoard(name, emoji) {
    const vb = get();
    const b = { id: Utils.uid('vb'), name: name || 'Untitled', emoji: emoji || '✨', createdAt: Date.now() };
    vb.boards.push(b); save(vb); active = b.id; render();
    VUI.toast({ title: 'Board created', body: '"' + b.name + '" is ready.', icon: 'grid' });
    return b;
  }

  function addItem(bid, url, note, source, id) {
    const vb = get();
    const sizes = ['', '', 'tall', 'wide', 'tall', '', 'big', 'tall'];
    const exists = (x) => x && vb.boards.some((b) => b.id === x);
    const boardId = exists(bid) ? bid : (exists(active) ? active : (vb.boards[0] && vb.boards[0].id));
    const item = { id: id || Utils.uid('vb-item'), boardId: boardId,
      url: url, note: note || '', source: source || 'manual',
      size: sizes[Math.floor(Math.random() * sizes.length)], createdAt: Date.now() };
    vb.items.push(item); save(vb); active = item.boardId; render();
    return item;
  }

  function removeItem(id) {
    const vb = get();
    const item = vb.items.find((i) => i.id === id);
    const path = item && storagePath(item.url);
    vb.items = vb.items.filter((i) => i.id !== id); save(vb); render();
    // Don't leave the photo itself behind in storage once its item is gone.
    if (path && cloudReady()) window.supabaseClient.storage.from(BUCKET).remove([path]).catch(() => {});
    VUI.toast({ title: 'Removed', icon: 'trash' });
  }
  function updateNote(id, note) { const vb = get(); const it = vb.items.find((i) => i.id === id); if (it) { it.note = note; save(vb); renderGrid(); } }

  function shuffle() {
    const vb = get();
    for (let i = vb.items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vb.items[i], vb.items[j]] = [vb.items[j], vb.items[i]]; }
    save(vb); renderGrid(); VUI.toast({ title: 'Shuffled', body: 'Fresh arrangement.', icon: 'sparkles' });
  }

  function openAddModal() {
    const vb = get();
    const opts = vb.boards.map((b) => '<option value="' + b.id + '"' + (b.id === active ? ' selected' : '') + '>' + Utils.escapeHtml(b.emoji + ' ' + b.name) + '</option>').join('');
    VUI.modal({
      title: 'Add an image', sub: 'Paste any image URL, or upload from your device.',
      bodyHtml: '<img class="vb-modal-preview" id="vbPreviewImg" src="" alt="" style="display:none;" />' +
        '<label class="field"><span class="field-label">Image URL</span><input class="input" id="vbImageUrl" type="url" placeholder="https://i.pinimg.com/..." /></label>' +
        '<div class="row-gap row-wrap mt-12"><button class="btn btn-soft btn-small" id="vbUploadBtn" type="button">Upload from device</button><button class="btn btn-ghost btn-small" id="vbPreviewBtn" type="button">Preview</button></div>' +
        '<label class="field mt-12"><span class="field-label">Add a note (optional)</span><input class="input" id="vbImageNote" type="text" placeholder="Why does this inspire you?" /></label>' +
        '<label class="field mt-12"><span class="field-label">Add to board</span><select class="input" id="vbImageBoard">' + opts + '</select></label>',
      actions: [{ label: 'Cancel', action: 'modal-cancel', variant: 'ghost' }, { label: 'Add to board', action: 'vb-add-confirm', variant: 'primary' }]
    });
    setTimeout(() => {
      const u = vbId('vbImageUrl'), p = vbId('vbPreviewImg');
      if (u) u.addEventListener('input', () => { if (p && u.value) { p.src = u.value; p.style.display = ''; } });
      const ub = vbId('vbUploadBtn'); if (ub) ub.addEventListener('click', () => { const fi = vbId('vbFileInput'); if (fi) fi.click(); });
      const pb = vbId('vbPreviewBtn'); if (pb) pb.addEventListener('click', () => { if (p && u.value) { p.src = u.value; p.style.display = ''; } });
    }, 100);
  }

  function openPinterestModal() {
    VUI.modal({
      title: 'Fetch from Pinterest', sub: 'Paste a Pinterest board or pin URL.',
      bodyHtml: '<label class="field"><span class="field-label">Pinterest URL</span><input class="input" id="vbPinterestUrl" type="url" placeholder="https://www.pinterest.com/username/board-name/" /></label>' +
        '<div class="vb-pinterest-hint"><span>' + ico('info') + '</span><span>Pinterest doesn\'t allow direct browser fetching. Paste your board URL, open it, then copy image URLs to add them.</span></div>' +
        '<label class="field mt-12"><span class="field-label">Direct image URLs (one per line)</span><textarea class="input" id="vbDirectUrls" rows="4" placeholder="https://i.pinimg.com/..."></textarea></label>' +
        '<div class="row-gap row-wrap mt-12"><a class="btn btn-soft btn-small" id="vbOpenPinterest" href="#" target="_blank" rel="noopener">Open Pinterest</a></div>',
      actions: [{ label: 'Cancel', action: 'modal-cancel', variant: 'ghost' }, { label: 'Add images', action: 'vb-pinterest-confirm', variant: 'primary' }]
    });
    setTimeout(() => { const u = vbId('vbPinterestUrl'), ob = vbId('vbOpenPinterest'); if (u && ob) u.addEventListener('input', () => { ob.href = u.value || '#'; }); }, 100);
  }

  function openNewBoardModal() {
    VUI.modal({
      title: 'Create a new board', sub: 'Give your board a name and an emoji.',
      bodyHtml: '<label class="field"><span class="field-label">Board name</span><input class="input" id="vbBoardName" type="text" placeholder="e.g. Dream Home, Career Goals..." /></label>' +
        '<label class="field mt-12"><span class="field-label">Emoji</span><input class="input" id="vbBoardEmoji" type="text" placeholder="✨" maxlength="4" /></label>',
      actions: [{ label: 'Cancel', action: 'modal-cancel', variant: 'ghost' }, { label: 'Create board', action: 'vb-board-confirm', variant: 'primary' }]
    });
    setTimeout(() => { const el = vbId('vbBoardName'); if (el) el.focus(); }, 80);
  }

  function openNoteModal(itemId) {
    const vb = get(); const item = vb.items.find((i) => i.id === itemId);
    if (!item) return;
    VUI.modal({
      title: 'Edit note', sub: 'Add meaning to this image.',
      bodyHtml: '<img class="vb-modal-preview" src="' + Utils.escapeHtml(item.url) + '" alt="" />' +
        '<label class="field"><span class="field-label">Your note</span><input class="input" id="vbNoteInput" type="text" value="' + Utils.escapeHtml(item.note || '') + '" placeholder="Why does this inspire you?" /></label>',
      actions: [{ label: 'Cancel', action: 'modal-cancel', variant: 'ghost' }, { label: 'Save', action: 'vb-note-confirm', variant: 'primary', attrs: 'data-item="' + itemId + '"' }]
    });
    setTimeout(() => { const el = vbId('vbNoteInput'); if (el) el.focus(); }, 80);
  }

  function openLightbox(url) {
    const ex = document.querySelector('.vb-lightbox'); if (ex) ex.remove();
    const lb = document.createElement('div');
    lb.className = 'vb-lightbox';
    lb.innerHTML = '<button class="vb-lightbox-close" type="button" aria-label="Close">' + ico('x') + '</button>' +
      '<img class="vb-lightbox-img" src="' + Utils.escapeHtml(url) + '" alt="Vision board image" />';
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.remove(); });
    document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey); } });
  }

  function handleFileUpload(files) {
    const vb = get();
    const bid = active || (vb.boards[0] && vb.boards[0].id);
    if (!bid) { VUI.toast({ title: 'Create a board first', body: 'You need at least one board.', icon: 'alert' }); return; }
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 20 * 1024 * 1024) {
        VUI.toast({ title: 'That photo is too large', body: 'Please choose one under 20MB.', icon: 'alert' });
        return;
      }
      const itemId = Utils.uid('vb-item');
      downscale(file)
        .then((blob) => (cloudReady() ? uploadPhoto(blob, itemId) : blobToDataUrl(blob)))
        .then((url) => { addItem(bid, url, '', 'upload', itemId); })
        .catch(() => VUI.toast({ title: 'Could not add that photo', body: 'Please try again.', icon: 'alert' }));
    });
  }

  function bind() {
    vbAll('.vb-quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-quick');
        if (q === 'pinterest') openPinterestModal();
        else if (q === 'upload') { const fi = vbId('vbFileInput'); if (fi) fi.click(); }
        else if (q === 'url') openAddModal();
        else if (q === 'board') openNewBoardModal();
      });
    });
    const addBtn = vbId('vbAddBtn'), pinBtn = vbId('vbPinterestBtn'), emptyAdd = vbId('vbEmptyAddBtn'), lb = vbId('vbLayoutBtn'), sb = vbId('vbShuffleBtn');
    if (addBtn) addBtn.addEventListener('click', () => openAddModal());
    if (pinBtn) pinBtn.addEventListener('click', () => openPinterestModal());
    if (emptyAdd) emptyAdd.addEventListener('click', () => openAddModal());
    if (lb) lb.addEventListener('click', () => { masonry = !masonry; renderGrid(); });
    if (sb) sb.addEventListener('click', () => shuffle());
    const bn = vbId('vbBoardsNav');
    if (bn) bn.addEventListener('click', (e) => { const c = e.target.closest('.vb-board-chip'); if (c) setActive(c.getAttribute('data-board')); });
    const grid = vbId('vbGrid');
    if (grid) grid.addEventListener('click', (e) => {
      const item = e.target.closest('.vb-item'); if (!item) return;
      const iid = item.getAttribute('data-id');
      const ab = e.target.closest('.vb-item-btn');
      if (ab) {
        const a = ab.getAttribute('data-act');
        if (a === 'note') openNoteModal(iid);
        else if (a === 'remove') { VUI.confirm({ title: 'Remove this image?', sub: 'This removes it from your board.', confirmAction: 'vb-remove-item', confirmLabel: 'Remove', variant: 'danger' }); pendingRm = iid; }
        return;
      }
      const img = item.querySelector('.vb-item-img'); if (img) openLightbox(img.src);
    });
    const mr = vbId('modalRoot');
    if (mr) mr.addEventListener('click', (e) => {
      const ab = e.target.closest('[data-action]'); if (!ab) return;
      const a = ab.getAttribute('data-action');
      if (a === 'vb-add-confirm') {
        const url = vbId('vbImageUrl').value.trim(), note = vbId('vbImageNote').value.trim(), bid = vbId('vbImageBoard').value;
        if (!url) { VUI.toast({ title: 'Add an image URL', body: 'Paste a URL.', icon: 'alert' }); return; }
        addItem(bid, url, note, 'manual'); VUI.closeModal();
      } else if (a === 'vb-pinterest-confirm') {
        const du = vbId('vbDirectUrls').value.trim(), vb = get(), bid = active || (vb.boards[0] && vb.boards[0].id);
        if (du) { const urls = du.split('\n').map((x) => x.trim()).filter(Boolean); urls.forEach((u) => addItem(bid, u, '', 'pinterest')); VUI.toast({ title: 'Added ' + urls.length + ' image' + (urls.length !== 1 ? 's' : ''), icon: 'heart' }); }
        VUI.closeModal();
      } else if (a === 'vb-board-confirm') {
        const n = vbId('vbBoardName').value.trim(), em = vbId('vbBoardEmoji').value.trim() || '✨';
        if (!n) { VUI.toast({ title: 'Give your board a name', icon: 'alert' }); return; }
        createBoard(n, em); VUI.closeModal();
      } else if (a === 'vb-note-confirm') {
        const iid = ab.getAttribute('data-item'), note = vbId('vbNoteInput').value.trim(); updateNote(iid, note); VUI.closeModal();
      } else if (a === 'vb-remove-item') { if (pendingRm) { removeItem(pendingRm); pendingRm = null; } VUI.closeModal(); }
    });
    const fi = vbId('vbFileInput');
    if (fi) fi.addEventListener('change', (e) => { if (e.target.files && e.target.files.length) { handleFileUpload(e.target.files); e.target.value = ''; } });
  }

  function init() { const vb = get(); if (vb.boards.length && !active) active = vb.boards[0].id; bind(); render(); }
  return { init, render, migrateInlinePhotos };
})();

document.addEventListener('DOMContentLoaded', () => {
  VisionBoard.init();
  // A real backend's data arrives asynchronously (see js/data-sync-supabase.js) —
  // once the initial pull replaces state.visionboard, repaint with it.
  // Auth.ready() resolves instantly for the local provider, so this is a
  // no-op there.
  if (typeof Auth !== 'undefined' && typeof SupabaseSync !== 'undefined') {
    Auth.ready().then(() => SupabaseSync.init())
      .then(() => { VisionBoard.render(); return VisionBoard.migrateInlinePhotos(); })
      .then(() => VisionBoard.render());
  }
});