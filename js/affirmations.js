/* =============================================================================
 affirmations.js — Luvli's little reminders
 -----------------------------------------------------------------------------
 A small library of affirmations grouped by category, plus the tiny helpers
 used by the Affirmations page, the Home quote card and Focus mode.
 ========================================================================== */
'use strict';

const Affirmations = (() => {

 /** The categories a user can choose from in Settings. */
 const CATEGORIES = [
 { key: 'self-love',  label: 'Self-love',  emoji: '' },
 { key: 'confidence', label: 'Confidence',  emoji: '' },
 { key: 'studying',  label: 'Studying',  emoji: '' },
 { key: 'discipline', label: 'Discipline',  emoji: '' },
 { key: 'success',  label: 'Success',  emoji: '' },
 { key: 'motivation', label: 'Motivation',  emoji: '' },
 { key: 'rest',  label: 'Rest' },
 { key: 'growth',  label: 'Personal growth', emoji: '' },
 { key: 'student',  label: 'Student life' }
 ];

 /** Every affirmation, grouped by category key. */
 const LIBRARY = {
 'self-love': [
 'I am allowed to be gentle with myself.',
 'I am worthy of the love I give so easily to others.',
 'I am proud of myself for showing up.',
 'My worth is not measured by my productivity.',
 'You are allowed to rest.',
 'I deserve kindness, especially from me.'
 ],
 confidence: [
 'I am capable of creating the life I want.',
 'I trust myself to figure things out.',
 'I can do hard things, one small step at a time.',
 'My voice and my ideas matter.',
 'I am becoming the person I want to be.',
 "I don't need to be perfect. I just need to begin."
 ],
 studying: [
 'Small progress is still progress.',
 "Every page I read is a vote for the person I'm becoming.",
 'I learn a little more every single day.',
 'Confusion is just the beginning of understanding.',
 'Showing up to study is already a win.',
 'My brain grows every time I try.'
 ],
 discipline: [
 'I keep the promises I make to myself.',
 'I choose what I want most over what I want now.',
 'Today I show up, even if it is not perfect.',
 'Discipline is a way of loving my future self.',
 'One habit at a time, I am building my life.',
 'I do it because I said I would.'
 ],
 success: [
 'My future is built by what I do today.',
 "Good things are coming, and I'm getting ready for them.",
 'I am allowed to want a beautiful life.',
 'I am building something worth being proud of.',
 'What I do consistently will change my life.'
 ],
 motivation: [
 "Let's make today feel luvli.",
 'Ten focused minutes beat a perfect plan.',
 'Begin now, and momentum will follow.',
 'I can start badly and finish beautifully.',
 'The best time to begin is right after I decide.'
 ],
 rest: [
 'You did enough today.',
 "Rest is productive — I'm refilling my energy.",
 "I don't have to earn my rest.",
 'Slowing down is part of going far.',
 'My body and mind deserve quiet.'
 ],
 growth: [
 "I'm becoming the person I want to be.",
 "I am growing even when I can't see it yet.",
 'Being a beginner is a brave thing to be.',
 "I'm allowed to change my mind and my plans.",
 "Every day I'm one small step further.",
 "I am proud of how far I've come."
 ],
 /* Shown while Student Space is on (see student-mode.js). */
 student: [
 'Your effort today builds your future.',
 'One page, one lesson, one step at a time.',
 "You don't have to know everything today. Keep learning.",
 'Progress matters more than perfection.',
 'You are allowed to learn slowly and still be brilliant.',
 'A hard chapter is not a hard life. Keep going, luv.',
 'Your brain is allowed to take up space here.',
 'Rest is part of studying well.',
 'Every exam you have ever sat, you survived.',
 'One focused hour beats a whole anxious day.'
 ]
 };

 /** Short, soft lines that suit the Focus timer screen. */
 const FOCUS_LINES = [
 'You are doing better than you think.',
 'One task. One breath. One moment.',
 'Focus is a form of self-respect.',
 "You don't have to rush, luv.",
 "This is your time — I'll hold the clock.",
 'Concentration is a muscle. You are training it.',
 'Be proud of yourself for starting.',
 'A little progress, again and again, adds up.'
 ];

 /* ------------------------------- helpers -------------------------------- */
 const label = (key) => {
 const found = CATEGORIES.find((c) => c.key === key);
 return found ? found.label : (key === 'mine' ? 'Mine' : 'For you');
 };

 /** All affirmations matching the categories the user chose. */
 function pool(state) {
 const chosen = (state.settings.affirmations && state.settings.affirmations.categories) || [];
 const keys = chosen.length ? chosen : CATEGORIES.map((c) => c.key);
 // Student Space adds its own little reminders on top, without the user
 // having to tick another box.
 if (state.student && state.student.enabled && keys.indexOf('student') === -1) keys.push('student');
 const list = [];
 keys.forEach((key) => {
 (LIBRARY[key] || []).forEach((text) => list.push({ text, category: key }));
 });
 (state.affirmations.custom || []).forEach((text) => list.push({ text, category: 'mine' }));
 return list.length ? list : [{ text: 'Small progress is still progress.', category: 'studying' }];
 }

 /**
 * One affirmation for the user.
 * @param {object} state
 * @param {{ focus?: boolean, mood?: string, exclude?: string }} [options]
 */
 function random(state, options) {
 const opts = options || {};

 if (opts.focus) {
 const texts = pool(state).map((p) => p.text).concat(FOCUS_LINES);
 return { text: Utils.pickRandom(texts), category: 'motivation' };
 }

 // A low mood calls for the softer categories
 let candidates = pool(state);
 if (opts.mood === 'low' || opts.mood === 'exhausted' || opts.mood === 'difficult') {
 const soft = candidates.filter((c) => c.category === 'rest' || c.category === 'self-love');
 if (soft.length) candidates = soft.concat(Utils.pickRandom(candidates) ? [Utils.pickRandom(candidates)] : []);
 }

 let pick = Utils.pickRandom(candidates);
 if (pick && opts.exclude && pick.text === opts.exclude && candidates.length > 1) {
 const others = candidates.filter((c) => c.text !== opts.exclude);
 pick = Utils.pickRandom(others) || pick;
 }
 return pick;
 }

 /** Favourites are stored as plain text, or as { text, category }. */
 function normalizeFavorite(entry) {
 if (typeof entry === 'string') return { text: entry, category: 'mine' };
 return { text: entry.text, category: entry.category || 'mine' };
 }

 const isFavorite = (state, text) =>
 (state.affirmations.favorites || []).some((f) => normalizeFavorite(f).text === text);

 /** Category chips. `readonly` is used on the Affirmations page for pure browsing. */
 function categoryChips(state, options) {
 const opts = options || {};
 const chosen = (state.settings.affirmations && state.settings.affirmations.categories) || [];
 return CATEGORIES.map((c) => {
 const on = chosen.indexOf(c.key) > -1;
 const action = opts.action || 'toggle-aff-category';
 return '<button class="chip-item' + (on ? ' is-on' : '') + '" type="button" ' +
 'aria-pressed="' + (on ? 'true' : 'false') + '" ' +
 'data-action="' + action + '" data-key="' + c.key + '">' +
 '<span>' + c.emoji + ' ' + c.label + '</span>' +
 (on ? '<span class="chip-x" aria-hidden="true">✓</span>' : '') +
 '</button>';
 }).join('');
 }

 /** Saved affirmations with a remove button. */
 function renderFavorites(state) {
 const list = state.affirmations.favorites || [];
 if (!list.length) {
 return '<div class="empty-state"><span class="empty-ico">' + ico('heart') + '</span><strong>Nothing saved yet</strong>' +
 '<p>Tap “Save this” on an affirmation you love.</p></div>';
 }
 return list.map((entry, index) => {
 const fav = normalizeFavorite(entry);
 return '<div class="af-item"><span class="af-item-text">' + Utils.escapeHtml(fav.text) + '</span>' +
 '<button class="chip-x" type="button" data-action="remove-favorite" data-index="' + index + '" ' +
 'aria-label="Remove saved affirmation">×</button></div>';
 }).join('');
 }

 /** The user's own affirmations. */
 function renderCustom(state) {
 const list = state.affirmations.custom || [];
 if (!list.length) {
 return '<div class="empty-state"><span class="empty-ico">' + ico('note') + '</span><strong>No words of your own yet</strong>' +
 '<p>Write something you need to hear.</p></div>';
 }
 return list.map((text, index) =>
 '<div class="af-item"><span class="af-item-text">' + Utils.escapeHtml(text) + '</span>' +
 '<button class="chip-x" type="button" data-action="remove-custom-affirmation" data-index="' + index + '" ' +
 'aria-label="Remove affirmation">×</button></div>').join('');
 }

 return {
 CATEGORIES, LIBRARY, FOCUS_LINES,
 label, pool, random, normalizeFavorite, isFavorite,
 categoryChips, renderFavorites, renderCustom
 };
})();
