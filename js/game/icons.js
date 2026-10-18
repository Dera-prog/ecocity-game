// Inline SVG icons for EcoCity — items, bins, badges, misc UI.
// Simple flat-geometry icons so colours are never the only identifier.

export const ITEM_ICONS = {
  bottle: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="6" width="12" height="7" rx="2" fill="#1e88e5"/><rect x="24" y="13" width="16" height="6" fill="#90caf9"/><path d="M22 24c0-4 4-5 4-5h12s4 1 4 5v28c0 4-3 6-6 6H28c-3 0-6-2-6-6z" fill="#bbdefb" stroke="#64b5f6" stroke-width="2"/><rect x="24" y="32" width="16" height="5" rx="2" fill="#e3f2fd" stroke="#64b5f6" stroke-width="1.5"/><path d="M24 42h16v6a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="#90caf9" opacity=".55"/></svg>`,
  sachet: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M14 22l8-8h28l-6 8z" fill="#e3f2fd" stroke="#64b5f6" stroke-width="2"/><path d="M14 22h30l-6 26-16 8z" fill="#bbdefb" stroke="#64b5f6" stroke-width="2"/><path d="M20 30c4 4 10 3 14 8" stroke="#ffffff" stroke-width="2.5" fill="none" opacity=".8"/><circle cx="30" cy="40" r="3" fill="#90caf9"/></svg>`,
  can: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><ellipse cx="32" cy="15" rx="12" ry="5" fill="#b0bec5"/><path d="M20 15v32c0 3 5 5 12 5s12-2 12-5V15" fill="#cfd8dc" stroke="#90a4ae" stroke-width="2"/><ellipse cx="32" cy="15" rx="12" ry="5" fill="none" stroke="#90a4ae" stroke-width="2"/><rect x="22" y="24" width="20" height="14" fill="#e53935"/><rect x="22" y="26" width="20" height="3" fill="#ffcdd2" opacity=".7"/></svg>`,
  glass: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="27" y="6" width="10" height="6" rx="2" fill="#2e7d32"/><path d="M25 14h14l3 12c1 4 2 6 2 10v14c0 4-3 6-6 6H26c-3 0-6-2-6-6V36c0-4 1-6 2-10z" fill="#a5d6a7" stroke="#43a047" stroke-width="2"/><path d="M24 40h16v10c0 3-2 6-5 6h-6c-3 0-5-3-5-6z" fill="#43a047" opacity=".35"/><rect x="28" y="18" width="3" height="26" rx="1.5" fill="#ffffff" opacity=".6"/></svg>`,
  paper: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M16 12h24l8 8v32a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="#fff" stroke="#90a4ae" stroke-width="2"/><path d="M40 12v8h8" fill="#eceff1" stroke="#90a4ae" stroke-width="2"/><g stroke="#b0bec5" stroke-width="2.5" stroke-linecap="round"><path d="M19 30h26"/><path d="M19 37h26"/><path d="M19 44h17"/></g></svg>`,
  carton: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M12 22l20-8 20 8v24l-20 8-20-8z" fill="#d7a86e" stroke="#a1743c" stroke-width="2"/><path d="M12 22l20 8 20-8" fill="none" stroke="#a1743c" stroke-width="2"/><path d="M32 30v24" stroke="#a1743c" stroke-width="2"/><path d="M22 17.5l20 8v6l-20-8z" fill="#b98a52" stroke="#a1743c" stroke-width="1.5"/></svg>`,
  ewaste: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="20" width="44" height="28" rx="4" fill="#455a64" stroke="#263238" stroke-width="2"/><rect x="16" y="26" width="20" height="16" rx="2" fill="#90a4ae"/><circle cx="45" cy="30" r="3.5" fill="#ffc107"/><circle cx="45" cy="40" r="3.5" fill="#ef5350"/><path d="M20 16c4-4 20-4 24 0" stroke="#263238" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  textile: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M22 10l10 6 10-6 12 8-6 10-5-3v29H21V25l-5 3-6-10z" fill="#ffb74d" stroke="#ef6c00" stroke-width="2"/><path d="M32 16v38" stroke="#ef6c00" stroke-width="2" opacity=".55"/><path d="M26 34c4 3 8 3 12 0" stroke="#ffffff" stroke-width="2.5" fill="none" opacity=".7"/></svg>`,
  foodbox: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M14 24h36l-4 28a5 5 0 0 1-5 4H23a5 5 0 0 1-5-4z" fill="#fff" stroke="#b0bec5" stroke-width="2"/><path d="M12 22l4-8h32l4 8z" fill="#eceff1" stroke="#b0bec5" stroke-width="2"/><rect x="20" y="32" width="24" height="14" rx="3" fill="#c8e6c9"/><circle cx="32" cy="39" r="4" fill="#66bb6a"/></svg>`
};

