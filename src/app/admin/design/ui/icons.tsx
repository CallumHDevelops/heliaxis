/** Studio UI icons (24-unit, 1.6 stroke — same drawing style as the brand icon set). */
const P = {
  layout: 'M4 4h16v16H4z M4 10h16 M10 10v10',
  brand: 'M12 3.2a8.8 8.8 0 1 0 .9 17.5c1-.1 1.4-1.3.7-2a1.4 1.4 0 0 1 1-2.4H17a3.8 3.8 0 0 0 3.8-3.8C20.8 6.5 16.9 3.2 12 3.2Z',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  shapes: 'M4 4h8v8H4z M17 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M5 20l4-6 4 6z',
  icons: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
  photo: 'M4 6h16v13H4z M4 15l4.5-4.5 4 4 2.5-2.5L20 17 M15.5 9.5h.01',
  layers: 'M12 3 3 8l9 5 9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5',
  undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-2',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h2',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  guides: 'M3 8h18 M3 16h18 M8 3v18 M16 3v18',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.1 8.1 20 20 M8.1 15.9 20 4',
  check: 'M4 12l5 5L20 6',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  folder: 'M3 6h6l2 2h10v11H3z',
  save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  eyeOff: 'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1 M6.6 6.6C3.8 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
  up: 'M12 19V5 M5 12l7-7 7 7',
  down: 'M12 5v14 M19 12l-7 7-7-7',
  front: 'M8 8h12v12H8z M4 4h10v2 M4 4v10h2',
  back: 'M4 4h12v12H4z M18 8h2v12H8v-2',
  alignL: 'M4 3v18 M8 7h12v4H8z M8 14h7v4H8z',
  alignC: 'M12 3v18 M6 7h12v4H6z M8.5 14h7v4h-7z',
  alignR: 'M20 3v18 M4 7h12v4H4z M9 14h7v4H9z',
  alignT: 'M3 4h18 M7 8h4v12H7z M14 8h4v7h-4z',
  alignM: 'M3 12h18 M7 6h4v12H7z M14 8.5h4v7h-4z',
  alignB: 'M3 20h18 M7 4h4v12H7z M14 9h4v7h-4z',
  group: 'M4 4h6v6H4z M14 14h6v6h-6z M10 7h4 M7 10v4 M17 10v4 M10 17h4',
  spark: 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z',
  close: 'M6 6l12 12 M18 6 6 18',
  template: 'M4 3h11l5 5v13H4z M15 3v5h5 M8 12h8 M8 16h5',
  upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  flipH: 'M12 3v18 M8 7 4 12l4 5z M16 7l4 5-4 5z',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  warn: 'M12 3 2 20h20z M12 10v4 M12 17h.01',
  info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M12 11v6 M12 7.5h.01',
  page: 'M6 3h12v18H6z',
};
export type IconName = keyof typeof P;

export function Ico({ n, size = 18, className }: { n: IconName; size?: number; className?: string }) {
  if (n === 'spark') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
        {[0, 90, 180, 270].map((r) => (
          <path key={r} d={P.spark} transform={`rotate(${r} 12 12)`} />
        ))}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={P[n]} />
    </svg>
  );
}
