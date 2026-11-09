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
}

export default function DiscussionIcon({ name, className = '' }) {
  return <svg className={`discussion-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name] || shapes.chat}</svg>
}