export const BIN_META = {
  plastic: { name: 'Plastic', flag: '#fbc02d', icon: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="6" width="12" height="7" rx="2" fill="#f9a825"/><path d="M22 24c0-4 4-5 4-5h12s4 1 4 5v28c0 4-3 6-6 6H28c-3 0-6-2-6-6z" fill="#ffe082" stroke="#f9a825" stroke-width="2.5"/></svg>` },
  paper: { name: 'Paper', flag: '#1e88e5', icon: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M16 12h24l8 8v32a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="#e3f2fd" stroke="#1e88e5" stroke-width="2.5"/><g stroke="#64b5f6" stroke-width="3" stroke-linecap="round"><path d="M20 30h24"/><path d="M20 38h24"/><path d="M20 46h16"/></g></svg>` },
  metal: { name: 'Metal', flag: '#78909c', icon: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><ellipse cx="32" cy="16" rx="12" ry="5" fill="#b0bec5" stroke="#546e7a" stroke-width="2"/><path d="M20 16v32c0 3 5 5 12 5s12-2 12-5V16" fill="#cfd8dc" stroke="#546e7a" stroke-width="2.5"/><path d="M24 26h16v10H24z" fill="#90a4ae"/></svg>` },
  glass: { name: 'Glass', flag: '#43a047', icon: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="27" y="6" width="10" height="6" rx="2" fill="#2e7d32"/><path d="M25 14h14l3 12c1 4 2 6 2 10v14c0 4-3 6-6 6H26c-3 0-6-2-6-6V36c0-4 1-6 2-10z" fill="#c8e6c9" stroke="#43a047" stroke-width="2.5"/><rect x="28" y="18" width="3" height="26" rx="1.5" fill="#ffffff" opacity=".7"/></svg>` },
  ewaste: { name: 'E-waste', flag: '#7e57c2', icon: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="20" width="44" height="28" rx="4" fill="#5e35b1" stroke="#4527a0" stroke-width="2"/><rect x="16" y="26" width="20" height="16" rx="2" fill="#d1c4e9"/><circle cx="45" cy="30" r="3.5" fill="#ffc107"/><circle cx="45" cy="40" r="3.5" fill="#ff8a80"/></svg>` },
  textile: { name: 'Textile', flag: '#fb8c00', icon: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M22 10l10 6 10-6 12 8-6 10-5-3v29H21V25l-5 3-6-10z" fill="#ffcc80" stroke="#fb8c00" stroke-width="2.5"/><path d="M32 16v38" stroke="#fb8c00" stroke-width="2" opacity=".5"/></svg>` }
};

export const BADGE_ICONS = {
  rookie: '🌱',
  plastic: '🧴',
  expert: '🗂️',
  river: '💧',
  champion: '🏘️'
};

export const UI_ICONS = {
  recycle: '♻️',
  truck: '🚛',
  coin: '🪙',
  xp: '⭐',
  bag: '🛍️'
};
