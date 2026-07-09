'use client';

import { useEffect } from 'react';

const ICON_IDS = [
  'solar','panel','battery','battery-full','ev','charger','led','heatpump',
  'sun','bolt','plug','monitor','house','building','warehouse','factory',
  'agri','care','hotel','roof','shield','award','star','quote','handshake',
  'users','wrench','hardhat','cog','truck','calendar','clock','mail','mappin',
  'chart','trending','coin','pound','percent','calculator','document','check',
  'leaf','eco','phone',
];

const SPARK_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style="display:block"><g transform="rotate(0 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(90 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(180 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g><g transform="rotate(270 12 12)"><path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z"/></g></svg>`;

function Wordmark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`wm ${className || ''}`} style={style}>
      HELIA<span className="sx" data-spark />IS<sup>®</sup>
    </span>
  );
}

export function BrandContent() {
  useEffect(() => {
    document.querySelectorAll('[data-spark]').forEach((el) => {
        el.innerHTML = SPARK_SVG;
    });

    const grid = document.getElementById('icgrid');
    if (grid) {
      grid.innerHTML = ICON_IDS.map(
        (id) => `<div class="ic-card"><svg viewBox="0 0 24 24"><use href="#ic-${id}"/></svg><span>${id}</span></div>`
      ).join('');
    }
  }, []);

  return (
    <div className="brand-page">
      {/* Icon sprite */}
      <svg xmlns="http://www.w3.org/2000/svg" style={{ display: 'none' }}>
        <defs>
          <symbol id="ic-solar" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l2-9h12l2 9z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M4 16l2-9h12l2 9z"/><path d="M3 16h18"/><path d="M9 7L8 16"/><path d="M15 7l1 9"/><path d="M6 11.5h12"/></symbol>
          <symbol id="ic-panel" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H4z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M4 5h16v11H4z"/><path d="M4 9h16M4 12.5h16M9 5v11M14 5v11"/><path d="M10 19h4M12 16v3"/></symbol>
          <symbol id="ic-battery" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5h12v16H6z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6 5h12v16H6z"/><path d="M10 5V3h4v2"/><path d="M13 9l-3 5h4l-3 4"/></symbol>
          <symbol id="ic-battery-full" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5h12v16H6z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6 5h12v16H6z"/><path d="M10 5V3h4v2"/><path d="M8 8h8M8 11h8M8 14h8"/></symbol>
          <symbol id="ic-ev" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6 20V9a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 16 9v11"/><path d="M4 20h14"/><path d="M16 11h2.5l2 2v5a1.75 1.75 0 0 1-3.5 0v-3"/><path d="M11 9l-1.5 3H12l-1.5 3"/></symbol>
          <symbol id="ic-charger" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9h8v3a4 4 0 0 1-8 0z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M9 3v6M15 3v6"/><path d="M8 9h8v3a4 4 0 0 1-8 0z"/><path d="M12 16v3"/><path d="M9 21h6"/></symbol>
          <symbol id="ic-led" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M12 3a7 7 0 0 1 4 12.8c-.6.4-1 1-1 1.7V18H9v-.5c0-.7-.4-1.3-1-1.7A7 7 0 0 1 12 3Z"/><path d="M9.5 21h5"/><path d="M10 18v3M14 18v3"/></symbol>
          <symbol id="ic-heatpump" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18v11H3z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M3 7h18v11H3z"/><path d="M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7"/><path d="M12 10.5v4M10 12.5h4"/></symbol>
          <symbol id="ic-sun" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></symbol>
          <symbol id="ic-bolt" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></symbol>
          <symbol id="ic-plug" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 8h10v2a5 5 0 0 1-10 0z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M9 2v6M15 2v6"/><path d="M7 8h10v2a5 5 0 0 1-10 0z"/><path d="M12 15v5"/></symbol>
          <symbol id="ic-monitor" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h10v18H7z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M7 3h10v18H7z"/><path d="M10 18h4"/><path d="M9.5 11l2 2.5 1.5-2 2 3"/></symbol>
          <symbol id="ic-house" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10v10h14V10" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></symbol>
          <symbol id="ic-building" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4h14v17" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M5 21V4h14v17"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/><path d="M3 21h18"/></symbol>
          <symbol id="ic-warehouse" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-5 9 5v12z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M3 21V9l9-5 9 5v12"/><path d="M3 21h18M8 21v-6h8v6"/></symbol>
          <symbol id="ic-factory" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V10l6 4V10l6 4V6l6 4v11z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M3 21V10l6 4V10l6 4V6l6 4v11z"/><path d="M3 21h18M7 17h.01M11 17h.01M15 17h.01"/></symbol>
          <symbol id="ic-agri" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0M14 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0"/><path d="M7 14V7h5l3 4M7 9h5"/></symbol>
          <symbol id="ic-care" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V8l8-4 8 4v13z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M4 21V8l8-4 8 4v13"/><path d="M4 21h16"/><path d="M12 11v5M9.5 13.5h5"/></symbol>
          <symbol id="ic-hotel" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V6h11v6h7v9z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M3 21V6h11v6h7v9"/><path d="M3 21h18M6 9h.01M6 12h.01M10 9h.01M10 12h.01"/></symbol>
          <symbol id="ic-roof" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-7 9 7"/><path d="M5 11v8h14v-8"/><path d="M10 19v-4h4v4"/></symbol>
          <symbol id="ic-shield" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/></symbol>
          <symbol id="ic-award" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10"/><path d="M9 12l-1 8 4-2 4 2-1-8"/></symbol>
          <symbol id="ic-star" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.6 6 6.4.6-4.8 4.2 1.4 6.2L12 17l-5.6 3 1.4-6.2L3 9.6 9.4 9z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M12 3l2.6 6 6.4.6-4.8 4.2 1.4 6.2L12 17l-5.6 3 1.4-6.2L3 9.6 9.4 9z"/></symbol>
          <symbol id="ic-quote" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 7h4v5a4 4 0 0 1-4 4zM14 7h4v5a4 4 0 0 1-4 4z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6 7h4v5a4 4 0 0 1-4 4M14 7h4v5a4 4 0 0 1-4 4"/></symbol>
          <symbol id="ic-handshake" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12l3 3 5-5 3 3"/><path d="M2 10l4-3 5 4M22 10l-4-3"/><path d="M6 7v8M18 7v8"/></symbol>
          <symbol id="ic-users" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/><path d="M3 20a5 5 0 0 1 10 0"/><path d="M16 6a3 3 0 0 1 0 6M15 20a5 5 0 0 0-1-3.5 5 5 0 0 1 7 3.5"/></symbol>
          <symbol id="ic-wrench" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6a4 4 0 0 0-5 5L4 17l3 3 6-6a4 4 0 0 0 5-5l-3 3-2-.5-.5-2z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M15 6a4 4 0 0 0-5 5L4 17l3 3 6-6a4 4 0 0 0 5-5l-3 3-2-.5-.5-2z"/></symbol>
          <symbol id="ic-hardhat" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 16h18v2H3z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M4 16a8 8 0 0 1 16 0"/><path d="M9 16V9a3 3 0 0 1 6 0v7"/><path d="M3 16h18v2H3z"/></symbol>
          <symbol id="ic-cog" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></symbol>
          <symbol id="ic-truck" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6h11v10H2z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M2 6h11v10H2z"/><path d="M13 9h4l3 3v4h-7"/><path d="M6 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4M17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/></symbol>
          <symbol id="ic-calendar" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v4H4z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M4 5h16v16H4z"/><path d="M4 9h16M8 3v4M16 3v4"/><path d="M8 13h2M12 13h2M8 17h2M12 17h2"/></symbol>
          <symbol id="ic-clock" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></symbol>
          <symbol id="ic-mail" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18v14H3z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M3 5h18v14H3z"/><path d="M3 5l9 7 9-7"/></symbol>
          <symbol id="ic-mappin" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></symbol>
          <symbol id="ic-chart" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18"/><path d="M6 16V10" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6 16V10"/><path d="M10 16V6"/><path d="M14 16V12"/><path d="M18 16V8"/></symbol>
          <symbol id="ic-trending" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></symbol>
          <symbol id="ic-coin" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4.5a2 2 0 0 1 0 4H9.5"/></symbol>
          <symbol id="ic-pound" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18h10M8 13h6"/><path d="M15 6a3 3 0 0 0-5.5 1.5V13c0 2-1.5 3-3 4h11"/></symbol>
          <symbol id="ic-percent" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2.5" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="16" r="2.5" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><circle cx="16" cy="16" r="2.5"/><path d="M19 5L5 19"/></symbol>
          <symbol id="ic-calculator" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18H5z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M5 3h14v18H5z"/><path d="M8 6h8v4H8z"/><path d="M8 14h2M14 14h2M8 17h2M14 17h2"/></symbol>
          <symbol id="ic-document" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h8l6 6v14H6z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6 2h8l6 6v14H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></symbol>
          <symbol id="ic-check" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></symbol>
          <symbol id="ic-leaf" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 21c0-9 4-13 14-13-1 9-5 13-14 13z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6 21c0-9 4-13 14-13-1 9-5 13-14 13z"/><path d="M6 21C8 15 12 12 20 8"/></symbol>
          <symbol id="ic-eco" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9"/><path d="M20 4c-4 4-8 4-8 9"/><path d="M16 4h4v4"/></symbol>
          <symbol id="ic-phone" viewBox="0 0 24 24" fill="none" stroke="#211F18" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z" fill="#F8BC1E" fillOpacity=".3" stroke="none"/><path d="M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2Z"/></symbol>
        </defs>
      </svg>

      {/* Top nav */}
      <div className="topnav">
        <div className="wrap">
          <Wordmark />
          <nav>
            <a href="#logo">Logo</a>
            <a href="#colour">Colour</a>
            <a href="#type">Type</a>
            <a href="#icons">Icons</a>
            <a href="#social">Social</a>
            <a href="#headers">Headers</a>
          </nav>
        </div>
      </div>

      {/* Cover */}
      <section className="cover fill-dark xhatch" style={{ borderBottom: 0 }}>
        <div className="wrap">
          <Wordmark />
          <h1>Brand <em>guidelines</em></h1>
          <div className="strap">Engineered warmth · Solar · Storage · Clean energy · South Wales</div>
          <div className="meta">
            <span>VERSION <b>1.0</b></span>
            <span>PREPARED FOR <b>MARKETING</b></span>
            <span>HELIAXIS.CO.UK</span>
            <span>01633 965205</span>
          </div>
        </div>
      </section>

      {/* 01 — The idea */}
      <section id="idea">
        <div className="wrap">
          <div className="sec-k">01 — The idea</div>
          <div className="sec-h">
            <h2>Engineered warmth</h2>
            <p>Heliaxis is the meeting of precision and approachability: the rigour of an MCS-certified engineering team, delivered with the warmth of a local, no-hard-sell business. Warm charcoal and solar gold, a technical mono voice, and a confident display face — serious about the engineering, human about the service.</p>
          </div>
          <div className="idea-grid">
            <div className="idea big">
              <p>We turn <em>Welsh sunshine</em> into lower bills — solar, battery, heat pumps and EV, installed by one accredited team.</p>
              <p>The brand should always feel <em>certain, calm and premium</em>: plenty of space, one gold accent, and numbers that do the talking.</p>
            </div>
            <div className="sparkcard fill-dark xhatch">
              <span className="sx" data-spark />
              <div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--paper)' }}>The spark mark</div>
              <p>A four-point spark — sunlight and the &quot;axis&quot; in Heliaxis. It replaces the X in the wordmark and stands alone as a favicon, bullet or accent. Always solar gold.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 02 — Logo */}
      <section id="logo">
        <div className="wrap">
          <div className="sec-k">02 — Logo</div>
          <div className="sec-h">
            <h2>The wordmark</h2>
            <p>The Heliaxis wordmark is set in Ezra with the spark replacing the X. Use the full colour wordmark on charcoal or paper. Keep the registered mark (®) at the top right.</p>
          </div>
          <div className="logos">
            <div className="logobox dark fill-dark xhatch"><span className="cap">On charcoal</span><Wordmark /></div>
            <div className="logobox light"><span className="cap">On paper</span><Wordmark /></div>
          </div>
          <div className="clearspace">
            <div className="box"><Wordmark style={{ fontSize: '1.5rem' }} /></div>
            <div className="note"><b style={{ fontFamily: 'var(--display)', color: 'var(--ink)' }}>Clear space &amp; minimum size.</b><br />Keep clear space of at least the height of the spark on all sides. Minimum width <code>120px</code> on screen. Never crowd the wordmark with other elements.</div>
          </div>
        </div>
      </section>

      {/* 03 — Colour */}
      <section id="colour">
        <div className="wrap">
          <div className="sec-k">03 — Colour</div>
          <div className="sec-h">
            <h2>Palette</h2>
            <p>Warm charcoal grounds everything; solar gold is the single accent used sparingly for emphasis and calls to action. Papers and cards provide warm neutrals; muted tones carry secondary text.</p>
          </div>
          <div className="swatches">
            <div className="sw" style={{ background: '#211F18', color: '#F7F2E7', borderColor: '#211F18' }}><div className="sw-n">Ink</div><div><div className="sw-h">#211F18</div><div className="sw-u">Primary / backgrounds / text</div></div></div>
            <div className="sw" style={{ background: '#F8BC1E', color: '#211F18' }}><div className="sw-n">Solar</div><div><div className="sw-h">#F8BC1E</div><div className="sw-u">Accent / CTA / spark</div></div></div>
            <div className="sw" style={{ background: '#E39A0C', color: '#211F18' }}><div className="sw-n">Amber</div><div><div className="sw-h">#E39A0C</div><div className="sw-u">Hover / gradients</div></div></div>
            <div className="sw" style={{ background: '#C77F04', color: '#F7F2E7' }}><div className="sw-n">Amber deep</div><div><div className="sw-h">#C77F04</div><div className="sw-u">Eyebrows / small text on paper</div></div></div>
            <div className="sw" style={{ background: '#F7F2E7', color: '#211F18' }}><div className="sw-n">Paper</div><div><div className="sw-h">#F7F2E7</div><div className="sw-u">Page background</div></div></div>
            <div className="sw" style={{ background: '#EFE8D8', color: '#211F18' }}><div className="sw-n">Paper 2</div><div><div className="sw-h">#EFE8D8</div><div className="sw-u">Panels / fills</div></div></div>
            <div className="sw" style={{ background: '#FFFDF8', color: '#211F18' }}><div className="sw-n">Card</div><div><div className="sw-h">#FFFDF8</div><div className="sw-u">Cards / surfaces</div></div></div>
            <div className="sw" style={{ background: '#6E6A5E', color: '#F7F2E7' }}><div className="sw-n">Muted</div><div><div className="sw-h">#6E6A5E</div><div className="sw-u">Secondary text</div></div></div>
            <div className="sw" style={{ background: '#A69F8E', color: '#211F18' }}><div className="sw-n">Muted light</div><div><div className="sw-h">#A69F8E</div><div className="sw-u">Text on charcoal</div></div></div>
            <div className="sw" style={{ background: '#3F7D4E', color: '#F7F2E7' }}><div className="sw-n">Success</div><div><div className="sw-h">#3F7D4E</div><div className="sw-u">Confirmations only</div></div></div>
            </div>
          <div className="sec-h" style={{ marginTop: 44 }}>
            <h2 style={{ fontSize: '1.2rem' }}>Cross-hatch card fills</h2>
            <p>The signature background: a fine 30px grid with a warm gold glow in the top-right, fading diagonally. Use behind hero sections, social posts and featured panels. Two variants — dark and light.</p>
          </div>
          <div className="textures">
            <div className="texbox d fill-dark xhatch"><span className="t">heliaxis-card-fill-dark.svg</span></div>
            <div className="texbox l fill-light xhatch"><span className="t">heliaxis-card-fill-light.svg</span></div>
          </div>
        </div>
      </section>

      {/* 04 — Typography */}
      <section id="type">
        <div className="wrap">
          <div className="sec-k">04 — Typography</div>
          <div className="sec-h">
            <h2>Three faces</h2>
            <p>Ezra for display, Hanken Grotesk for body, JetBrains Mono for eyebrows, labels and data. This pairing carries the &quot;engineered warmth&quot; — a confident headline, a friendly read, a technical accent.</p>
          </div>
          <div className="typrow">
            <div className="lbl">Display — Ezra</div>
            <div className="ez" style={{ fontWeight: 900, fontSize: 'clamp(2.2rem,6vw,3.6rem)' }}>Cut your energy bills.</div>
            <div className="ez" style={{ fontWeight: 700, fontSize: 'clamp(1.3rem,3vw,1.8rem)', color: 'var(--muted)', marginTop: 8 }}>Weights 400–900 · headlines, numbers, the wordmark</div>
          </div>
          <div className="typrow">
            <div className="lbl">Body — Hanken Grotesk</div>
            <div className="samp-hanken" style={{ fontSize: '1.15rem', maxWidth: '60ch' }}>Solar, battery, heat pumps and EV — one local, accredited team. No pushy sales, ever. Hanken Grotesk keeps long-form copy warm and highly legible at 400–700.</div>
          </div>
          <div className="typrow">
            <div className="lbl">Mono — JetBrains Mono</div>
            <div className="samp-mono" style={{ fontSize: '1rem', letterSpacing: '.06em', color: 'var(--amber-2)', textTransform: 'uppercase' }}>MCS · RECC · NICEIC · TRUSTMARK CERTIFIED</div>
            <div className="samp-mono" style={{ fontSize: '.9rem', color: 'var(--muted)', marginTop: 8 }}>Eyebrows, labels, stats, footers · 400–600 · always uppercase for eyebrows, +0.14em tracking</div>
          </div>
          <table className="scale">
            <thead><tr><th>Role</th><th>Face / weight</th><th>Size</th><th>Tracking</th></tr></thead>
            <tbody>
              <tr><td className="nm">Display XL</td><td className="mono">Ezra 900</td><td className="mono">clamp(2.4→4rem)</td><td className="mono">-0.02em</td></tr>
              <tr><td className="nm">Display / H1</td><td className="mono">Ezra 800–900</td><td className="mono">2.1–2.6rem</td><td className="mono">-0.015em</td></tr>
              <tr><td className="nm">Heading / H2</td><td className="mono">Ezra 800</td><td className="mono">1.7–2.4rem</td><td className="mono">-0.015em</td></tr>
              <tr><td className="nm">Subheading</td><td className="mono">Ezra 700</td><td className="mono">1.2–1.4rem</td><td className="mono">-0.01em</td></tr>
              <tr><td className="nm">Body</td><td className="mono">Hanken 400–500</td><td className="mono">1rem / 16px</td><td className="mono">0</td></tr>
              <tr><td className="nm">Body large</td><td className="mono">Hanken 500–600</td><td className="mono">1.15rem</td><td className="mono">0</td></tr>
              <tr><td className="nm">Eyebrow / label</td><td className="mono">JetBrains 500</td><td className="mono">0.72rem</td><td className="mono">+0.14em</td></tr>
              <tr><td className="nm">Footnote / data</td><td className="mono">JetBrains 400</td><td className="mono">0.62–0.72rem</td><td className="mono">+0.06em</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 05 — Icons */}
      <section id="icons">
        <div className="wrap">
          <div className="sec-k">05 — Iconography</div>
          <div className="sec-h">
            <h2>Duotone icon set</h2>
            <p>A single custom set on a 24px grid: 1.6px rounded strokes in ink, with a solar-gold fill at 30% opacity for the key shape. Consistent, friendly and unmistakably Heliaxis. Use at 18–34px; never recolour the stroke or change the weight.</p>
          </div>
          <div className="icgrid" id="icgrid" />
          <div className="iconnote">
            <div className="n"><b>Do</b>Keep 1.6px stroke · rounded caps &amp; joins · gold fill only on the primary shape at ~30% · size on the 24px grid.</div>
            <div className="n"><b>Don&apos;t</b>Don&apos;t mix in third-party icon packs · don&apos;t use filled/solid styles · don&apos;t recolour strokes · don&apos;t add drop shadows.</div>
          </div>
        </div>
      </section>

      {/* 06 — Social */}
      <section id="social">
        <div className="wrap">
          <div className="sec-k">06 — Social media</div>
          <div className="sec-h">
            <h2>Square post templates (1080×1080)</h2>
            <p>The system: cross-hatch background (dark or light), wordmark top-left, spark top-right, a mono eyebrow in gold, a big Ezra headline with one gold accent word, a short supporting line, an optional gold CTA, and a mono footer with the URL and phone.</p>
          </div>
          <div className="postgrid">
            <div>
            <div className="post fill-dark xhatch">
                <div className="p-top"><Wordmark /><span className="sx-mark" data-spark /></div>
              <div>
                  <div className="p-eye"><svg><use href="#ic-percent" /></svg>Limited-time saving</div>
                  <h3>0% VAT on <em>home</em> solar</h3>
                  <div className="p-sub">Until March 2027 — installed by your local MCS team.</div>
                  <span className="p-cta">Get a free quote →</span>
                </div>
                <div className="p-foot"><span>HELIAXIS.CO.UK</span><span>01633 965205</span></div>
              </div>
              <div className="postcap">Dark · Offer</div>
            </div>
            <div>
            <div className="post fill-light xhatch">
                <div className="p-top"><Wordmark style={{ color: 'var(--ink)' }} /><span className="sx-mark" data-spark /></div>
              <div>
                  <div className="p-eye"><svg><use href="#ic-percent" /></svg>Limited-time saving</div>
                  <h3 style={{ color: 'var(--ink)' }}>0% VAT on <em>home</em> solar</h3>
                  <div className="p-sub">Until March 2027 — installed by your local MCS team.</div>
                  <span className="p-cta">Get a free quote →</span>
                </div>
                <div className="p-foot"><span>HELIAXIS.CO.UK</span><span>01633 965205</span></div>
              </div>
              <div className="postcap">Light · Offer</div>
            </div>
            <div>
            <div className="post fill-dark xhatch">
                <div className="p-top"><Wordmark /><span className="sx-mark" data-spark /></div>
              <div className="p-mid">
                  <div className="p-eye"><svg><use href="#ic-quote" /></svg>Customer story · Cardiff</div>
                  <div className="p-stat">£1,400</div>
                  <h3 style={{ fontSize: '9cqw' }}>saved every year.</h3>
                  <div className="p-sub">How the Jones family cut their bills with 6.4 kWp of solar and a battery.</div>
                </div>
                <div className="p-foot"><span>HELIAXIS.CO.UK</span><span>01633 965205</span></div>
              </div>
              <div className="postcap">Dark · Customer story</div>
            </div>
            <div>
            <div className="post fill-light xhatch">
                <div className="p-top"><Wordmark style={{ color: 'var(--ink)' }} /><span className="sx-mark" data-spark /></div>
                <div className="p-mid">
                  <div className="p-eye"><svg><use href="#ic-quote" /></svg>Customer story · Cardiff</div>
                  <div className="p-stat">£1,400</div>
                  <h3 style={{ fontSize: '9cqw', color: 'var(--ink)' }}>saved every year.</h3>
                  <div className="p-sub">How the Jones family cut their bills with 6.4 kWp of solar and a battery.</div>
                </div>
                <div className="p-foot"><span>HELIAXIS.CO.UK</span><span>01633 965205</span></div>
              </div>
              <div className="postcap">Light · Customer story</div>
            </div>
            <div>
            <div className="post fill-dark xhatch">
                <div className="p-top"><Wordmark /><span className="sx-mark" data-spark /></div>
              <div>
                  <div className="p-eye"><svg><use href="#ic-calculator" /></svg>Free online tool</div>
                  <h3>Draw your roof. <em>See your savings.</em></h3>
                  <div className="p-sub">In 20 seconds. No forms.</div>
                </div>
                <div className="p-foot"><span>HELIAXIS.CO.UK</span><span>01633 965205</span></div>
              </div>
              <div className="postcap">Dark · Tool promo</div>
            </div>
            <div>
            <div className="post fill-light xhatch">
                <div className="p-top"><Wordmark style={{ color: 'var(--ink)' }} /><span className="sx-mark" data-spark /></div>
              <div>
                  <div className="p-eye"><svg><use href="#ic-calculator" /></svg>Free online tool</div>
                  <h3 style={{ color: 'var(--ink)' }}>Draw your roof. <em>See your savings.</em></h3>
                  <div className="p-sub">In 20 seconds. No forms.</div>
                </div>
                <div className="p-foot"><span>HELIAXIS.CO.UK</span><span>01633 965205</span></div>
              </div>
              <div className="postcap">Light · Tool promo</div>
            </div>
          </div>
        </div>
      </section>

      {/* 07 — Headers */}
      <section id="headers">
        <div className="wrap">
          <div className="sec-k">07 — Headers &amp; banners</div>
          <div className="sec-h">
            <h2>Website &amp; social headers</h2>
            <p>Wide formats use the same system, scaled up. Website hero (16:7), and a wide banner for email / LinkedIn / X (4:1). Charcoal cross-hatch, wordmark, one gold accent, a single CTA.</p>
          </div>
          <div className="banner">
            <div className="hero-h fill-dark xhatch">
              <div className="bar"><Wordmark /><span className="nav"><span>Residential</span><span>Commercial</span><span>Estimator</span><span>Contact</span></span></div>
              <div className="p-eye" style={{ marginTop: '5cqw' }}>MCS-certified · South Wales</div>
              <h3>Cut your bills with <em>Welsh sunshine.</em></h3>
              <div className="p-sub">Solar, battery, heat pumps &amp; EV — one local, accredited team.</div>
              <span className="p-cta">Get my free quote →</span>
            </div>
          </div>
          <div className="postcap">Website hero header · 16:7</div>
          <div className="banner" style={{ marginTop: 26 }}>
            <div className="lin-b fill-dark xhatch">
              <Wordmark />
              <div className="t">Solar &amp; storage, <em>engineered warmth.</em></div>
            </div>
          </div>
          <div className="postcap">Wide banner (email / LinkedIn / X) · 4:1</div>
        </div>
      </section>

      {/* 08 — Do & Don't */}
      <section id="rules">
        <div className="wrap">
          <div className="sec-k">08 — Usage</div>
          <div className="sec-h"><h2>Do &amp; don&apos;t</h2></div>
          <div className="dd">
            <div className="ddcol do">
              <h4>Do</h4>
              <ul>
                <li>Give layouts room to breathe — space is premium.</li>
                <li>Use solar gold sparingly: one accent word, one CTA.</li>
                <li>Lead with numbers set in Ezra.</li>
                <li>Keep eyebrows in uppercase mono with the gold icon.</li>
                <li>Use the cross-hatch fills for hero and social backgrounds.</li>
              </ul>
            </div>
            <div className="ddcol dont">
              <h4>Don&apos;t</h4>
              <ul>
                <li>Don&apos;t flood a design with gold — it stops being an accent.</li>
                <li>Don&apos;t swap the fonts or add extra typefaces.</li>
                <li>Don&apos;t recolour or restyle the icon set.</li>
                <li>Don&apos;t stretch, rotate or add effects to the wordmark.</li>
                <li>Don&apos;t place the wordmark on busy photos without a scrim.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="wrap">
          <Wordmark />
          <span>Brand guidelines v1.0 · <span className="y">heliaxis.co.uk</span> · 01633 965205</span>
        </div>
      </footer>
    </div>
  );
}
