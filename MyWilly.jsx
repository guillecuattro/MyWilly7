import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

/* ─── TOKENS ─────────────────────────────────────────────────── */
const C = {
  bg:"#0F1117", surface:"#161B27", card:"#1C2235",
  border:"#262D45", border2:"#313A58",
  text:"#DDE2F0", sub:"#8D97BE", muted:"#4E5670",
  green:"#72DFA8", blue:"#82A8F5", amber:"#EDB97A",
  rose:"#E88A99", violet:"#B8A0E8", teal:"#68C9DC",
};
const PAL = [C.green, C.blue, C.amber, C.rose, C.violet, C.teal];

/* ═══════════════════════════════════════════════════════════════
   REAL DATA FROM EXCEL
   Each entry: date, euros aportados ese día, mkt = valor mercado
   conocido en esa fecha (null si no hay dato ese día).
   aportacion=0 rows = snapshots de mercado sin aportación.
═══════════════════════════════════════════════════════════════ */
/* ── SUSCRIPCIONES REALES DE MYINVESTOR ──────────────────────
   Cada fila = una suscripción real con:
   - partic: participaciones adquiridas
   - nav:    precio por participación en la fecha de compra
   - inv:    inversión realizada (€)
   - mkt:    valor de mercado actual de esas participaciones (€)
   Esto permite calcular el % ganancia/pérdida EXACTO por suscripción.
─────────────────────────────────────────────────────────────── */
/* ── SUSCRIPCIONES REALES — datos exactos de MyInvestor FIFOs ── */
const SUSCRIPCIONES = {
  msci: [
    { date:"2026-01-06", partic:8.116,  nav:12.6639, inv:102.78, mkt:107.89 },
    { date:"2026-01-08", partic:3.562,  nav:12.6334, inv:45.00,  mkt:47.35  },
    { date:"2026-01-08", partic:1.025,  nav:12.6341, inv:12.95,  mkt:13.63  },
    { date:"2026-01-12", partic:1.591,  nav:12.7278, inv:20.25,  mkt:21.15  },
    { date:"2026-01-29", partic:3.991,  nav:12.5282, inv:50.00,  mkt:53.05  },
    { date:"2026-04-06", partic:9.678,  nav:12.3693, inv:119.71, mkt:128.65 },
    { date:"2026-04-06", partic:0.97,   nav:12.3711, inv:12.00,  mkt:12.89  },
    { date:"2026-04-15", partic:3.897,  nav:12.8304, inv:50.00,  mkt:51.80  },
    { date:"2026-05-06", partic:7.587,  nav:13.3531, inv:101.31, mkt:100.86 },
  ],
  emergentes: [
    { date:"2026-01-29", partic:0.72,   nav:277.7778, inv:200.00, mkt:218.15, tipo:"traspaso" },
    { date:"2026-03-03", partic:0.18,   nav:273.8889, inv:49.30,  mkt:54.54  },
    { date:"2026-03-11", partic:0.36,   nav:272.4167, inv:98.07,  mkt:109.07 },
  ],
  cobas: [
    { date:"2026-03-03", partic:0.5871, nav:170.29,   inv:99.98,  mkt:104.72 },
    { date:"2026-04-07", partic:0.2347, nav:170.35,   inv:39.98,  mkt:41.86  },
    { date:"2026-04-15", partic:0.0575, nav:173.74,   inv:9.99,   mkt:10.26  },
    { date:"2026-05-06", partic:0.1688, nav:177.61,   inv:29.98,  mkt:30.11  },
  ],
  abaco: [
    { date:"2026-04-07", partic:3.2656, nav:9.1866,   inv:30.00,  mkt:30.07  },
    { date:"2026-04-14", partic:1.0864, nav:9.2043,   inv:10.00,  mkt:10.01  },
    { date:"2026-05-05", partic:2.174,  nav:9.1996,   inv:20.00,  mkt:20.02  },
  ],
};

const BASE_DATA = {
  msci:       SUSCRIPCIONES.msci.map(s       => ({ date:s.date, aportacion:s.inv, mkt:s.mkt })),
  emergentes: SUSCRIPCIONES.emergentes.map(s => ({ date:s.date, aportacion:s.inv, mkt:s.mkt })),
  cobas:      SUSCRIPCIONES.cobas.map(s      => ({ date:s.date, aportacion:s.inv, mkt:s.mkt })),
  abaco:      SUSCRIPCIONES.abaco.map(s      => ({ date:s.date, aportacion:s.inv, mkt:s.mkt })),

};

const FUND_TOTALS = {
  // Valores exactos de MyInvestor — actualizado 10/05/2026
  msci:       { totalInv:514.00, valorActual:537.27, rendPct:4.53 },
  emergentes: { totalInv:347.37, valorActual:381.76, rendPct:9.90 },
  cobas:      { totalInv:179.93, valorActual:186.95, rendPct:3.90 },
  abaco:      { totalInv:60.00,  valorActual:60.10,  rendPct:0.17 },
};

/* ═══════════════════════════════════════════════════════════════
   BUILD CHART DATA
   Logic:
   1. Calculate running acumulado at each known date
   2. Forward-fill null mkt values
   3. Interpolate mkt values between known anchor dates
   4. For EVERY day from first to last date, compute:
      - invertido: running sum of euros aportados (steps up on aportacion days)
      - valor: interpolated market value
      - esAportacion: true only on days where aportacion > 0
═══════════════════════════════════════════════════════════════ */
function buildChartData(rows) {
  if (!rows || !rows.length) return [];

  // Step 1: forward-fill null mkt, backward-fill first nulls
  let lastMkt = null;
  const filled = rows.map(r => {
    if (r.mkt !== null && r.mkt !== undefined) lastMkt = r.mkt;
    return { ...r, mktFilled: r.mkt !== null && r.mkt !== undefined ? r.mkt : lastMkt };
  });
  let firstMkt = null;
  for (let i = filled.length - 1; i >= 0; i--) {
    if (filled[i].mktFilled !== null) firstMkt = filled[i].mktFilled;
    else filled[i].mktFilled = firstMkt;
  }

  // Step 2: build running invertido at each row date
  let cumInv = 0;
  const anchors = filled.map(r => {
    cumInv += r.aportacion || 0;
    return {
      date:         new Date(r.date),
      ts:           new Date(r.date).getTime(),
      invertido:    +cumInv.toFixed(2),
      mkt:          r.mktFilled,
      esAportacion: (r.aportacion || 0) > 0,
    };
  });

  // Known mkt anchors (for valor interpolation)
  const mktAnchors = anchors.filter(a => a.mkt !== null);

  if (!mktAnchors.length) return [];

  // Step 3: build daily points from first aportacion to last date
  const startDate = anchors[0].date;
  const endDate   = anchors[anchors.length - 1].date;
  const result    = [];
  const d = new Date(startDate);

  while (d <= endDate) {
    const ts = d.getTime();

    // invertido: last known acumulado on or before this date
    const lastAnchor = anchors.filter(a => a.ts <= ts).slice(-1)[0];
    const invertido  = lastAnchor ? lastAnchor.invertido : anchors[0].invertido;

    // valor: linear interpolation between surrounding mkt anchors
    let valor = null;
    for (let i = 0; i < mktAnchors.length - 1; i++) {
      const a = mktAnchors[i], b = mktAnchors[i + 1];
      if (ts >= a.ts && ts <= b.ts) {
        const t = (ts - a.ts) / (b.ts - a.ts);
        valor   = +(a.mkt + (b.mkt - a.mkt) * t).toFixed(2);
        break;
      }
    }
    if (valor === null) {
      const exact = mktAnchors.find(a => a.ts === ts);
      if (exact) valor = exact.mkt;
    }
    if (valor === null && ts >= mktAnchors[mktAnchors.length - 1].ts)
      valor = mktAnchors[mktAnchors.length - 1].mkt;
    if (valor === null)
      valor = mktAnchors[0].mkt;

    // esAportacion: only on real contribution days
    const isAport = anchors.some(a => a.ts === ts && a.esAportacion);

    result.push({
      date:         new Date(d),
      ts,
      label:        new Date(d).toLocaleDateString("es-ES", { day:"2-digit", month:"short" }),
      invertido:    +invertido.toFixed(2),
      valor:        +valor.toFixed(2),
      esAportacion: isAport,
    });

    d.setDate(d.getDate() + 1);
  }
  return result;
}

/* Filter to period window — relative to last date in data */
function filterPeriod(data, months) {
  if (!data.length) return data;
  if (months === 0) return data; // "all" = show everything
  const lastDate = data[data.length - 1].date;
  const cutoff   = new Date(lastDate);
  cutoff.setMonth(cutoff.getMonth() - months);
  // Keep all contribution points + points inside window
  const filtered = data.filter(p => p.date >= cutoff || p.esAportacion);
  return filtered.length >= 2 ? filtered : data;
}

/* Thin for performance — ALWAYS keep all contribution points */
function thinData(data, maxRegular = 40) {
  const aportPts   = data.filter(p => p.esAportacion);
  const regularPts = data.filter(p => !p.esAportacion);
  let kept = regularPts;
  if (regularPts.length > maxRegular) {
    const step = Math.ceil(regularPts.length / maxRegular);
    kept = regularPts.filter((_, i) => i % step === 0);
    if (!kept.includes(regularPts[0]))          kept.unshift(regularPts[0]);
    if (!kept.includes(regularPts[regularPts.length-1])) kept.push(regularPts[regularPts.length-1]);
  }
  const merged = [...aportPts, ...kept];
  merged.sort((a, b) => a.ts - b.ts);
  // Deduplicate by ts
  return merged.filter((p, i) => i === 0 || p.ts !== merged[i-1].ts);
}

/* ─── DEFAULT FUNDS (base — always present) ──────────────────── */
const DEFAULT_FUNDS = [
  { id:"msci",       name:"Fidelity MSCI World Index Fund P-ACC-EUR",     shortName:"MSCI World", isin:"IE00BYX5NX33", type:"Fondo Indexado",     color:PAL[0], annualReturn:24.30, ...FUND_TOTALS.msci       },
  { id:"emergentes", name:"Vanguard Emerging Markets Stock Index EUR Acc", shortName:"Emergentes", isin:"IE0031786696",  type:"Fondo Indexado",     color:PAL[1], annualReturn:23.96, ...FUND_TOTALS.emergentes },
  { id:"cobas",      name:"Cobas International Fund-P Acc EUR",            shortName:"Cobas Int.", isin:"LU1598719752",  type:"Fondo de Inversión", color:PAL[2], annualReturn:35.21, ...FUND_TOTALS.cobas      },
  { id:"abaco",      name:"Abaco Renta Fija Mixta Global C FI",            shortName:"Ábaco RF",   isin:"ES0140072028",  type:"Fondo Mixto",        color:PAL[3], annualReturn:8.15,  ...FUND_TOTALS.abaco      },
];

const FUND_TYPES = ["Fondo Indexado","Fondo de Inversión","Fondo Mixto","ETF","Renta Fija","Renta Variable","Monetario"];

/* ─── STORAGE ────────────────────────────────────────────────── */
const APP_VER = "v15";
function clearOld() {
  for (let v=1;v<=14;v++) { try{localStorage.removeItem(`mw_v${v}`);localStorage.removeItem(`mw_c_v${v}`);localStorage.removeItem(`mw_extra_v${v}`);}catch{} }
}
function loadExtra() {
  clearOld();
  try { const s=localStorage.getItem(`mw_x_${APP_VER}`); return s?JSON.parse(s):{}; } catch { return {}; }
}
function loadCustomFunds() {
  try { const s=localStorage.getItem(`mw_funds_${APP_VER}`); return s?JSON.parse(s):[]; } catch { return []; }
}

/* ─── ICONS ──────────────────────────────────────────────────── */
const IChevL = ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IChevR = ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
const IPlus  = ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ITrash = ()=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IClose = ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IHome  = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IFunds = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const ICheck = ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const INews  = ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>;
const IPlay  = ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const IStop  = ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>;
const IRefresh =()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IWidget  =()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const ITax     =()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>;
const IDownload=()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const ISettings=()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

