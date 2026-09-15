/* =============================================================================
   icons.js — Luvli's icon system
   -----------------------------------------------------------------------------
   A small library of inline SVG line icons (stroke-based, currentColor) that
   replace emoji everywhere in the interface. Two ways to use it:

     ico('home')              -> '<svg …>' for template strings in JS
     <span data-ico="home">   -> hydrated once on load (static markup only)

   Icons inherit their colour and size from CSS (`color`, `font-size`), so the
   existing sizing rules keep working unchanged.
   ========================================================================== */
'use strict';

const LUVLI_ICONS = {
  'heart': '<path d="M12 20.3S4 15 4 9.6A4.4 4.4 0 0 1 12 6.9a4.4 4.4 0 0 1 8 2.7c0 5.4-8 10.7-8 10.7z"/>',
  'home': '<path d="M3.5 10.5 12 3.5l8.5 7M5.5 9.3V20h13V9.3M10 20v-5.5h4V20"/>',
  'calendar': '<path d="M4.5 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM4.5 10.5h15M8.5 3v4M15.5 3v4"/>',
  'calendar-check': '<path d="M4.5 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM4.5 10.5h15M8.5 3v4M15.5 3v4M9.5 15.5l2 2 3.5-3.5"/>',
  'book': '<path d="M4.5 19.2V6a2 2 0 0 1 2-2H19.5v13H6.5a2 2 0 0 0-2 2.2zM4.5 19.2a2 2 0 0 0 2 2h13M19.5 17v4.2"/>',
  'sparkles': '<path d="M12 4.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM18.5 15.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/>',
  'chart': '<path d="M4 4v16h16M8.5 16v-5M12.5 16V8.5M16.5 16v-8"/>',
  'settings': '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/>',
  'flame': '<path d="M12 3.5c1.6 2.4 5 5.2 5 8.8a5 5 0 0 1-10 0c0-2.9 2-5.4 3.4-7-.1 1.9.3 3.1 1.6 4.2 0-2.2 0-4.2 0-6z"/>',
  'bell': '<path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4.6 1.8 5.7 1.8 5.7H4.7s1.8-1.1 1.8-5.7M10.2 19a2 2 0 0 0 3.6 0"/>',
  'bell-off': '<path d="M6.6 9.6a5.4 5.4 0 0 1 8-4.7M17.5 12.4c0 1.8 1.8 2.8 1.8 2.8H8M10.2 19a2 2 0 0 0 3.6 0M4 4.5l16 15"/>',
  'megaphone': '<path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l7 4V5l-7 4H5.5A1.5 1.5 0 0 0 4 10.5zM18 9.5a3.5 3.5 0 0 1 0 5"/>',
  'scale': '<path d="M12 3.5v17M7 20.5h10M4 8h16M4 8l-2.2 4.6a2.6 2.6 0 0 0 4.4 0zM20 8l-2.2 4.6a2.6 2.6 0 0 0 4.4 0zM12 3.5 4 8M12 3.5 20 8"/>',
  'shuffle': '<path d="M4 6.5h3.5c1.4 0 2.7.7 3.5 1.8l2.6 3.6c.8 1.1 2.1 1.8 3.5 1.8H20M17 11l3 3-3 3M4 17.5h3.5c1.4 0 2.7-.7 3.5-1.8l.6-.8M15 8l2-1.5h3M17 3.5 20 6.5l-3 3"/>',
  'device': '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.8h2"/>',
  'download': '<path d="M12 3.5v11M7.5 10l4.5 4.5L16.5 10M4.5 20.5h15"/>',
  'upload': '<path d="M12 20.5v-11M7.5 14l4.5-4.5L16.5 14M4.5 3.5h15"/>',
  'wand': '<path d="M4.5 19.5 14 10M12.5 7.5l2 2M17.5 3l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7zM19.5 11l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"/>',
  'moon': '<path d="M19.5 13.6A7.8 7.8 0 1 1 10.4 4.5 6.2 6.2 0 0 0 19.5 13.6z"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  'coffee': '<path d="M4.5 8.5h12.5v5.5a4 4 0 0 1-4 4h-4.5a4 4 0 0 1-4-4zM17 9.5h1.8a2 2 0 0 1 0 4H17M7.5 4.5v2M11.5 3.5v3"/>',
  'leaf': '<path d="M19.5 4.5C10 4.5 5.5 9.5 5.5 18.5c0 .6.4 1 1 1 9 0 13-5.5 13-15zM6.5 19c2.5-6 6.5-9.5 10-11.5"/>',
  'sprout': '<path d="M12 21v-8M12 13C12 9 9.2 7 5 7c0 4 2.8 6 7 6zM12 13c0-3.2 2.6-5 7-5 0 3.6-2.6 5-7 5"/>',
  'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.4l2.6 2.6 4.8-5"/>',
  'x': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  'plus': '<path d="M12 5.5v13M5.5 12h13"/>',
  'clock': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>',
  'hourglass': '<path d="M6.5 3.5h11M6.5 20.5h11M8.5 3.5v3.2c0 2.2 3.5 3 3.5 5.3s-3.5 3.1-3.5 5.3v3.2M15.5 3.5v3.2c0 2.2-3.5 3-3.5 5.3s3.5 3.1 3.5 5.3v3.2"/>',
  'target': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>',
  'brain': '<path d="M12 4.6a3 3 0 0 0-3-1.3 3.4 3.4 0 0 0-3.3 3.4A3.4 3.4 0 0 0 4 9.8c0 .9.3 1.6.9 2.2A3.4 3.4 0 0 0 6.8 17.4c.4 1.7 1.7 3 3.4 3H12zM12 4.6a3 3 0 0 1 3-1.3 3.4 3.4 0 0 1 3.3 3.4 3.4 3.4 0 0 1 1.7 3.1c0 .9-.3 1.6-.9 2.2a3.4 3.4 0 0 1-1.9 5.4c-.4 1.7-1.7 3-3.4 3H12zM12 3.3v17"/>',
  'note': '<path d="M5.5 4.5a1.5 1.5 0 0 1 1.5-1.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5zM14 3v4.5h4.5M9 13h6M9 16.5h4"/>',
  'paperclip': '<path d="M20.5 11.5 12 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 18a2 2 0 0 1-3-3l8-8"/>',
  'timer': '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.3 1.8M9.5 2.5h5M12 2.5v3.5"/>',
  'repeat': '<path d="M17 2.5l3.5 3.5L17 9.5M20.5 6H8.5a4.5 4.5 0 0 0-4.5 4.5v.5M7 21.5 3.5 18 7 14.5M3.5 18h12a4.5 4.5 0 0 0 4.5-4.5V13"/>',
  'graduation': '<path d="M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.7v4c0 1.6 2.5 2.8 5.5 2.8s5.5-1.2 5.5-2.8v-4M21.5 9.5v5.5"/>',
  'briefcase': '<rect x="3.5" y="7.5" width="17" height="12.5" rx="2"/><path d="M9 7.5V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3.5 13h17"/>',
  'palette': '<path d="M12 3.5a8.5 8.5 0 1 0 .4 17c1.5 0 2.1-1 1.6-2.1-.7-1.4.3-2.9 1.9-2.9h1.6a3 3 0 0 0 3-3c0-5.2-4-9-8.5-9z"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="9" r="1"/>',
  'spray': '<path d="M7 20.5h7a1 1 0 0 0 1-1v-10H6v10a1 1 0 0 0 1 1zM9 9.5v-4h3v4M17.5 3.5v2M20.5 5.5v2M17.5 8.5v1.5"/>',
  'bag': '<path d="M6 8.5h12l.9 11a1 1 0 0 1-1 1H6.1a1 1 0 0 1-1-1zM9 11V7a3 3 0 0 1 6 0v4"/>',
  'crown': '<path d="M4.5 18.5h15M4.5 18.5 3 8.5l5.5 3.5L12 5l3.5 7 5.5-3.5-1.5 10z"/>',
  'star': '<path d="M12 4l2.5 5.3 5.5.7-4 3.8 1 5.6-5-2.9-5 2.9 1-5.6-4-3.8 5.5-.7z"/>',
  'users': '<path d="M9 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2.5 20.5v-.8a6.5 6.5 0 0 1 13 0v.8M16.5 4a3.5 3.5 0 0 1 0 7M21.5 20.5v-.8a6 6 0 0 0-3.8-5.6"/>',
  'user': '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5v-.7a7.5 7.5 0 0 1 15 0v.7"/>',
  'eye': '<path d="M2.3 12C3.3 9.6 7 5 12 5s8.7 4.6 9.7 7c-1 2.4-4.7 7-9.7 7s-8.7-4.6-9.7-7z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M4 4.5l16 15M10.4 10.6a2 2 0 0 0 2.8 2.8M9.8 5.3A9.6 9.6 0 0 1 12 5c5 0 8.7 4.6 9.7 7-.4 1-1.2 2.3-2.3 3.5M6.4 6.6C4 8.2 2.7 10.5 2.3 12c1 2.4 4.7 7 9.7 7 1.3 0 2.6-.3 3.7-.9"/>',
  'lock': '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
  'mail': '<rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="M4.5 7l7.5 5.5L19.5 7"/>',
  'cpu': '<rect x="7" y="7" width="10" height="10" rx="2.4"/><rect x="10.2" y="10.2" width="3.6" height="3.6" rx="1"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/>',
  'arrow-left': '<path d="M19.5 12h-15M11 5.5 4.5 12l6.5 6.5"/>',
  'undo': '<path d="M9 14 4.5 9.5 9 5M4.5 9.5h9.5a5.5 5.5 0 0 1 0 11h-3"/>',
  'chevron-left': '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  'chevron-right': '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  'arrow-right': '<path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5"/>',
  'activity': '<path d="M3 12.5h3.8l3-7.5 4.4 15 3-7.5H21"/>',
  'utensils': '<path d="M7 3.5v8M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5M7 11.5v9M16.5 3.5c-2 0-3 2.4-3 4.8s1 3.7 3 3.7v9.5"/>',
  'droplet': '<path d="M12 3.5s6 6.5 6 10.7a6 6 0 0 1-12 0C6 10 12 3.5 12 3.5z"/>',
  'shield': '<path d="M12 3.5 19.5 6v6c0 4.6-3.3 7.4-7.5 8.5C7.8 19.4 4.5 16.6 4.5 12V6z"/>',
  'play': '<path d="M8.5 5.5 19 12l-10.5 6.5z"/>',
  'pause': '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  'pencil': '<path d="M4.5 19.5l.8-3.7L16.4 4.7a2.1 2.1 0 0 1 3 3L8.3 18.8zM14.4 6.7l3 3"/>',
  'trash': '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8l.8-12M10 11v6M14 11v6"/>',
  'cloud-off': '<path d="M4.5 4.5l15 15M8.3 18.5H16a4 4 0 0 0 1.6-7.7A6 6 0 0 0 8.6 8.4 4.5 4.5 0 0 0 8.3 18.5z"/>',
  'compass': '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  'bolt': '<path d="M13 3 5.5 13.5h5L10 21l7.5-10.5h-5z"/>',
  'headphones': '<path d="M4 14.5a8 8 0 0 1 16 0M4 14.5v3a2 2 0 0 0 2 2h.5v-6H4zM20 14.5v3a2 2 0 0 1-2 2h-.5v-6H20z"/>',
  'pin': '<path d="M12 20.5S6 15 6 10.5a6 6 0 1 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="10.5" r="2"/>',
  'map': '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5zM9 4.5v13M15 6.5v13"/>',
  'copy': '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9"/>',
  'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  'alert': '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 15.5h.01"/>',
  'info': '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8h.01"/>',
  'image': '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="9" r="2"/><path d="M20.5 16l-5-5-5 5M14.5 16l-3-3-5 5"/>',
  'grid': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  'pinterest': '<path d="M12 21c-5 0-9-4-9-9s4-9 9-9 9 4 9 9-4 9-9 9z"/><path d="M12 7c-2.2 0-4 1.8-4 4 0 1.5.8 2.8 2 3.4l.6-2.2c0-.8.6-1.5 1.4-1.5.7 0 1.2.5 1.2 1.2 0 .5-.3 1-.6 1.6-.3.6.2 1.2.8 1.2 1.5 0 2.6-1.6 2.6-3.5 0-2-1.7-3.5-3.8-3.5-2.4 0-3.7 1.8-3.7 3.4 0 .7.3 1.4.6 1.8l-.2.7c0 .1-.1.2-.3.1-1-.5-1.7-2-1.7-3.4 0-2.6 2-4.9 5.3-4.9 2.8 0 4.9 2 4.9 4.6 0 2.8-1.7 5-4.1 5-.8 0-1.5-.4-1.8-.9l-.5 1.8c-.2.7-.7 1.6-1 2.1.8.2 1.6.4 2.4.4"/>'
};

