const shapes = {
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  education: <><path d="m2 8 10-5 10 5-10 5L2 8Z" /><path d="M6 10v6c3 3 9 3 12 0v-6M22 8v8" /></>,
  economy: <><path d="M4 13h3v8H4zM10 8h3v13h-3zM16 3h3v18h-3z" /></>,
  institutions: <><path d="m3 7 9-5 9 5H3ZM3 21h18M4 18h16M6 10v5M10 10v5M14 10v5M18 10v5" /></>,
  people: <><circle cx="12" cy="7" r="3" /><path d="M6 21v-3a6 6 0 0 1 12 0v3H6ZM5 5a3 3 0 0 0 0 6M19 5a3 3 0 0 1 0 6M3 14a5 5 0 0 0-2 4M21 14a5 5 0 0 1 2 4" /></>,
  health: <><path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 5 3 11 8 15 5-4 12-10 8-15Z" /><path d="M12 8v6M9 11h6" /></>,
  environment: <><path d="M20 3C8 1 2 8 5 15c6 7 16 1 15-12ZM3 21 16 8" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  chat: <path d="M21 11a9 9 0 0 1-13 8l-6 3 2-6A9 9 0 1 1 21 11Z" />,
  person: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2H4Z" /></>,
  plus: <path d="M12 4v16M4 12h16" />,
  key: <><circle cx="8" cy="8" r="5" /><path d="m12 12 9 9M16 16l3-3M19 19l3-3" /></>,
  document: <><path d="M6 2h8l5 5v15H6V2ZM14 2v6h5M9 12h7M9 16h7" /></>,
  external: <><path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18" /></>,
  tax: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 10h1M12 10h1M16 10h.1M8 14h1M12 14h1M16 14h.1M8 18h1M12 18h1M16 18h.1" /></>,
  work: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 13h18M10 13v3h4v-3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  house: <><path d="m2 11 10-9 10 9M5 9v13h5v-7h4v7h5V9" /></>,
  ballot: <><path d="m8 3 9 4-4 8-9-4 4-8ZM3 13v8h18v-8M15 13h6M7 9l2 2 4-3" /></>,
  agriculture: <><path d="M12 22V6M12 7C6 7 5 4 5 2c5 0 7 2 7 5ZM12 12c6 0 7-3 7-5-5 0-7 2-7 5ZM12 17c-6 0-7-3-7-5 5 0 7 2 7 5ZM12 22c6 0 7-3 7-5-5 0-7 2-7 5Z" /></>,
  shield: <><path d="m12 2 8 4v6c0 5-5 8-8 10-3-2-8-5-8-10V6l8-4Z" /><path d="m8 12 3 3 5-6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" /></>,
  transport: <><rect x="5" y="2" width="14" height="17" rx="3" /><path d="M5 10h14M8 15h1M15 15h1M8 19l-2 3M16 19l2 3" /></>,
  sport: <><circle cx="12" cy="12" r="9" /><path d="m12 7 5 4-2 6H9l-2-6 5-4ZM12 7V3M17 11l4-1M15 17l2 3M9 17l-2 3M7 11l-4-1" /></>,
}

export default function DiscussionIcon({ name, className = '' }) {
  return <svg className={`discussion-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name] || shapes.chat}</svg>
}