const Logo = ({size=44})=>(
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <defs>
      <linearGradient id="lgC1" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#72DFA8"/><stop offset="100%" stopColor="#82A8F5"/></linearGradient>
      <linearGradient id="lgC2" x1="0" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#1C2640"/><stop offset="100%" stopColor="#0F1117"/></linearGradient>
    </defs>
    <rect width="120" height="120" rx="28" fill="url(#lgC2)"/>
    <rect x="1.5" y="1.5" width="117" height="117" rx="27" stroke="#262D45" strokeWidth="1.5" fill="none"/>
    {/* Top accent — clipped to rounded corners so it follows the icon shape exactly */}
    <defs>
      <clipPath id="iconClip">
        <rect width="120" height="120" rx="28"/>
      </clipPath>
    </defs>
    <rect x="0" y="0" width="120" height="5" fill="url(#lgC1)" clipPath="url(#iconClip)"/>
    <text x="14" y="42" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif" fontWeight="400" fontSize="14" fill="#8D97BE">My</text>
    <text x="14" y="70" fontFamily="'Plus Jakarta Sans',system-ui,sans-serif" fontWeight="800" fontSize="30" letterSpacing="-1" fill="url(#lgC1)">Willy</text>
    <polyline points="14,90 26,82 36,86 48,76 60,80 74,70 90,74 106,64" stroke="url(#lgC1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="48" cy="76" r="2.5" fill="#72DFA8"/>
    <circle cx="74" cy="70" r="2.5" fill="#82A8F5"/>
    <circle cx="106" cy="64" r="3" fill="#72DFA8"/>
  </svg>
);

