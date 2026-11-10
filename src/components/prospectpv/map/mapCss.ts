/** Styles for the Map screen. Uses the admin tokens; scoped under .pvm. */
export const MAP_CSS = `
.pvm{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
@media (max-width:960px){.pvm{grid-template-columns:minmax(0,1fr)}}
.pvm-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.pvm-bar .crm-btn[aria-pressed=true]{background:var(--solar);border-color:var(--ink)}
.pvm-search{display:flex;gap:8px;flex:1 1 280px;min-width:0}
.pvm-search input{flex:1;min-width:0;font:inherit;min-height:42px;padding:0 12px;border:1px solid var(--ink);border-radius:2px;background:var(--card)}
.pvm-hits{list-style:none;margin:6px 0 0;padding:0;border:1px solid var(--line);border-radius:4px;background:var(--card)}
.pvm-hits li+li{border-top:1px solid var(--line)}
.pvm-hits button{font:inherit;width:100%;text-align:left;padding:10px 12px;background:none;border:0;cursor:pointer}
.pvm-hits button:hover{background:var(--paper-2)}
.pvm-map-wrap{position:relative;border:1px solid var(--ink);border-radius:4px;overflow:hidden;background:var(--paper-2)}
.pvm-map{height:min(68vh,640px);min-height:380px;width:100%}
.pvm-map-fail{position:absolute;left:8px;right:8px;bottom:30px;margin:0;background:var(--card);border:1px solid var(--amber);padding:8px 10px;font-size:13px;border-radius:2px}
.pvm-side{display:flex;flex-direction:column;gap:12px}
.pvm-stat{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:14px}
.pvm-stat:first-of-type{border-top:0}
.pvm-stat b{font-family:var(--mono);font-weight:700;text-align:right}
.pvm-big{font-family:var(--display);font-weight:900;font-size:34px;line-height:1}
.pvm-list{margin:8px 0 0;padding-left:18px;font-size:13.5px}
.pvm-list li+li{margin-top:4px}
.pvm-block{border-left:3px solid #B3261E;padding:6px 10px;background:rgba(179,38,30,.06);font-size:13.5px;margin-top:8px}
.pvm-note{color:var(--muted);font-size:13px;margin-top:8px}
`;