/* The Google "G" is a colour brand mark, not a line icon, so it is drawn with
   its own fills in a dedicated map. Only brand marks belong here. */
const LUVLI_BRAND_ICONS = {
  'google':
    '<path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.4a4.62 4.62 0 0 1-2 3.03v2.52h3.24c1.9-1.75 2.96-4.33 2.96-7.38z"/>' +
    '<path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.64-2.42l-3.24-2.52c-.9.6-2.05.96-3.4.96-2.6 0-4.8-1.76-5.6-4.12H3.06v2.6A10 10 0 0 0 12 22z"/>' +
    '<path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.06a10 10 0 0 0 0 9l3.34-2.6z"/>' +
    '<path fill="#EA4335" d="M12 5.98c1.47 0 2.8.5 3.84 1.5l2.88-2.88A10 10 0 0 0 3.06 7.5l3.34 2.6C7.2 7.74 9.4 5.98 12 5.98z"/>'
};

/* A few emoji that live inside *saved data* (a sample day, a stored activity)
   still map onto the icon set, so nothing renders as a raw glyph. */
const ICON_ALIASES = {
  '💧': 'droplet', '🧘': 'leaf', '🏃': 'activity', '🍽️': 'utensils', '📵': 'eye-off',
  '🧴': 'droplet', '📚': 'book', '💻': 'briefcase', '🌅': 'sun', '🌙': 'moon',
  '✨': 'sparkles', '☕': 'coffee', '🎯': 'target', '🧠': 'brain', '📝': 'note',
  '📖': 'book', '🎨': 'palette', '⏱️': 'timer', '🔥': 'flame', '🗺️': 'map',
  '🎓': 'graduation', '🗓️': 'calendar', '📌': 'pin', '🌸': 'sparkles', '🌿': 'leaf',
  '📷': 'image', '🖼️': 'image'
};

/** Build one inline SVG icon. Falls back to a neutral info mark for unknown names. */
function ico(name, className) {
  if (LUVLI_BRAND_ICONS[name]) {
    const brandCls = className ? String(className) : '';
    return '<svg class="ico ico-brand ' + brandCls + '" viewBox="0 0 24 24" fill="none" ' +
      'aria-hidden="true" focusable="false">' + LUVLI_BRAND_ICONS[name] + '</svg>';
  }
  const body = LUVLI_ICONS[name] || LUVLI_ICONS[ICON_ALIASES[name]] || LUVLI_ICONS['info'];
  const cls = className ? ' ' + className : '';
  return '<svg class="ico' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    body + '</svg>';
}

/** Hydrate the static <span data-ico="…"> hooks in the page markup. */
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-ico]').forEach((el) => {
    el.innerHTML = ico(el.getAttribute('data-ico'));
    el.removeAttribute('data-ico');
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hydrateIcons());
  } else {
    hydrateIcons();
  }
}