const ChartTip = ({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return(
    <div style={{background:C.card,border:`1px solid ${C.border2}`,borderRadius:9,padding:"8px 12px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <div style={{color:C.sub,fontSize:10,marginBottom:3}}>{label}</div>
      {payload.filter(p=>p.value!=null).map((p,i)=>(
        <div key={i} style={{color:p.stroke,fontWeight:600,fontSize:12,marginBottom:1}}>
          {p.name}: {(+p.value).toFixed(2)}€
        </div>
      ))}
    </div>
  );
};

const PERIODS = [
  {label:"1M",months:1},{label:"3M",months:3},{label:"6M",months:6},
  {label:"1A",months:12},{label:"Todo",months:0},
];

/* ══════════════════════════════════════════════════════════════ */
export default function MyWilly() {
  const [extraC,       setExtraC]       = useState(loadExtra);
  const [customFunds,  setCustomFunds]  = useState(loadCustomFunds);
  const [selIdx,       setSelIdx]       = useState(0);
  const [addFundModal,  setAddFundModal]  = useState(false);
  const [newFund,       setNewFund]       = useState({name:"",shortName:"",isin:"",type:"Fondo Indexado",color:PAL[4]});
  const [confirmDelete, setConfirmDelete] = useState(null); // fund object to confirm deletion
  const [period,  setPeriod]  = useState(2); // 6M default
  const [tab,     setTab]     = useState("home");
  const [modal,   setModal]   = useState(null);
  const [mounted, setMounted] = useState(false);
  const [vw,      setVw]      = useState(typeof window!=="undefined"?window.innerWidth:390);
  const [wizStep,      setWizStep]      = useState(1);
  const [wizDate,      setWizDate]      = useState("");
  const [wizSelected,  setWizSelected]  = useState([]);
  const [wizEntries,   setWizEntries]   = useState({});
  // navActuals: user-entered current value per fund — used to recalculate all %
  const [navActuals,   setNavActuals]   = useState(()=>{
    try { const s=localStorage.getItem(`mw_nav_${APP_VER}`); return s?JSON.parse(s):{}; } catch { return {}; }
  });
  // News state
  const [news,      setNews]      = useState(()=>{
    try { const s=localStorage.getItem(`mw_news_${APP_VER}`); return s?JSON.parse(s):null; } catch { return null; }
  });
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError,   setNewsError]   = useState(null);
  const [speaking,      setSpeaking]      = useState(false);
  const [speakIdx,      setSpeakIdx]      = useState(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesResult,  setPricesResult]  = useState(null);
  const [pricesError,   setPricesError]   = useState(null);
  const [autoUpdating, setAutoUpdating] = useState(false);
  // NAV history: { fundId: [{date, nav}] } — one entry per day prices are fetched
  const [navHistory, setNavHistory] = useState(()=>{
    try { const s=localStorage.getItem(`mw_navh_${APP_VER}`); return s?JSON.parse(s):{}; } catch { return {}; }
  });
  const [navHistLoading, setNavHistLoading] = useState(false);

  useEffect(()=>{const h=()=>setVw(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  useEffect(()=>{setTimeout(()=>setMounted(true),60);},[]);
  useEffect(()=>{localStorage.setItem(`mw_x_${APP_VER}`,JSON.stringify(extraC));},[extraC]);
  useEffect(()=>{localStorage.setItem(`mw_funds_${APP_VER}`,JSON.stringify(customFunds));},[customFunds]);
  useEffect(()=>{localStorage.setItem(`mw_nav_${APP_VER}`,JSON.stringify(navActuals));},[navActuals]);
  useEffect(()=>{ if(news) localStorage.setItem(`mw_news_${APP_VER}`,JSON.stringify(news)); },[news]);
  useEffect(()=>{ localStorage.setItem(`mw_navh_${APP_VER}`,JSON.stringify(navHistory)); },[navHistory]);

  // ── GEMINI API HELPER ──────────────────────────────────────────
  // Uses Gemini 2.0 Flash (free tier: 1500 req/day)
  // useSearch=true enables Google Search grounding for real-time data
  const callGemini = async (prompt, useSearch=true, maxTokens=1500) => {
    // VITE_GEMINI_API_KEY is injected by Vercel at build time.
    // In Claude preview this is empty — the app still works, API calls just won't fire.
    const key = (window.__GEMINI_KEY__ || "");
    if (!key) throw new Error("API key de Gemini no configurada. Añade VITE_GEMINI_API_KEY en Vercel.");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const body = {
      contents: [{ role:"user", parts:[{ text: prompt }] }],
      ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens }
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.json().catch(()=>({}));
      throw new Error(err?.error?.message || "HTTP " + r.status);
    }
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const text = d.candidates
      ?.flatMap(c => c.content?.parts || [])
      ?.map(p => p.text || "")
      ?.join("") || "";
    if (!text) throw new Error("Gemini no devolvió texto. Comprueba la API key.");
    return text;
  };

  // Check if news needs refresh (once per day)
  const needsNewsRefresh = ()=>{
    if(!news) return true;
    const last = new Date(news.fetchedAt);
    const now  = new Date();
    return now.toDateString() !== last.toDateString();
  };

  const fetchNews = async ()=>{
    setNewsLoading(true); setNewsError(null);
    try {
      const todayLong = new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
      const fondosDesc = FUNDS.map(f=>`- ${f.name} (ISIN: ${f.isin}, id: "${f.id}")`).join("\n");
      const fondosJsonTpl = FUNDS.map(f=>`        "${f.id}": "Cómo afecta a ${f.shortName} - 1 frase concisa"`).join(",\n");

      const prompt = `Hoy es ${todayLong}. Eres un analista financiero experto. Busca las noticias geopolíticas y macroeconómicas más relevantes de HOY que impacten en los mercados financieros globales.

El usuario tiene estos fondos en cartera:
${fondosDesc}

Estructura tu respuesta en JSON con este formato exacto (sin markdown, sin backticks, solo JSON puro):
{
  "titular": "Resumen ejecutivo del día en una frase impactante",
  "sentimiento": "positivo" | "negativo" | "neutral",
  "noticias": [
    {
      "titulo": "Título corto de la noticia",
      "resumen": "2-3 frases explicando la noticia y su impacto en mercados",
      "impacto": "positivo" | "negativo" | "neutral",
      "impacto": "positivo" | "negativo" | "neutral",
      "imagen": "3-4 palabras en inglés para buscar una imagen representativa (ej: federal reserve building, oil barrels market, china trade war)",
      "fondos": {
${fondosJsonTpl}
      }
    }
  ],
  "conclusion": "Conclusión general para el inversor en 2-3 frases"
}

Incluye entre 4 y 6 noticias. Busca eventos reales de hoy: geopolítica, bancos centrales, inflación, divisas, sectores clave. Relaciona cada noticia con los fondos específicos del usuario.`;

      const text = await callGemini(prompt, true, 2000);
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setNews({ ...parsed, fetchedAt: new Date().toISOString() });
    } catch(e) {
      setNewsError("No se pudieron cargar las noticias. Comprueba tu conexión o la API key de Gemini.");
    }
    setNewsLoading(false);
  };

  // ── AUTO-PRICE UPDATE — once per trading day ──────────────────
  const needsPriceUpdate = () => {
    const lastUpdate = navActuals._updatedAt;
    if (!lastUpdate) return true;
    const last = new Date(lastUpdate);
    const now  = new Date();
    // Update if different day and it's after 6pm (when NAVs are usually published)
    return now.toDateString() !== last.toDateString() && now.getHours() >= 18;
  };

  const autoUpdatePrices = async () => {
    if (!needsPriceUpdate()) return;
    setAutoUpdating(true);
    await fetchPrices();

    setNavActuals(p=>({...p, _updatedAt: new Date().toISOString()}));
    setAutoUpdating(false);
  };

  // Fetch historical NAV for a fund via Claude + web search
  const fetchNavHistory = async (fund) => {
    setNavHistLoading(true);
    try {
      const firstDate = (SUSCRIPCIONES[fund.id]||[])[0]?.date || "2026-01-01";
      const prompt = `Busca el histórico de valores liquidativos (NAV) del siguiente fondo de inversión desde ${firstDate} hasta hoy. Usa Financial Times (ft.com), Morningstar o JustETF con el ISIN proporcionado.

Fondo: ${fund.name}
ISIN: ${fund.isin}

Necesito al menos un punto por semana. Responde ÚNICAMENTE con JSON puro:
{
  "fund_id": "${fund.id}",
  "puntos": [
    {"date": "2026-01-06", "nav": 12.45},
    {"date": "2026-01-13", "nav": 12.51}
  ]
}`;

      const text = await callGemini(prompt, true, 3000);
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.puntos?.length) {
        setNavHistory(prev => {
          const existing = prev[fund.id] || [];
          const existingDates = new Set(existing.map(p=>p.date));
          const newPts = parsed.puntos.filter(p => !existingDates.has(p.date));
          return {
            ...prev,
            [fund.id]: [...existing, ...newPts].sort((a,b)=>a.date.localeCompare(b.date))
          };
        });
      }
    } catch(e) { console.error("NAV history fetch failed", e); }
    setNavHistLoading(false);
  };

  // Auto-fetch news once per day on mount + auto-price
  useEffect(()=>{
    if(needsNewsRefresh()) fetchNews();
    autoUpdatePrices();
  },[]);

  // ── FETCH NAV PRICES via Claude + web search ────────────────
  const fetchPrices = async () => {
    setPricesLoading(true); setPricesError(null); setPricesResult(null);
    try {
      const todayShort = new Date().toLocaleDateString("es-ES", {day:"2-digit", month:"long", year:"numeric"});
      // Build dynamic fund list + participaciones from SUSCRIPCIONES + extraC
      const fondosList = FUNDS.map((f,i) => {
        const susc   = SUSCRIPCIONES[f.id]||[];
        const extras = (extraC[f.id]||[]);
        const totalP = +(susc.reduce((s,x)=>s+x.partic,0) + extras.reduce((s,x)=>s+(x.partic||0),0)).toFixed(4);
        return `${i+1}. ${f.name} — ISIN: ${f.isin}${totalP>0?` (${totalP} participaciones)`:""}`;
      }).join("\n");

      const fondosJson = FUNDS.map(f => {
        const susc   = SUSCRIPCIONES[f.id]||[];
        const extras = (extraC[f.id]||[]);
        const totalP = +(susc.reduce((s,x)=>s+x.partic,0) + extras.reduce((s,x)=>s+(x.partic||0),0)).toFixed(4);
        return `    { "id": "${f.id}", "nav": 0, "valAct": ${totalP>0?"NAV*"+totalP:0}, "fuente": "fuente" }`;
      }).join(",\n");

      const prompt = `Busca el valor liquidativo (NAV) más reciente de estos fondos de inversión. Para cada uno busca en Financial Times Markets (ft.com/markets/funds), Morningstar, JustETF o la web oficial de la gestora usando el ISIN.

Fondos a buscar:
${fondosList}

Para cada fondo multiplica el NAV encontrado por las participaciones indicadas para obtener el valor total actual de cartera.

Hoy es ${todayShort}. Responde ÚNICAMENTE con JSON puro (sin markdown, sin backticks):
{
  "fecha": "fecha del NAV encontrado (dd/mm/yyyy)",
  "fondos": [
${fondosJson}
  ]
}

IMPORTANTE: usa los ids exactamente como aparecen. Si no encuentras el NAV de algún fondo, pon null en ese campo.`;

      const text = await callGemini(prompt, true, 1000);
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Apply new navActuals from fetched prices
      const newNav = { ...navActuals };
      parsed.fondos.forEach(f => {
        if (f.valAct && f.valAct > 0) newNav[f.id] = f.valAct;
      });
      setNavActuals(newNav);
      setPricesResult({ ...parsed, updatedAt: new Date().toISOString() });

      // Save NAV data point to history
      const todayISO = new Date().toISOString().slice(0,10);
      setNavHistory(prev => {
        const updated = { ...prev };
        parsed.fondos.forEach(f => {
          if (f.nav && f.nav > 0) {
            const existing = updated[f.id] || [];
            const filtered = existing.filter(p => p.date !== todayISO);
            updated[f.id] = [...filtered, { date: today, nav: f.nav }]
              .sort((a,b) => a.date.localeCompare(b.date));
          }
        });
        return updated;
      });
    } catch(e) {
      setPricesError("No se pudo obtener el precio. Inténtalo de nuevo.");
      console.error(e);
    }
    setPricesLoading(false);
  };

  // TTS functions
  /* ── TTS: rewrite via Claude API for natural spoken delivery ──
     Instead of regex hacks, Claude rewrites the text as a radio
     presenter would actually say it — expanding abbreviations,
     softening financial jargon, and making numbers sound natural.
     Result is cached per text to avoid repeat API calls. ────── */
  const speechCache = useRef({});

  const getSpokenText = async (text) => {
    if (speechCache.current[text]) return speechCache.current[text];
    try {
      const prompt = `Eres un presentador de radio financiero español. Reescribe el siguiente texto para que suene completamente natural al leerlo en voz alta, como lo haría un locutor profesional. Reglas:
- Expande TODAS las abreviaturas: EE.UU. → "Estados Unidos", BCE → "Banco Central Europeo", Fed → "Reserva Federal", IPC → "Índice de Precios al Consumo", PIB → "Producto Interior Bruto", ETF → "fondo cotizado", bps → "puntos básicos"
- Los números: 4,25% → "cuatro coma veinticinco por ciento", 400.000 → "cuatrocientos mil"
- Los símbolos: € → "euros", $ → "dólares", % → "por ciento"
- Frases naturales: no digas "el FOMC votó", di "la Reserva Federal decidió"
- Devuelve ÚNICAMENTE el texto reescrito, sin explicaciones ni comillas

Texto:
${text}`;
      const spoken = (await callGemini(prompt, false, 800)) || text;
      speechCache.current[text] = spoken;
      return spoken;
    } catch {
      return text;
    }
  };

  const doSpeak = (text) => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "es-ES"; utt.rate = 1.1; utt.pitch = 1.25;
    const voices = window.speechSynthesis.getVoices();
    // Prefer Rocko (es-ES) specifically — fallback to any Spain Spanish voice
    const rockoES = voices.find(v => v.name.toLowerCase().includes("rocko") && v.lang.startsWith("es-ES"));
    const rockoAny= voices.find(v => v.name.toLowerCase().includes("rocko"));
    const esESVoices = voices.filter(v => v.lang === "es-ES");
    const esVoices   = voices.filter(v => v.lang.startsWith("es"));
    utt.voice = rockoES || rockoAny || esESVoices[0] || esVoices[0] || null;
    utt.onend = () => { setSpeaking(false); setSpeakIdx(null); };
    window.speechSynthesis.speak(utt);
  };

  const speak = async (text, idx) => {
    window.speechSynthesis.cancel();
    if (speakIdx === idx) { setSpeaking(false); setSpeakIdx(null); return; }
    setSpeaking(true); setSpeakIdx(idx);
    const spoken = await getSpokenText(text);
    // Check still active after async wait
    doSpeak(spoken);
  };
  const stopSpeak = () => { window.speechSynthesis.cancel(); setSpeaking(false); setSpeakIdx(null); };
  const ip = vw >= 768;

  // Merged fund list: default funds (excluding hidden ones) + user-added custom funds
  const hiddenIds = customFunds.filter(f=>f._hidden).map(f=>f.id);
  const FUNDS = [
    ...DEFAULT_FUNDS.filter(f=>!hiddenIds.includes(f.id)),
    ...customFunds.filter(f=>!f._hidden),
  ];

  /* Build dynamic fund data including extras */
  const dynFunds = useMemo(()=> FUNDS.map(f=>{
    const extras   = extraC[f.id]||[];
    const extraInv = +extras.reduce((s,c)=>s+(c.aportacion||0),0).toFixed(2);
    const totalInv = +(f.totalInv+extraInv).toFixed(2);
    const factor   = f.totalInv>0?f.valorActual/f.totalInv:1;
    const valAct   = +(totalInv*factor).toFixed(2);
    const gain     = +(valAct-totalInv).toFixed(2);
    const rendPct  = totalInv>0?+(gain/totalInv*100).toFixed(2):f.rendPct;

    // Merge base + extra rows, sort by date, rebuild acumulado
    const allRows = [
      ...BASE_DATA[f.id],
      ...extras.map(e=>({ date:e.date, aportacion:e.aportacion, mkt:e.mktAntes||null })),
    ].sort((a,b)=>new Date(a.date)-new Date(b.date));

    const chartDataFull = buildChartData(allRows);
    return { ...f, totalInv, valAct, gain, rendPct, allRows, chartDataFull };
  }),[extraC]);

  const fund      = dynFunds[selIdx]||dynFunds[0];
  const TOTAL_INV = +dynFunds.reduce((s,f)=>s+f.totalInv,0).toFixed(2);
  const TOTAL_VAL = +dynFunds.reduce((s,f)=>s+f.valAct,0).toFixed(2);
  const TOTAL_GAIN= +(TOTAL_VAL-TOTAL_INV).toFixed(2);
  const TOTAL_PCT = TOTAL_INV>0?+(TOTAL_GAIN/TOTAL_INV*100).toFixed(2):0;
  const isPos     = TOTAL_GAIN>=0;
  const DIST      = dynFunds.map(f=>({name:f.shortName,color:f.color,pct:TOTAL_INV>0?+(f.totalInv/TOTAL_INV*100).toFixed(1):0}));

  /* Chart data for active fund + selected period */
  const chartData = useMemo(()=>{
    const full     = fund.chartDataFull||[];
    const filtered = filterPeriod(full, PERIODS[period].months);
    return thinData(filtered, 40);
  },[fund, period]);

  /* Contribution rows for table — use SUSCRIPCIONES for exact % per entry */
  const contribRows = useMemo(()=>{
    // Get real suscripciones for this fund (if available)
    const susc = SUSCRIPCIONES[fund.id] || [];

    if (susc.length > 0) {
      // Use navActuals if user has entered a current value, else use fund.valAct
      const userValAct = navActuals[fund.id] ? parseFloat(navActuals[fund.id]) : fund.valAct;
      const totalPartic = susc.reduce((s,x)=>s+x.partic,0);
      const navActual = totalPartic > 0 ? userValAct / totalPartic : fund.valAct / totalPartic;
      let cumInv = 0;
      return susc.map((s,i) => {
        cumInv = +(cumInv + s.inv).toFixed(2);
        const valorHoy = +(s.partic * navActual).toFixed(2);
        const gain     = +(valorHoy - s.inv).toFixed(2);
        const pct      = s.inv > 0 ? +(gain / s.inv * 100).toFixed(2) : 0;
        return {
          date:      s.date,
          aportacion:s.inv,
          partic:    s.partic,
          nav:       s.nav,
          acumulado: cumInv,
          valorHoy,
          gain,
          pct,
          pos: gain >= 0,
          isExtra: false,
        };
      });
    }

    // Fallback for funds without SUSCRIPCIONES data (proportional method)
    const totalValNow = fund.valAct;
    const totalInvNow = fund.totalInv;
    return fund.allRows
      .filter(r=>r.aportacion>0)
      .reduce((acc,r)=>{
        const prev     = acc.reduce((s,x)=>s+x.aportacion,0);
        const acum     = +(prev+r.aportacion).toFixed(2);
        const share    = totalInvNow>0?r.aportacion/totalInvNow:0;
        const valorHoy = +(share*totalValNow).toFixed(2);
        const gain     = +(valorHoy-r.aportacion).toFixed(2);
        const pct      = r.aportacion>0?+(gain/r.aportacion*100).toFixed(2):0;
        return [...acc,{...r,acumulado:acum,valorHoy,gain,pct,pos:gain>=0}];
      },[]);
  },[fund]);

  /* Wizard */
  const openWizard=()=>{setWizStep(1);setWizDate("");setWizSelected([]);setWizEntries({});setModal("wizard");};
  const toggleFund=id=>setWizSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const wizNext=()=>{
    if(!wizDate||!wizSelected.length) return;
    const init={};
    wizSelected.forEach(id=>{init[id]={aportacion:""};});
    setWizEntries(init); setWizStep(2);
  };
  const wizSave=()=>{
    if(!wizSelected.every(id=>parseFloat(wizEntries[id]?.aportacion)>0)) return;
    const ne={...extraC};

    wizSelected.forEach(id=>{
      const entry   = wizEntries[id]||{};
      const inv     = parseFloat(entry.aportacion);
      const fund    = dynFunds.find(f=>f.id===id);
      // Use nav entered by the user (pre-filled from API but may have been edited)
      const navHoy  = parseFloat(entry.nav)||0;
      const partic  = (navHoy>0 && inv>0) ? +(inv/navHoy).toFixed(4) : 0;
      // Update navActuals so the fund value reflects the new contribution
      const susc    = SUSCRIPCIONES[id]||[];
      const totalP  = susc.reduce((s,x)=>s+x.partic,0) + partic;
      // Recalculate fund total value: (existing partic + new partic) * navHoy
      if(navHoy>0 && totalP>0) {
        const newNavActuals2 = {...ne}; // just for reference — navActuals updated separately
      }

      ne[id]=[...(ne[id]||[]),{
        id:    `w${Date.now()}_${id}`,
        date:  wizDate,
        aportacion: inv,
        nav:   +navHoy.toFixed(4),
        partic,
        mkt:   +(partic * navHoy).toFixed(2),
      }];
    });

    setExtraC(ne);
    setModal(null);
  };
  const delExtra=(fid,cid)=>setExtraC(p=>({...p,[fid]:(p[fid]||[]).filter(c=>c.id!==cid)}));

  /* ── CHART COMPONENT with manual dot overlay ─────────────── */
  const FundChart = ({fund:f, data, height=165}) => {
    // Use a fixed viewBox coordinate system matching the data domain
    // No pixel measurement needed — SVG scales automatically
    const allVals = data.flatMap(d=>[d.valor,d.invertido]).filter(v=>v!=null);
    const rawMin  = Math.min(...allVals);
    const rawMax  = Math.max(...allVals);
    const pad     = Math.max((rawMax-rawMin)*0.12, 5);
    const yMin    = rawMin - pad;
    const yMax    = rawMax + pad;

    // ViewBox: 1000×600 internal units, margins match Recharts
    const VW = 1000, VH = 600;
    const ML = 42, MR = 8, MT = 10, MB = 25; // left=yAxisW+margin

    // Scale functions in viewBox units
    const n    = data.length;
    const xS   = idx => ML + (n<=1 ? (VW-ML-MR)/2 : (idx/(n-1))*(VW-ML-MR));
    const yS   = val => MT + (1-(val-yMin)/(yMax-yMin))*(VH-MT-MB);

    const aportDots = data.map((pt,idx)=>({pt,idx})).filter(({pt})=>pt.esAportacion);

    const MARGIN = {top:8, right:6, left:2, bottom:16};
    const yAxisW = 38;

    return(
      <div style={{height, position:"relative", width:"100%"}}>
        {/* Recharts draws the lines */}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
            <XAxis dataKey="label" tick={{fill:C.muted,fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd" height={16}/>
            <YAxis tick={{fill:C.muted,fontSize:9}} tickLine={false} axisLine={false} domain={[yMin,yMax]} width={yAxisW} tickFormatter={v=>`${Math.round(v)}`}/>
            <Tooltip content={<ChartTip/>}/>
            <Line type="monotone" dataKey="invertido" name="Invertido"
              stroke={C.muted} strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={false}/>
            <Line type="monotone" dataKey="valor" name="Valor cartera"
              stroke={f.color} strokeWidth={2.2} dot={false}
              activeDot={{r:4,fill:f.color,stroke:C.bg,strokeWidth:2}} animationDuration={300}/>
          </ComposedChart>
        </ResponsiveContainer>
        {/* SVG overlay uses preserveAspectRatio="none" to stretch to container */}
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:10}}>
          {aportDots.map(({pt,idx},i)=>{
            const cx  = xS(idx);
            const cyV = yS(pt.valor);
            const cyI = yS(pt.invertido);
            return(
              <g key={`dot-${i}`}>
                {/* Dot on invertido line */}
                <circle cx={cx} cy={cyI} r={16} fill={C.muted} fillOpacity={0.2}/>
                <circle cx={cx} cy={cyI} r={8}  fill={C.muted} stroke={C.bg} strokeWidth={4}/>
                {/* Dot on valor line */}
                <circle cx={cx} cy={cyV} r={20} fill={f.color} fillOpacity={0.2}/>
                <circle cx={cx} cy={cyV} r={10} fill={f.color} stroke={C.bg} strokeWidth={4}/>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  /* ── PERIOD BAR ───────────────────────────────────────────── */
  const PBar=({color})=>(
    <div style={{display:"flex",background:C.surface,borderRadius:8,padding:2,border:`1px solid ${C.border}`,flexShrink:0}}>
      {PERIODS.map((p,i)=>(
        <button key={p.label} onClick={()=>setPeriod(i)} style={{
          background:period===i?(color||C.green)+"22":"transparent",
          color:period===i?(color||C.green):C.muted,
          border:period===i?`1px solid ${(color||C.green)}40`:"1px solid transparent",
          borderRadius:6,padding:"4px 7px",fontSize:10,fontWeight:600,
          fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",transition:"all 0.12s",
        }}>{p.label}</button>
      ))}
    </div>
  );

  /* ── FUND VIEW ────────────────────────────────────────────── */
  const FundView=()=>{
    const pos = fund.rendPct>=0;


    return(
      <div style={{opacity:mounted?1:0,transform:mounted?"none":"translateY(10px)",transition:"all 0.3s"}}>

        {/* Fund tabs */}
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:13}}>
          <button onClick={()=>setSelIdx(i=>(i-1+FUNDS.length)%FUNDS.length)} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.sub,borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",flexShrink:0}}><IChevL/></button>
          <div style={{flex:1,display:"flex",gap:5,overflowX:"auto",paddingBottom:1}}>
            {FUNDS.map((f,i)=>(
              <button key={f.id} onClick={()=>setSelIdx(i)} style={{
                background:selIdx===i?f.color+"22":"transparent",
                color:selIdx===i?f.color:C.muted,
                border:`1px solid ${selIdx===i?f.color+"55":C.border}`,
                borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600,
                fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
              }}>
                <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:f.color,marginRight:5,verticalAlign:"middle"}}/>
                {f.shortName}
              </button>
            ))}
          </div>
          {/* Add fund button */}
          <button onClick={()=>setAddFundModal(true)} style={{background:`${C.green}18`,border:`1px solid ${C.green}40`,color:C.green,borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",flexShrink:0}} title="Añadir fondo">
            <IPlus/>
          </button>
          <button onClick={()=>setSelIdx(i=>(i+1)%FUNDS.length)} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.sub,borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",flexShrink:0}}><IChevR/></button>
        </div>

        {/* Fund header */}
        <div style={{background:C.card,border:`1px solid ${fund.color}40`,borderRadius:16,padding:"15px",marginBottom:11}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:13}}>
            <div style={{flex:1,minWidth:0,marginRight:10}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:fund.color}}/>
                <span style={{fontSize:9,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>{fund.type}</span>
              </div>
              <div style={{fontSize:ip?14:12,fontWeight:700,color:C.text,lineHeight:1.3}}>{fund.name}</div>
              <div style={{fontSize:9,color:C.muted,marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>{fund.isin}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:ip?22:19,fontWeight:800,color:C.text,lineHeight:1}}>{fund.valAct.toFixed(2)}€</div>
              <div style={{fontSize:12,color:pos?C.green:C.rose,marginTop:3,fontWeight:700}}>
                {pos?"＋":"－"}{Math.abs(fund.gain).toFixed(2)}€ <span style={{fontSize:11}}>({pos?"+":""}{fund.rendPct}%)</span>
              </div>
              {/* Delete button — all funds */}
              <button onClick={()=>setConfirmDelete(fund)}
                style={{marginTop:6,fontSize:9,color:C.rose,background:`${C.rose}15`,border:`1px solid ${C.rose}30`,borderRadius:7,padding:"3px 8px",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>
                Eliminar fondo
              </button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {[
              {l:"Invertido",    v:`${fund.totalInv.toFixed(2)}€`,c:C.sub},
              {l:"Valor actual", v:`${fund.valAct.toFixed(2)}€`,  c:fund.color},
              {l:"Ganancia",     v:`${pos?"＋":"－"}${Math.abs(fund.gain).toFixed(2)}€`,c:pos?C.green:C.rose},
              {l:"Rentab.",      v:`${pos?"+":""}${fund.rendPct}%`,c:pos?C.green:C.rose},
            ].map((m,i)=>(
              <div key={i} style={{background:C.surface,borderRadius:9,padding:"8px 7px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{m.l}</div>
                <div style={{fontWeight:700,fontSize:ip?12:10,color:m.c,lineHeight:1.2}}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── NAV PRICE CHART ─────────────────────────────── */}

        {(()=>{
          const [navPeriod, setNavPeriod] = React.useState("6M");
          const navPeriods = [{l:"1M",m:1},{l:"3M",m:3},{l:"6M",m:6},{l:"Todo",m:0}];
          const history = navHistory[fund.id] || [];

          // Filter by period
          const filtered = React.useMemo(()=>{
            if(!history.length) return [];
            const p = navPeriods.find(p=>p.l===navPeriod);
            if(!p||p.m===0) return history;
            const cut = new Date(); cut.setMonth(cut.getMonth()-p.m);
            const cutStr = cut.toISOString().slice(0,10);
            return history.filter(p=>p.date>=cutStr);
          },[history, navPeriod]);

          const hasData = filtered.length >= 2;
          const first = filtered[0], last = filtered[filtered.length-1];
          const navGain = (first&&last) ? +(last.nav-first.nav).toFixed(4) : 0;
          const navPct  = (first&&first.nav>0) ? +((navGain/first.nav)*100).toFixed(2) : 0;
          const navPos  = navGain >= 0;

          // Chart dimensions
          const allNavs = filtered.map(p=>p.nav);
          const yMin = allNavs.length ? Math.min(...allNavs)*0.998 : 0;
          const yMax = allNavs.length ? Math.max(...allNavs)*1.002 : 1;

          return(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"13px",marginBottom:11}}>
              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.text}}>Precio por participación (NAV)</div>
                  <div style={{fontSize:9,color:C.muted,marginTop:1}}>
                    {hasData ? `${first.date} → ${last.date} · ${filtered.length} puntos` : "Sin datos aún"}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
                  {hasData&&<div style={{fontSize:12,color:navPos?C.green:C.rose,fontWeight:700}}>{navPos?"＋":""}{navPct}%</div>}
                  <div style={{display:"flex",background:C.surface,borderRadius:8,padding:2,border:`1px solid ${C.border}`}}>
                    {navPeriods.map(p=>(
                      <button key={p.l} onClick={()=>setNavPeriod(p.l)} style={{
                        background:navPeriod===p.l?fund.color+"22":"transparent",
                        color:navPeriod===p.l?fund.color:C.muted,
                        border:navPeriod===p.l?`1px solid ${fund.color}40`:"1px solid transparent",
                        borderRadius:6,padding:"4px 7px",fontSize:10,fontWeight:600,
                        fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",
                      }}>{p.l}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart or empty state */}
              {!hasData ? (
                <div style={{height:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
                  <div style={{fontSize:12,color:C.muted,textAlign:"center",lineHeight:1.6}}>
                    Sin datos de NAV para este periodo.<br/>Actualiza los precios para empezar a acumular.
                  </div>
                  <button onClick={()=>fetchNavHistory(fund)} disabled={navHistLoading}
                    style={{display:"flex",alignItems:"center",gap:5,background:`${fund.color}18`,color:fund.color,border:`1px solid ${fund.color}40`,borderRadius:9,padding:"7px 13px",fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
                    {navHistLoading
                      ? <><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> Buscando...</>
                      : <><IRefresh/> Obtener histórico</>
                    }
                  </button>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <ComposedChart data={filtered} margin={{top:4,right:4,left:-10,bottom:0}}>
                      <defs>
                        <linearGradient id={`navGrad${fund.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={fund.color} stopOpacity={0.25}/>
                          <stop offset="95%" stopColor={fund.color} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
                      <XAxis dataKey="date" tick={{fill:C.muted,fontSize:8}} tickLine={false} axisLine={false}
                        interval="preserveStartEnd"
                        tickFormatter={d=>new Date(d).toLocaleDateString("es-ES",{day:"2-digit",month:"short"})}/>
                      <YAxis tick={{fill:C.muted,fontSize:8}} tickLine={false} axisLine={false}
                        domain={[yMin,yMax]} width={42}
                        tickFormatter={v=>`${v.toFixed(2)}€`}/>
                      <Tooltip
                        content={({active,payload,label})=>{
                          if(!active||!payload?.length) return null;
                          return(
                            <div style={{background:C.card,border:`1px solid ${C.border2}`,borderRadius:9,padding:"8px 12px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                              <div style={{color:C.sub,fontSize:10,marginBottom:3}}>
                                {new Date(label).toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}
                              </div>
                              <div style={{color:fund.color,fontWeight:700,fontSize:13}}>
                                NAV: {(+payload[0].value).toFixed(4)}€
                              </div>
                            </div>
                          );
                        }}/>
                      <Area type="monotone" dataKey="nav" name="NAV"
                        stroke={fund.color} strokeWidth={2.2}
                        fill={`url(#navGrad${fund.id})`}
                        dot={false} activeDot={{r:4,fill:fund.color,stroke:C.bg,strokeWidth:2}}/>
                    </ComposedChart>
                  </ResponsiveContainer>

                  {/* Key stats */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginTop:10}}>
                    {[
                      {l:"NAV inicial", v:`${first.nav.toFixed(4)}€`, c:C.sub},
                      {l:"NAV actual",  v:`${last.nav.toFixed(4)}€`,  c:fund.color},
                      {l:"Variación",   v:`${navPos?"+":""}${navPct}%`, c:navPos?C.green:C.rose},
                    ].map((m,i)=>(
                      <div key={i} style={{background:C.surface,borderRadius:8,padding:"7px 8px",border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>{m.l}</div>
                        <div style={{fontSize:11,fontWeight:700,color:m.c}}>{m.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Fetch more button */}
                  <button onClick={()=>fetchNavHistory(fund)} disabled={navHistLoading}
                    style={{display:"flex",alignItems:"center",gap:4,background:"none",color:C.muted,border:"none",fontSize:9,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:8,padding:0}}>
                    {navHistLoading
                      ? <><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> Actualizando...</>
                      : <><IRefresh/> Actualizar histórico</>
                    }
                  </button>
                </>
              )}
            </div>
          );
        })()}
        {/* Contributions */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"13px",marginBottom:11}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.text}}>Aportaciones</div>
              <div style={{fontSize:9,color:C.muted,marginTop:1}}>{contribRows.length} registradas · {fund.totalInv.toFixed(2)}€ total</div>
            </div>
            <button onClick={openWizard} style={{display:"flex",alignItems:"center",gap:5,background:`${fund.color}20`,color:fund.color,border:`1px solid ${fund.color}40`,borderRadius:9,padding:"7px 11px",fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
              <IPlus/> Nueva
            </button>
          </div>

          {contribRows.length===0&&(
            <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:"16px 0"}}>Sin aportaciones registradas.</div>
          )}
          {contribRows.map((r,i)=>{
            const isExtra=!!(extraC[fund.id]||[]).find(e=>e.date===r.date&&e.aportacion===r.aportacion);
            return(
              <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:11,padding:"10px 12px",marginBottom:7}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:C.text}}>
                      {new Date(r.date).toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}
                    </div>
                    <div style={{fontSize:9,color:C.muted,marginTop:2}}>
                      <span style={{color:fund.color,fontWeight:600}}>{r.aportacion.toFixed(2)}€</span>
                      {r.partic&&<span style={{marginLeft:4}}>{r.partic} partic × {r.nav?.toFixed(4)}€</span>}
                      {" · "}Acum: {r.acumulado.toFixed(2)}€
                    </div>
                  </div>
                  <div style={{textAlign:"right",display:"flex",alignItems:"center",gap:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:800,color:C.text}}>{r.valorHoy.toFixed(2)}€</div>
                      <div style={{fontSize:10,color:r.pos?C.green:C.rose,fontWeight:600}}>
                        {r.pos?"＋":"－"}{Math.abs(r.gain).toFixed(2)}€
                      </div>
                    </div>
                    {isExtra&&(
                      <button onClick={()=>delExtra(fund.id,(extraC[fund.id]||[]).find(e=>e.date===r.date&&e.aportacion===r.aportacion)?.id)}
                        style={{background:"#E88A9912",border:"1px solid #E88A9930",color:C.rose,borderRadius:7,padding:"5px 6px",cursor:"pointer",display:"flex",alignItems:"center"}}>
                        <ITrash/>
                      </button>
                    )}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:`${Math.min(100,Math.abs(r.pct)*5)}%`,height:"100%",background:r.pos?C.green:C.rose,borderRadius:2}}/>
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:r.pos?C.green:C.rose,minWidth:46,textAlign:"right"}}>{r.pos?"＋":""}{r.pct.toFixed(2)}%</div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    );
  };

  /* ── NEWS VIEW ────────────────────────────────────────────── */
  const NewsView=()=>{
    const impactColor = i => i==="positivo"?C.green:i==="negativo"?C.rose:C.amber;
    const impactIcon  = i => i==="positivo"?"▲":i==="negativo"?"▼":"→";
    const fundNames   = Object.fromEntries(FUNDS.map(f=>[f.id, f.shortName]));
    const fundColors  = Object.fromEntries(FUNDS.map(f=>[f.id, f.color]));

    return(
      <div style={{opacity:mounted?1:0,transform:mounted?"none":"translateY(10px)",transition:"all 0.3s"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:C.text}}>Mercados hoy</div>
            <div style={{fontSize:9,color:C.muted,marginTop:1}}>
              {news?.fetchedAt ? `Actualizado ${new Date(news.fetchedAt).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}` : "Cargando..."}
            </div>
          </div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            {speaking && (
              <button onClick={stopSpeak} style={{display:"flex",alignItems:"center",gap:5,background:C.rose+"22",color:C.rose,border:`1px solid ${C.rose}40`,borderRadius:9,padding:"7px 12px",fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
                <IStop/> Parar
              </button>
            )}
            <button onClick={fetchNews} disabled={newsLoading} style={{display:"flex",alignItems:"center",gap:5,background:newsLoading?C.border:`${C.blue}22`,color:newsLoading?C.muted:C.blue,border:`1px solid ${newsLoading?C.border:C.blue+"40"}`,borderRadius:9,padding:"7px 12px",fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:newsLoading?"default":"pointer"}}>
              <IRefresh/> {newsLoading?"...":"Actualizar"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {newsLoading&&!news&&(
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"40px 20px",textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:12}}>🔍</div>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6}}>Buscando noticias...</div>
            <div style={{fontSize:11,color:C.muted}}>Analizando mercados y geopolítica global</div>
            <div style={{marginTop:16,height:3,background:C.border,borderRadius:2,overflow:"hidden"}}>
              <div style={{width:"60%",height:"100%",background:`linear-gradient(90deg,${C.green},${C.blue})`,animation:"pulse 1.5s ease-in-out infinite"}}/>
            </div>
          </div>
        )}

        {/* Error */}
        {newsError&&(
          <div style={{background:`${C.rose}15`,border:`1px solid ${C.rose}30`,borderRadius:14,padding:"16px",marginBottom:12,fontSize:12,color:C.rose}}>
            {newsError}
          </div>
        )}

        {news&&(
          <>
            {/* Titular hero */}
            <div style={{background:`linear-gradient(135deg,${impactColor(news.sentimiento)}18,${C.card})`,border:`1.5px solid ${impactColor(news.sentimiento)}40`,borderRadius:18,padding:"16px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>
                  {new Date(news.fetchedAt).toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}
                </div>
                <span style={{fontSize:10,fontWeight:700,color:impactColor(news.sentimiento),background:impactColor(news.sentimiento)+"22",padding:"2px 8px",borderRadius:6}}>
                  {impactIcon(news.sentimiento)} Mercado {news.sentimiento}
                </span>
              </div>
              <div style={{fontSize:ip?15:13,fontWeight:700,color:C.text,lineHeight:1.4,marginBottom:10}}>{news.titular}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:11,color:C.sub,lineHeight:1.5,flex:1,marginRight:10}}>{news.conclusion}</div>
                <button onClick={()=>speak(`${news.titular}. ${news.conclusion}`, "titular")}
                  style={{background:speakIdx==="titular"?`${C.green}30`:C.surface,color:speakIdx==="titular"?C.green:C.sub,border:`1px solid ${speakIdx==="titular"?C.green+"40":C.border}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontSize:11,flexShrink:0,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>
                  {speakIdx==="titular"?<IStop/>:<IPlay/>}
                  {speakIdx==="titular"?"Parar":"Escuchar"}
                </button>
              </div>
            </div>

            {/* News cards */}
            {(news.noticias||[]).map((n,i)=>(
              <div key={i} style={{background:C.card,border:`1px solid ${impactColor(n.impacto)}28`,borderRadius:16,overflow:"hidden",marginBottom:10}}>

                {/* Image with gradient overlay + title on top */}
                <div style={{position:"relative",height:148,overflow:"hidden"}}>
                    <img
                      src={`https://picsum.photos/seed/${i+1}news/600/300`}
                      alt={n.titular||n.titulo}
                      style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                      onError={e=>{e.target.parentNode.style.display="none";}}
                    />
                    <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(28,34,53,0.15) 0%,rgba(15,17,23,0.92) 100%)"}}/>
                    <div style={{position:"absolute",bottom:10,left:13,right:13,display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:8}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#fff",lineHeight:1.35,flex:1}}>{n.titular||n.titulo}</div>
                      <span style={{fontSize:9,fontWeight:700,color:impactColor(n.impacto),background:"rgba(15,17,23,0.78)",padding:"2px 7px",borderRadius:5,flexShrink:0,border:`1px solid ${impactColor(n.impacto)}40`}}>
                        {impactIcon(n.impacto)} {n.impacto}
                      </span>
                    </div>
                </div>

                {/* Card body */}
                <div style={{padding:"12px 14px 13px"}}>
                  {/* Title shown only as fallback when image fails */}
                  {false&&(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:8}}>
                      <div style={{fontSize:ip?13:12,fontWeight:700,color:C.text,lineHeight:1.3,flex:1}}>{n.titulo}</div>
                      <span style={{fontSize:9,fontWeight:700,color:impactColor(n.impacto),background:impactColor(n.impacto)+"18",padding:"2px 7px",borderRadius:5,flexShrink:0}}>
                        {impactIcon(n.impacto)} {n.impacto}
                      </span>
                    </div>
                  )}

                  {/* Entradilla + cuerpo + Escuchar */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:11}}>
                    <div style={{flex:1}}>
                      {n.entradilla&&<div style={{fontSize:11,fontWeight:700,color:C.text,lineHeight:1.55,marginBottom:5}}>{n.entradilla}</div>}
                      <div style={{fontSize:11,color:C.sub,lineHeight:1.65}}>{n.cuerpo||n.resumen}</div>
                    </div>
                    <button onClick={()=>speak(`${n.titular||n.titulo}. ${n.entradilla||""} ${n.cuerpo||n.resumen}. Impacto en tus fondos: ${Object.entries(n.fondos||{}).map(([k,v])=>`${fundNames[k]}: ${v}`).join(". ")}`, i)}
                      style={{background:speakIdx===i?`${C.green}25`:C.surface,color:speakIdx===i?C.green:C.muted,border:`1px solid ${speakIdx===i?C.green+"40":C.border}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:10,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,flexShrink:0}}>
                      {speakIdx===i?<IStop/>:<IPlay/>}
                      {speakIdx===i?"Parar":"Escuchar"}
                    </button>
                  </div>

                  {/* Fund impact */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:9}}>
                    <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>Impacto en tus fondos</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {Object.entries(n.fondos||{}).map(([key,val])=>(
                        <div key={key} style={{display:"flex",alignItems:"flex-start",gap:7}}>
                          <div style={{width:6,height:6,borderRadius:"50%",background:fundColors[key],flexShrink:0,marginTop:3}}/>
                          <div>
                            <span style={{fontSize:9,fontWeight:700,color:fundColors[key],marginRight:5}}>{fundNames[key]}</span>
                            <span style={{fontSize:10,color:C.sub}}>{val}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div style={{fontSize:9,color:C.muted,textAlign:"center",padding:"8px 0 4px",lineHeight:1.5}}>
              Análisis generado con IA · Solo orientativo, no es asesoramiento financiero
            </div>
          </>
        )}
      </div>
    );
  };

  /* ── HOME VIEW ────────────────────────────────────────────── */
  /* ── WIDGET VIEW ─────────────────────────────────────────── */
  const WidgetView=()=>{
    const best = [...dynFunds].sort((a,b)=>b.rendPct-a.rendPct)[0];
    const worst= [...dynFunds].sort((a,b)=>a.rendPct-b.rendPct)[0];
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"70svh",gap:20}}>
        {/* Main card */}
        <div style={{background:"linear-gradient(135deg,#1C2640,#0F1117)",border:`1.5px solid ${isPos?C.green+"40":C.rose+"40"}`,borderRadius:28,padding:"32px 28px",width:"100%",textAlign:"center",boxShadow:`0 0 40px ${isPos?C.green:C.rose}18`}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:10}}>MyWilly · Cartera total</div>
          <div style={{fontWeight:800,fontSize:48,color:C.text,lineHeight:1,letterSpacing:"-0.03em",marginBottom:8}}>
            {TOTAL_VAL.toFixed(2)}<span style={{fontSize:24,marginLeft:3}}>€</span>
          </div>
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:16,marginBottom:20}}>
            <div style={{fontSize:15,color:isPos?C.green:C.rose,fontWeight:700,background:(isPos?C.green:C.rose)+"18",padding:"4px 14px",borderRadius:8}}>
              {isPos?"▲":"▼"} {Math.abs(TOTAL_GAIN).toFixed(2)}€
            </div>
            <div style={{fontSize:18,color:isPos?C.green:C.rose,fontWeight:800}}>
              {isPos?"+":""}{TOTAL_PCT}%
            </div>
          </div>
          {/* Progress bar */}
          <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden",marginBottom:8}}>
            <div style={{width:`${Math.min(100,Math.abs(TOTAL_PCT)*5)}%`,height:"100%",background:`linear-gradient(90deg,${C.green},${C.blue})`,borderRadius:3,transition:"width 0.5s"}}/>
          </div>
          <div style={{fontSize:10,color:C.muted}}>sobre {TOTAL_INV.toFixed(2)}€ invertidos</div>
        </div>
        {/* Best / Worst */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,width:"100%"}}>
          {[{label:"🏆 Mejor",f:best},{label:"⚠ Peor",f:worst}].map(({label,f},i)=>{
            const pos=f.rendPct>=0;
            return(
              <div key={i} style={{background:C.card,border:`1px solid ${f.color}30`,borderRadius:18,padding:"16px 14px",textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{label}</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:4}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:f.color}}/>
                  <div style={{fontSize:12,fontWeight:700,color:f.color}}>{f.shortName}</div>
                </div>
                <div style={{fontSize:20,fontWeight:800,color:pos?C.green:C.rose}}>{pos?"+":""}{f.rendPct}%</div>
                <div style={{fontSize:11,color:C.sub,marginTop:2}}>{f.valAct.toFixed(2)}€</div>
              </div>
            );
          })}
        </div>
        {/* Last updated */}
        {autoUpdating&&<div style={{fontSize:10,color:C.muted,display:"flex",alignItems:"center",gap:5}}><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Actualizando precios...</div>}
        {navActuals._updatedAt&&!autoUpdating&&(
          <div style={{fontSize:9,color:C.muted}}>Precios actualizados {new Date(navActuals._updatedAt).toLocaleString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
        )}
      </div>
    );
  };

  /* ── FISCAL VIEW ──────────────────────────────────────────── */
  const FiscalView=()=>{
    const [genPDF, setGenPDF] = useState(false);
    const year = new Date().getFullYear();

    // Plusvalías latentes: current mkt - cost basis per fund
    const latentes = dynFunds.map(f=>{
      const susc  = [...(SUSCRIPCIONES[f.id]||[]), ...(extraC[f.id]||[]).map(e=>({inv:e.aportacion,partic:e.partic||0,nav:e.nav||0,date:e.date,mkt:e.mkt||e.aportacion}))];
      const totalInv = susc.reduce((s,x)=>s+(x.inv||0),0);
      const valAct   = navActuals[f.id]||f.valAct||f.valorActual;
      const plusvalia= +(valAct - totalInv).toFixed(2);
      const pct      = totalInv>0?+(plusvalia/totalInv*100).toFixed(2):0;
      return { ...f, totalInv: +totalInv.toFixed(2), valAct: +valAct.toFixed(2), plusvalia, pct, pos: plusvalia>=0 };
    });

    const totalLatentes  = +latentes.reduce((s,f)=>s+f.plusvalia,0).toFixed(2);
    const totalInvGlobal = +latentes.reduce((s,f)=>s+f.totalInv,0).toFixed(2);
    const totalValGlobal = +latentes.reduce((s,f)=>s+f.valAct,0).toFixed(2);

    // Tramos IRPF 2024 (aplica sobre plusvalías realizadas)
    const tramos = [
      { hasta:6000,   tipo:19, label:"Hasta 6.000€" },
      { hasta:50000,  tipo:21, label:"6.000€ – 50.000€" },
      { hasta:200000, tipo:23, label:"50.000€ – 200.000€" },
      { hasta:Infinity,tipo:27,label:"Más de 200.000€" },
    ];
    const calcIRPF = (base) => {
      let tax=0, remaining=base;
      let prev=0;
      for(const t of tramos){
        if(remaining<=0) break;
        const bracket = Math.min(remaining, t.hasta-prev);
        tax += bracket*(t.tipo/100);
        remaining -= bracket; prev=t.hasta;
      }
      return +tax.toFixed(2);
    };
    const irpfEstimado = calcIRPF(Math.max(0, totalLatentes));

    const downloadPDF = () => {
      setGenPDF(true);
      const rows = latentes.map(f=>`
        <tr>
          <td>${f.name}</td><td>${f.isin}</td>
          <td>${f.totalInv.toFixed(2)}€</td>
          <td>${f.valAct.toFixed(2)}€</td>
          <td style="color:${f.pos?"#2e7d32":"#c62828"}">${f.pos?"+":""}${f.plusvalia.toFixed(2)}€</td>
          <td style="color:${f.pos?"#2e7d32":"#c62828"}">${f.pos?"+":""}${f.pct}%</td>
        </tr>`).join("");
      const suscRows = Object.entries(SUSCRIPCIONES).flatMap(([fid,susc])=>
        susc.map(s=>{
          const f=DEFAULT_FUNDS.find(f=>f.id===fid);
          return `<tr><td>${f?.shortName||fid}</td><td>${s.date}</td><td>${s.partic}</td><td>${s.nav.toFixed(4)}€</td><td>${s.inv.toFixed(2)}€</td><td>${s.mkt.toFixed(2)}€</td><td style="color:${s.mkt>=s.inv?"#2e7d32":"#c62828"}">${(s.mkt-s.inv>=0?"+":"")}${(s.mkt-s.inv).toFixed(2)}€</td></tr>`;
        })
      ).join("");
      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <title>MyWilly — Resumen Fiscal ${year}</title>
        <style>
          body{font-family:Arial,sans-serif;color:#1a1a2e;padding:30px;max-width:900px;margin:0 auto;font-size:13px}
          h1{color:#1C2640;border-bottom:3px solid #72DFA8;padding-bottom:10px}
          h2{color:#1C2640;margin-top:28px;font-size:15px}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          th{background:#1C2640;color:white;padding:8px 10px;text-align:left;font-size:12px}
          td{padding:7px 10px;border-bottom:1px solid #e0e0e0;font-size:12px}
          tr:nth-child(even){background:#f8f9ff}
          .box{background:#f0f4ff;border-left:4px solid #72DFA8;padding:12px 16px;margin:16px 0;border-radius:4px}
          .warn{background:#fff8e1;border-left:4px solid #f9a825;padding:10px 14px;margin:16px 0;border-radius:4px;font-size:11px}
          .total{font-weight:bold;background:#e8f5e9}
        </style>
      </head><body>
        <h1>📊 MyWilly — Resumen Fiscal ${year}</h1>
        <p>Generado el ${new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>

        <h2>1. Resumen de plusvalías latentes (no realizadas)</h2>
        <div class="box">
          <strong>Total invertido:</strong> ${totalInvGlobal.toFixed(2)}€ &nbsp;|&nbsp;
          <strong>Valor actual:</strong> ${totalValGlobal.toFixed(2)}€ &nbsp;|&nbsp;
          <strong>Plusvalía latente:</strong> <span style="color:${totalLatentes>=0?"#2e7d32":"#c62828"}">${totalLatentes>=0?"+":""}${totalLatentes.toFixed(2)}€</span>
        </div>
        <table>
          <thead><tr><th>Fondo</th><th>ISIN</th><th>Invertido</th><th>Valor actual</th><th>Plusvalía</th><th>%</th></tr></thead>
          <tbody>${rows}<tr class="total"><td colspan="2"><strong>TOTAL</strong></td><td><strong>${totalInvGlobal.toFixed(2)}€</strong></td><td><strong>${totalValGlobal.toFixed(2)}€</strong></td><td style="color:${totalLatentes>=0?"#2e7d32":"#c62828"}"><strong>${totalLatentes>=0?"+":""}${totalLatentes.toFixed(2)}€</strong></td><td></td></tr></tbody>
        </table>

        <h2>2. Plusvalías realizadas</h2>
        <div class="box">No se han registrado ventas o traspasos de fondos en el periodo analizado. Solo se registran plusvalías latentes sobre posiciones activas.</div>

        <h2>3. Detalle de suscripciones activas (FIFOs)</h2>
        <table>
          <thead><tr><th>Fondo</th><th>Fecha</th><th>Participaciones</th><th>NAV compra</th><th>Invertido</th><th>Valor actual</th><th>Resultado</th></tr></thead>
          <tbody>${suscRows}</tbody>
        </table>

        <h2>4. Estimación IRPF sobre plusvalías (si se realizasen hoy)</h2>
        <table>
          <thead><tr><th>Tramo</th><th>Tipo</th><th>Base imponible tramo</th><th>Cuota estimada</th></tr></thead>
          <tbody>
            ${tramos.map(t=>`<tr><td>${t.label}</td><td>${t.tipo}%</td><td>—</td><td>—</td></tr>`).join("")}
            <tr class="total"><td colspan="3"><strong>Cuota total estimada sobre ${totalLatentes.toFixed(2)}€</strong></td><td><strong>${irpfEstimado.toFixed(2)}€</strong></td></tr>
          </tbody>
        </table>

        <div class="warn">⚠️ Este documento es orientativo y no constituye asesoramiento fiscal. Consulta con un asesor fiscal para la declaración de la renta. Los datos FIFO se basan en las suscripciones registradas en MyWilly. Las plusvalías latentes solo tributan cuando se realicen (venta o traspaso).</div>
      </body></html>`;
      const blob = new Blob([html],{type:"text/html"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href=url; a.download=`MyWilly_Fiscal_${year}.html`;
      a.click(); URL.revokeObjectURL(url);
      setTimeout(()=>setGenPDF(false),1000);
    };

    return(
      <div style={{opacity:mounted?1:0,transform:mounted?"none":"translateY(10px)",transition:"all 0.3s"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:C.text,marginBottom:2}}>Resumen fiscal {year}</div>
            <div style={{fontSize:10,color:C.muted}}>Método FIFO · Euros · IRPF España</div>
          </div>
          <button onClick={downloadPDF} style={{display:"flex",alignItems:"center",gap:6,background:`${C.green}22`,color:C.green,border:`1px solid ${C.green}40`,borderRadius:10,padding:"8px 13px",fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
            <IDownload/> {genPDF?"Generando...":"Descargar PDF"}
          </button>
        </div>

        {/* Global summary */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
          {[
            {l:"Total invertido",   v:`${totalInvGlobal.toFixed(2)}€`,  c:C.sub},
            {l:"Valor actual",      v:`${totalValGlobal.toFixed(2)}€`,  c:C.blue},
            {l:"Plusvalía latente", v:`${totalLatentes>=0?"+":""}${totalLatentes.toFixed(2)}€`, c:totalLatentes>=0?C.green:C.rose},
          ].map((m,i)=>(
            <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:11,padding:"10px"}}>
              <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{m.l}</div>
              <div style={{fontWeight:800,fontSize:13,color:m.c}}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Latentes per fund */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"13px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:12}}>Plusvalías latentes por fondo</div>
          {latentes.map((f,i)=>(
            <div key={f.id} style={{padding:"10px 0",borderBottom:i<latentes.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:f.color}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:C.text}}>{f.shortName}</div>
                    <div style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{f.isin}</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:800,color:f.pos?C.green:C.rose}}>{f.pos?"＋":"－"}{Math.abs(f.plusvalia).toFixed(2)}€</div>
                  <div style={{fontSize:10,color:f.pos?C.green:C.rose}}>{f.pos?"+":""}{f.pct}%</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <div style={{flex:1,background:C.surface,borderRadius:7,padding:"5px 8px"}}>
                  <div style={{fontSize:8,color:C.muted}}>Coste base</div>
                  <div style={{fontSize:11,fontWeight:600,color:C.sub}}>{f.totalInv.toFixed(2)}€</div>
                </div>
                <div style={{flex:1,background:C.surface,borderRadius:7,padding:"5px 8px"}}>
                  <div style={{fontSize:8,color:C.muted}}>Valor hoy</div>
                  <div style={{fontSize:11,fontWeight:600,color:f.color}}>{f.valAct.toFixed(2)}€</div>
                </div>
                <div style={{flex:1,background:C.surface,borderRadius:7,padding:"5px 8px"}}>
                  <div style={{fontSize:8,color:C.muted}}>IRPF est.</div>
                  <div style={{fontSize:11,fontWeight:600,color:C.amber}}>{calcIRPF(Math.max(0,f.plusvalia)).toFixed(2)}€</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* IRPF summary */}
        <div style={{background:`${C.amber}12`,border:`1px solid ${C.amber}30`,borderRadius:16,padding:"13px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.amber,marginBottom:10}}>Estimación IRPF si vendieses hoy</div>
          {tramos.map((t,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:10,color:C.sub}}>
              <span>{t.label}</span><span style={{color:C.amber,fontWeight:600}}>{t.tipo}%</span>
            </div>
          ))}
          <div style={{borderTop:`1px solid ${C.amber}30`,marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:12,fontWeight:700,color:C.text}}>Cuota estimada total</span>
            <span style={{fontSize:14,fontWeight:800,color:C.amber}}>{irpfEstimado.toFixed(2)}€</span>
          </div>
        </div>

        <div style={{fontSize:9,color:C.muted,lineHeight:1.5,textAlign:"center",padding:"4px 8px"}}>
          Las plusvalías latentes no tributan hasta que se realicen. Solo orientativo — consulta con un asesor fiscal.
        </div>
      </div>
    );
  };

  const HomeView=()=>(
    <div style={{opacity:mounted?1:0,transform:mounted?"none":"translateY(10px)",transition:"all 0.3s"}}>
      <div style={{background:"linear-gradient(135deg,#1C2640,#1A2830)",border:`1px solid ${C.border}`,borderRadius:18,padding:"16px",marginBottom:11}}>
        <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5}}>Cartera total</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:13}}>
          <div>
            <div style={{fontWeight:800,fontSize:30,color:C.text,lineHeight:1,letterSpacing:"-0.02em"}}>{TOTAL_VAL.toFixed(2)}<span style={{fontSize:17,marginLeft:2}}>€</span></div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
              <span style={{fontSize:11,color:isPos?C.green:C.rose,fontWeight:700,background:(isPos?C.green:C.rose)+"18",padding:"2px 8px",borderRadius:5}}>
                {isPos?"▲":"▼"} {Math.abs(TOTAL_GAIN).toFixed(2)}€
              </span>
              <span style={{fontSize:11,color:isPos?C.green:C.rose,fontWeight:600}}>{isPos?"+":""}{TOTAL_PCT}%</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:"0.08em",marginBottom:1}}>INVERTIDO</div>
            <div style={{fontSize:15,fontWeight:700,color:C.sub}}>{TOTAL_INV.toFixed(2)}€</div>
          </div>
        </div>
        <div style={{display:"flex",height:6,borderRadius:3,overflow:"hidden",gap:1,marginBottom:8}}>
          {DIST.map((d,i)=><div key={i} style={{flex:Math.max(d.pct/100,0.02),background:d.color}}/>)}
        </div>
        <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
          {DIST.map((d,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:3}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:d.color}}/>
              <span style={{fontSize:9,color:C.sub}}>{d.name} <span style={{color:d.color}}>{d.pct}%</span></span>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:11}}>
        {[
          {l:"Rentab. total",v:`${isPos?"+":""}${TOTAL_PCT}%`,c:isPos?C.green:C.rose},
          {l:"Ganancia neta",v:`${isPos?"＋":"－"}${Math.abs(TOTAL_GAIN).toFixed(2)}€`,c:isPos?C.green:C.rose},
          {l:"Fondos",v:`${FUNDS.length} activos`,c:C.blue},
        ].map((m,i)=>(
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:11,padding:"9px 10px"}}>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{m.l}</div>
            <div style={{fontWeight:800,fontSize:14,color:m.c,lineHeight:1}}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* ── Price updater ── */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"13px 14px",marginBottom:11}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom: pricesResult||pricesError ? 12 : 0}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>Actualizar precios</div>
            <div style={{fontSize:9,color:C.muted,marginTop:1}}>
              {pricesResult ? `Actualizado ${new Date(pricesResult.updatedAt).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})} · ${pricesResult.fecha}` : "Obtiene el NAV actual de cada fondo"}
            </div>
          </div>
          <button onClick={fetchPrices} disabled={pricesLoading} style={{
            display:"flex",alignItems:"center",gap:6,
            background:pricesLoading?C.border:`linear-gradient(135deg,${C.green}22,${C.blue}22)`,
            color:pricesLoading?C.muted:C.green,
            border:`1px solid ${pricesLoading?C.border:C.green+"40"}`,
            borderRadius:10,padding:"8px 14px",fontSize:11,fontWeight:700,
            fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:pricesLoading?"default":"pointer",
            transition:"all 0.15s",
          }}>
            {pricesLoading
              ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite",fontSize:13}}>⟳</span> Buscando...</>
              : <><IRefresh/> {pricesResult?"Actualizar":"Obtener precios"}</>
            }
          </button>
        </div>

        {/* Error */}
        {pricesError && (
          <div style={{fontSize:11,color:C.rose,background:`${C.rose}15`,border:`1px solid ${C.rose}30`,borderRadius:9,padding:"8px 11px"}}>
            {pricesError}
          </div>
        )}

        {/* Results */}
        {pricesResult && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {pricesResult.fondos.map(f => {
              const fund = dynFunds.find(d => d.id === f.id);
              if (!fund) return null;
              const prev = fund.valAct;
              const diff = +(f.valAct - prev).toFixed(2);
              const pos  = diff >= 0;
              return (
                <div key={f.id} style={{background:C.surface,border:`1px solid ${fund.color}30`,borderRadius:10,padding:"9px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:fund.color}}/>
                    <div style={{fontSize:10,fontWeight:700,color:fund.color}}>{fund.shortName}</div>
                  </div>
                  <div style={{fontSize:13,fontWeight:800,color:C.text}}>{f.valAct.toFixed(2)}€</div>
                  <div style={{fontSize:9,color:pos?C.green:C.rose,marginTop:2}}>
                    {pos?"＋":"－"}{Math.abs(diff).toFixed(2)}€ vs anterior
                  </div>
                  <div style={{fontSize:8,color:C.muted,marginTop:2}}>NAV {f.nav} · {f.fuente}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={openWizard} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:`linear-gradient(135deg,${C.green}22,${C.blue}22)`,color:C.green,border:`1px solid ${C.green}40`,borderRadius:14,padding:"12px",fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",marginBottom:11}}>
        <IPlus/> Nueva aportación
      </button>

      {dynFunds.map((f,i)=>{
        const pos=f.rendPct>=0;
        return(
          <div key={f.id} onClick={()=>{setSelIdx(i);setTab("funds");}}
            style={{background:C.card,border:`1px solid ${f.color}30`,borderRadius:16,padding:"13px 14px",marginBottom:9,cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{flex:1,minWidth:0,marginRight:10}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:f.color}}/>
                  <span style={{fontSize:9,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{f.type}</span>
                  <span style={{fontSize:9,color:f.color,fontWeight:600}}>{DIST.find(d=>d.name===f.shortName)?.pct||0}% cartera</span>
                </div>
                <div style={{fontSize:ip?13:12,fontWeight:700,color:C.text,lineHeight:1.3}}>{f.name}</div>
                <div style={{fontSize:9,color:C.muted,marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>{f.isin}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:ip?18:16,fontWeight:800,color:C.text,lineHeight:1}}>{f.valAct.toFixed(2)}€</div>
                <div style={{fontSize:11,color:pos?C.green:C.rose,marginTop:2,fontWeight:600}}>{pos?"＋":"－"}{Math.abs(f.gain).toFixed(2)}€ ({pos?"+":""}{f.rendPct}%)</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:9}}>
              {[{l:"Invertido",v:`${f.totalInv.toFixed(2)}€`},{l:"Valor",v:`${f.valAct.toFixed(2)}€`},{l:"Ganancia",v:`${pos?"＋":"－"}${Math.abs(f.gain).toFixed(2)}€`},{l:"Aport.",v:`${BASE_DATA[f.id].filter(r=>r.aportacion>0).length+(extraC[f.id]||[]).length}`}].map((m,j)=>(
                <div key={j} style={{background:C.surface,borderRadius:7,padding:"6px 7px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>{m.l}</div>
                  <div style={{fontWeight:700,fontSize:10,color:f.color}}>{m.v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                <div style={{width:`${Math.min(100,Math.abs(f.rendPct)*5)}%`,height:"100%",background:pos?f.color:C.rose,borderRadius:2}}/>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:pos?C.green:C.rose,minWidth:46,textAlign:"right"}}>{pos?"+":""}{f.rendPct}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ── CONFIRM DELETE MODAL ────────────────────────────────────── */
  const ConfirmDeleteModal = () => {
    if (!confirmDelete) return null;
    const f = confirmDelete;
    const doDelete = () => {
      if (customFunds.some(cf => cf.id === f.id)) {
        setCustomFunds(p => p.filter(cf => cf.id !== f.id));
      } else {
        setCustomFunds(p => {
          const already = p.find(cf => cf.id === f.id);
          if (already) return p.map(cf => cf.id===f.id ? {...cf,_hidden:true} : cf);
          return [...p, {...DEFAULT_FUNDS.find(df=>df.id===f.id), _hidden:true}];
        });
      }
      setExtraC(p    => { const n={...p};    delete n[f.id]; return n; });
      setNavActuals(p => { const n={...p};   delete n[f.id]; return n; });
      setSelIdx(0);
      setConfirmDelete(null);
    };
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(7,8,15,0.88)",backdropFilter:"blur(8px)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
        <div style={{background:C.surface,border:`1px solid ${C.rose}40`,borderRadius:20,padding:"24px 20px",width:"100%",maxWidth:360}}>
          <div style={{width:40,height:40,borderRadius:"50%",background:`${C.rose}20`,border:`1.5px solid ${C.rose}40`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
            <ITrash/>
          </div>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:6}}>
              Eliminar fondo
            </div>
            <div style={{fontSize:12,color:C.sub,lineHeight:1.5}}>
              Vas a eliminar <span style={{color:f.color,fontWeight:700}}>{f.shortName}</span> y todas sus aportaciones. Esta acción no se puede deshacer.
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmDelete(null)} style={{
              flex:1,padding:"12px",background:C.card,color:C.sub,
              border:`1px solid ${C.border}`,borderRadius:11,fontSize:13,fontWeight:600,
              fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",
            }}>Cancelar</button>
            <button onClick={doDelete} style={{
              flex:1,padding:"12px",background:`linear-gradient(135deg,${C.rose},#c0392b)`,
              color:"#fff",border:"none",borderRadius:11,fontSize:13,fontWeight:800,
              fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",
            }}>Eliminar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ── ADD FUND MODAL ──────────────────────────────────────────── */
  const AddFundModal = () => {
    if (!addFundModal) return null;
    const valid = newFund.name.trim() && newFund.isin.trim().length >= 12 && newFund.shortName.trim();
    const save = () => {
      if (!valid) return;
      const id = `fund_${Date.now()}`;
      const created = {
        id,
        name:        newFund.name.trim(),
        shortName:   newFund.shortName.trim(),
        isin:        newFund.isin.trim().toUpperCase(),
        type:        newFund.type,
        color:       newFund.color,
        annualReturn:0,
        totalInv:    0,
        valorActual: 0,
        rendPct:     0,
      };
      setCustomFunds(p => [...p, created]);
      setSelIdx(DEFAULT_FUNDS.length + customFunds.length); // select new fund
      setNewFund({name:"",shortName:"",isin:"",type:"Fondo Indexado",color:PAL[4]});
      setAddFundModal(false);
    };
    const inp = {background:C.card,border:`1px solid ${C.border}`,color:C.text,padding:"11px 13px",borderRadius:10,fontSize:15,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",width:"100%"};
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(7,8,15,0.88)",backdropFilter:"blur(8px)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
        onClick={()=>setAddFundModal(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"22px 22px 0 0",width:"100%",maxWidth:ip?820:430,maxHeight:"90svh",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"16px 18px 0",flexShrink:0}}>
            <div style={{width:32,height:4,background:C.border2,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:15,color:C.text}}>Añadir nuevo fondo</div>
              <button onClick={()=>setAddFundModal(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><IClose/></button>
            </div>
          </div>
          <div style={{overflowY:"auto",padding:"0 18px 40px",flex:1,display:"flex",flexDirection:"column",gap:12}}>

            {/* Name */}
            <div>
              <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>Nombre completo *</div>
              <input type="text" placeholder="Ej: Vanguard S&P 500 UCITS ETF"
                value={newFund.name} onChange={e=>setNewFund(p=>({...p,name:e.target.value}))} style={inp}/>
            </div>

            {/* Short name */}
            <div>
              <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>Nombre corto *</div>
              <input type="text" placeholder="Ej: S&P 500" maxLength={12}
                value={newFund.shortName} onChange={e=>setNewFund(p=>({...p,shortName:e.target.value}))} style={inp}/>
              <div style={{fontSize:9,color:C.muted,marginTop:3}}>Máximo 12 caracteres — aparece en los tabs</div>
            </div>

            {/* ISIN */}
            <div>
              <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>ISIN *</div>
              <input type="text" placeholder="Ej: IE00B3XXRP09" maxLength={12}
                value={newFund.isin} onChange={e=>setNewFund(p=>({...p,isin:e.target.value.toUpperCase()}))}
                style={{...inp,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em"}}/>
              <div style={{fontSize:9,color:C.muted,marginTop:3}}>12 caracteres — lo encontrarás en MyInvestor o Morningstar</div>
            </div>

            {/* Type */}
            <div>
              <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>Tipo de fondo</div>
              <select value={newFund.type} onChange={e=>setNewFund(p=>({...p,type:e.target.value}))}
                style={{...inp,appearance:"none",cursor:"pointer"}}>
                {FUND_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Color */}
            <div>
              <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Color</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {PAL.map((c,i)=>(
                  <button key={i} onClick={()=>setNewFund(p=>({...p,color:c}))}
                    style={{width:32,height:32,borderRadius:"50%",background:c,border:`3px solid ${newFund.color===c?"white":c}`,cursor:"pointer",transition:"border 0.15s"}}/>
                ))}
              </div>
            </div>

            {/* Preview */}
            {newFund.shortName && (
              <div style={{background:C.card,border:`1px solid ${newFund.color}40`,borderRadius:12,padding:"10px 13px",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:newFund.color}}/>
                <div style={{fontSize:12,fontWeight:700,color:newFund.color}}>{newFund.shortName}</div>
                <div style={{fontSize:10,color:C.muted,marginLeft:4}}>{newFund.type}</div>
                {newFund.isin && <div style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginLeft:"auto"}}>{newFund.isin}</div>}
              </div>
            )}

            <button onClick={save} style={{
              padding:"13px",marginTop:4,
              background:valid?`linear-gradient(135deg,${newFund.color},${C.blue})`:C.border,
              color:valid?"#0F1117":C.muted,
              border:"none",borderRadius:12,fontSize:14,fontWeight:800,
              fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:valid?"pointer":"default",transition:"all 0.15s",
            }}>
              Añadir fondo
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ── WIZARD ENTRY — stable subcomponent to prevent keyboard dismiss ── */
  /* WizardEntry — two fields: importe + precio por participación (NAV).
     NAV is pre-filled from the last price fetch but fully editable.
     Participaciones are calculated live as the user types. */
  const WizardEntry = React.memo(({id, color, shortName, navHoy, onSave}) => {
    const [aportacion, setAportacion] = useState("");
    const [navInput,   setNavInput]   = useState(navHoy > 0 ? navHoy.toFixed(4) : "");

    const nav    = parseFloat(navInput);
    const inv    = parseFloat(aportacion);
    const partic = (nav > 0 && inv > 0) ? (inv / nav).toFixed(4) : null;

    const inpStyle = (active) => ({
      background:  C.surface,
      color:       C.text,
      padding:     "12px 13px",
      borderRadius:11,
      fontSize:    16,
      fontWeight:  600,
      fontFamily:  "'Plus Jakarta Sans',sans-serif",
      outline:     "none",
      width:       "100%",
      border:      `1.5px solid ${active ? color+"70" : C.border}`,
      transition:  "border 0.15s",
    });

    const update = (newInv, newNav) => {
      onSave(id, { aportacion: newInv, nav: newNav });
    };

    return (
      <div style={{
        background:   C.card,
        border:       `1.5px solid ${color}50`,
        borderRadius: 14,
        padding:      "14px",
        marginBottom: 10,
      }}>
        {/* Fund header */}
        <div style={{display:"flex", alignItems:"center", gap:7, marginBottom:13}}>
          <div style={{width:8, height:8, borderRadius:"50%", background:color, flexShrink:0}}/>
          <div style={{fontWeight:700, fontSize:13, color}}>{shortName}</div>
          {partic && (
            <div style={{
              marginLeft:"auto", fontSize:9, fontWeight:600,
              color, background:`${color}18`,
              border:`1px solid ${color}30`,
              borderRadius:6, padding:"2px 8px",
            }}>
              ≈ {partic} partic.
            </div>
          )}
        </div>

        {/* Two fields side by side */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
          {/* Importe */}
          <div>
            <div style={{fontSize:9, color:C.sub, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5}}>
              Importe (€) *
            </div>
            <input
              type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
              value={aportacion}
              onChange={e => { setAportacion(e.target.value); update(e.target.value, navInput); }}
              style={inpStyle(inv > 0)}/>
          </div>

          {/* Precio por participación */}
          <div>
            <div style={{fontSize:9, color:C.sub, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5}}>
              Precio / partic. (€)
            </div>
            <input
              type="number" inputMode="decimal" min="0" step="0.0001" placeholder="0.0000"
              value={navInput}
              onChange={e => { setNavInput(e.target.value); update(aportacion, e.target.value); }}
              style={inpStyle(nav > 0)}/>
            <div style={{fontSize:8, color: navHoy > 0 ? C.green : C.amber, marginTop:3}}>
              {navHoy > 0 ? "✓ Precio de la API" : "⚠ Introduce el precio manualmente"}
            </div>
          </div>
        </div>
      </div>
    );
  });

  /* ── WIZARD ───────────────────────────────────────────────── */
  const Wizard=()=>{
    if(modal!=="wizard") return null;
    const canNext=wizDate&&wizSelected.length>0;
    const canSave=wizSelected.length>0&&wizSelected.every(id=>parseFloat(wizEntries[id]?.aportacion)>0);
    const inp={background:C.card,border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",borderRadius:10,fontSize:14,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",width:"100%"};

    const handleEntryChange=(id, vals)=>{
      setWizEntries(p=>({...p,[id]:{...(p[id]||{}), ...vals}}));
    };

    return(
      <div style={{position:"fixed",inset:0,background:"rgba(7,8,15,0.88)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setModal(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"22px 22px 0 0",width:"100%",maxWidth:ip?820:430,maxHeight:"92svh",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"16px 18px 0",flexShrink:0}}>
            <div style={{width:32,height:4,background:C.border2,borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:15,color:C.text}}>Nueva aportación · Paso {wizStep}/2</div>
              <button onClick={()=>setModal(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><IClose/></button>
            </div>
            <div style={{height:3,background:C.border,borderRadius:2,marginBottom:16,overflow:"hidden"}}>
              <div style={{width:wizStep===1?"50%":"100%",height:"100%",background:`linear-gradient(90deg,${C.green},${C.blue})`,transition:"width 0.3s"}}/>
            </div>
          </div>
          <div style={{overflowY:"auto",padding:"0 18px 40px",flex:1}}>
            {wizStep===1&&(
              <>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Fecha de la aportación</div>
                  <input type="date" value={wizDate} onChange={e=>setWizDate(e.target.value)} style={{...inp,colorScheme:"dark"}}/>
                </div>
                <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>¿En qué fondos aportas?</div>
                {FUNDS.map(f=>{
                  const sel=wizSelected.includes(f.id);
                  const dFund=dynFunds.find(d=>d.id===f.id);
                  return(
                    <div key={f.id} onClick={()=>toggleFund(f.id)}
                      style={{background:sel?`${f.color}15`:C.card,border:`1.5px solid ${sel?f.color+"60":C.border}`,borderRadius:13,padding:"12px 14px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all 0.15s"}}>
                      <div style={{width:16,height:16,borderRadius:5,background:sel?f.color:C.surface,border:`2px solid ${sel?f.color:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {sel&&<ICheck/>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:sel?f.color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                        <div style={{fontSize:9,color:C.muted,marginTop:2}}>Valor actual: {dFund?.valAct.toFixed(2)||"—"}€ · {dFund?.rendPct>=0?"＋":""}{dFund?.rendPct}%</div>
                      </div>
                      <div style={{width:8,height:8,borderRadius:"50%",background:f.color}}/>
                    </div>
                  );
                })}
                <button onClick={wizNext} style={{width:"100%",padding:"13px",background:canNext?`linear-gradient(135deg,${C.green},${C.blue})`:C.border,color:canNext?"#0F1117":C.muted,border:"none",borderRadius:12,fontSize:14,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:canNext?"pointer":"default",transition:"all 0.15s",marginTop:8}}>
                  Siguiente →
                </button>
              </>
            )}
            {wizStep===2&&(
              <>
                <div style={{fontSize:10,color:C.muted,marginBottom:14}}>
                  Fecha: <span style={{color:C.text,fontWeight:600}}>{new Date(wizDate).toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}</span>
                </div>
                {/* Only selected funds, just the amount */}
                {wizSelected.map(id=>{
                  const f     = FUNDS.find(f=>f.id===id);
                  const susc  = SUSCRIPCIONES[id]||[];
                  const totalP= susc.reduce((s,x)=>s+x.partic,0);
                  const dFund = dynFunds.find(d=>d.id===id);
                  const valAct= navActuals[id] ? parseFloat(navActuals[id]) : dFund?.valAct||0;
                  const navHoy= totalP>0 ? valAct/totalP : 0;
                  return(
                    <WizardEntry
                      key={id} id={id} color={f.color} shortName={f.shortName}
                      navHoy={navHoy} onSave={handleEntryChange}/>
                  );
                })}
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <button onClick={()=>setWizStep(1)} style={{flex:1,padding:"12px",background:C.surface,color:C.sub,border:`1px solid ${C.border}`,borderRadius:12,fontSize:13,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>← Atrás</button>
                  <button onClick={wizSave} style={{flex:2,padding:"12px",background:canSave?`linear-gradient(135deg,${C.green},${C.blue})`:C.border,color:canSave?"#0F1117":C.muted,border:"none",borderRadius:12,fontSize:14,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:canSave?"pointer":"default",transition:"all 0.15s"}}>
                    Guardar aportación
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ── RENDER ───────────────────────────────────────────────── */
  return(
    <>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      {/* Theme color: makes iOS/Android status bar match app background */}
      <meta name="theme-color" content="#0F1117"/>
      <meta name="apple-mobile-web-app-capable" content="yes"/>
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{
          background:#0F1117;
          -webkit-font-smoothing:antialiased;
          /* Fill top status bar and bottom home indicator with app color */
          background-color:#0F1117;
        }
        /* Prevent iOS zoom on input focus — font-size must be >= 16px */
        input, select, textarea {
          font-size: 16px !important;
          -webkit-text-size-adjust: 100%;
        }
        input:focus{border-color:#72DFA8!important;outline:none}
        input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.6)}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#262D45;border-radius:2px}
        ::-webkit-scrollbar-horizontal{height:3px}
        @keyframes pulse{0%,100%{opacity:1;width:60%}50%{opacity:0.6;width:80%}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>
      <div style={{minHeight:"100svh",background:C.bg,fontFamily:"'Plus Jakarta Sans',sans-serif",color:C.text,maxWidth:ip?820:430,margin:"0 auto",display:"flex",flexDirection:"column",paddingTop:"env(safe-area-inset-top, 0px)"}}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:ip?"13px 22px 11px":"11px 14px 9px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.bg,zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Logo size={ip?50:44}/>
            <div style={{fontSize:9,color:C.muted}}>Panel de inversiones</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Cartera</div>
            <div style={{fontWeight:800,fontSize:ip?16:14,color:isPos?C.green:C.rose,lineHeight:1.1}}>{TOTAL_VAL.toFixed(2)}€</div>
            <div style={{fontSize:9,color:isPos?C.green:C.rose,marginTop:1}}>{isPos?"＋":""}{TOTAL_PCT}%</div>
          </div>
        </div>

        {/* CONTENT */}
        <div style={{flex:1,overflowY:"auto",padding:ip?"18px 22px 120px":`13px 13px calc(115px + env(safe-area-inset-bottom, 0px))`}}>
          {tab==="home"    &&<HomeView/>}
          {tab==="funds"   &&<FundView/>}
          {tab==="news"    &&<NewsView/>}
          {tab==="fiscal"  &&<FiscalView/>}
          {tab==="widget"  &&<WidgetView/>}
        </div>

        {/* NAV — two rows, 3 tabs each — fixed, never scrolls */}
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:ip?820:430,background:C.surface,borderTop:`1px solid ${C.border}`,zIndex:100,paddingBottom:`env(safe-area-inset-bottom, 0px)`}}>
          {[
            [{id:"home",label:"Resumen",icon:<IHome/>},{id:"funds",label:"Mis fondos",icon:<IFunds/>}],
            [{id:"fiscal",label:"Fiscal",icon:<ITax/>},{id:"widget",label:"Widget",icon:<IWidget/>},{id:"news",label:"Noticias",icon:<INews/>}],
          ].map((row,ri)=>(
            <div key={ri} style={{display:"flex",justifyContent:"space-around",padding:ri===1?`4px 0 8px`:`6px 0 2px`}}>
              {row.map(n=>(
                <button key={n.id} onClick={()=>setTab(n.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===n.id?C.green:C.muted,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:9,fontWeight:600,padding:"3px 16px",transition:"color 0.16s",flex:1}}>
                  {n.icon}<span>{n.label}</span>
                </button>
              ))}
            </div>
          ))}
          {/* Divider centered exactly between the two rows */}
          <div style={{position:"absolute",top:"50%",transform:"translateY(-50%)",left:"5%",right:"5%",height:"1px",background:C.border,opacity:0.6}}/>
        </div>
        <Wizard/>
        <AddFundModal/>
        <ConfirmDeleteModal/>
      </div>
    </>
  );
}
