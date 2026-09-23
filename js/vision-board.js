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
  function save(vb) { const s = Storage.get(); s[K] = vb; Storage.save(); }
  function render() { renderBoards(); renderGrid(); renderCounts(); }

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
        '<img class="vb-item-img" src="' + Utils.escapeHtml(item.url) + '" alt="' + Utils.escapeHtml(item.note || 'Vision') + '" loading="lazy" />' +
        note + '<div class="vb-item-actions">' + pin +
        '<button class="vb-item-btn" type="button" data-act="note" title="Edit">' + ico('pencil') + '</button>' +
        '<button class="vb-item-btn" type="button" data-act="remove" title="Remove">' + ico('trash') + '</button>' +
        '</div></div>';
    }).join('');
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

  function addItem(bid, url, note, source) {
    const vb = get();
    const sizes = ['', '', 'tall', 'wide', 'tall', '', 'big', 'tall'];
    const item = { id: Utils.uid('vb-item'), boardId: bid || active || (vb.boards[0] && vb.boards[0].id),
      url: url, note: note || '', source: source || 'manual',
      size: sizes[Math.floor(Math.random() * sizes.length)], createdAt: Date.now() };
    vb.items.push(item); save(vb); active = item.boardId; render();
    return item;
  }

  function removeItem(id) { const vb = get(); vb.items = vb.items.filter((i) => i.id !== id); save(vb); render(); VUI.toast({ title: 'Removed', icon: 'trash' }); }
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
      const reader = new FileReader();
      reader.onload = (e) => { addItem(bid, e.target.result, '', 'upload'); };
      reader.readAsDataURL(file);
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
  return { init };
})();

document.addEventListener('DOMContentLoaded', () => VisionBoard.init());