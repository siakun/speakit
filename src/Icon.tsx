const paths = {
  cards: <><rect x="7" y="4" width="13" height="17" rx="2" /><path d="M4 17 2.5 5.5a2 2 0 0 1 1.7-2.2L14 2" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  bookmark: <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z" />,
  turn: <><path d="M8 7h8a4 4 0 0 1 0 8H5m3-5-5 5 5 5" /><path d="M8 3v4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  branch: <><path d="M6 3v11a4 4 0 0 0 4 4h9m-4-4 4 4-4 4" /><path d="M6 7h6a4 4 0 0 0 4-4" /></>,
  shuffle: <><path d="M3 6h3c5 0 6 12 11 12h4m-4-4 4 4-4 4M3 18h3c1.5 0 2.8-1 4-3M14 8c1-1.3 2-2 3-2h4m-4-4 4 4-4 4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.1" /></>,
};
export type IconName = keyof typeof paths;
export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
