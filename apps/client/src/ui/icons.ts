export const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
    sword: '<path d="m14 4 6-1-1 6-9 9-4-4zM3 21l5-5M4 12l8 8"/>',
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    companion: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    ghost: '<path d="M5 20V10a7 7 0 0 1 14 0v10l-3-2-4 3-4-3z"/><path d="M9 10h.01M15 10h.01"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14 8h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-4M12 6v12"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    stairs: '<path d="M3 20h5v-5h5v-5h5V5h3M4 4l7 7M4 9V4h5"/>',
    book: '<path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1zm0 0v15"/>',
    gear: '<circle cx="12" cy="12" r="4"/><path d="m9 3 1-1h4l1 3 3 1 3 2-1 3 1 4-3 2-3 1-1 3h-4l-1-3-3-1-3-2 1-4-1-3 3-2z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.compass}</svg>`;
};
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
