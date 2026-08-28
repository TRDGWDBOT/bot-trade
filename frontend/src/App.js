import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const API_KEY = process.env.REACT_APP_API_KEY || "";

const axiosInstance = axios.create({
  headers: API_KEY ? { "X-API-Key": API_KEY } : {},
});

function fmt(v, d = 2) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  if (v === 0) return "0.00";
  return v.toFixed(d);
}

function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  if (v === 0) return "0.0%";
  return v.toFixed(1) + "%";
}

function useInterval(fn, ms) {
  const ref = useRef();
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function App() {
  const [s, setS] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [confirmAction, setConfirmAction] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [orderLock, setOrderLock] = useState(false);

  // Config
  const [token, setToken] = useState("");
  const [appId, setAppId] = useState("1089");
  const [env, setEnv] = useState("demo");
  const [activeSymbol, setActiveSymbol] = useState("");
  const [strategy, setStrategy] = useState("");

  // Auto settings
  const [autoStake, setAutoStake] = useState(1.0);
  const [autoMultiplier, setAutoMultiplier] = useState(100);
  const [maxPositions, setMaxPositions] = useState(3);
  const [autoMultiSymbol, setAutoMultiSymbol] = useState(true);
  const [autoTpPct, setAutoTpPct] = useState(20);
  const [autoSlPct, setAutoSlPct] = useState(10);
  const [trailAct, setTrailAct] = useState(40);
  const [trailGive, setTrailGive] = useState(20);
  const [earlyCut, setEarlyCut] = useState(40);
  const [earlyConfirm, setEarlyConfirm] = useState(3);
  const [minVolIdx, setMinVolIdx] = useState(0.6);

  // Backtest settings (nuovo pannello dedicato)
  const [btSymbol, setBtSymbol] = useState("");
  const [btStrategies, setBtStrategies] = useState([]);
  const [btGranularity, setBtGranularity] = useState(60);
  const [btCount, setBtCount] = useState(5000);
  const [btConfirm, setBtConfirm] = useState("");
  const [btTpPct, setBtTpPct] = useState(20);
  const [btSlPct, setBtSlPct] = useState(10);
  const [btMultiplier, setBtMultiplier] = useState(100);
  const [btStake, setBtStake] = useState(1.0);
  const [btMinVol, setBtMinVol] = useState(0.6);
  const [btRunning, setBtRunning] = useState(false);
  const [btResult, setBtResult] = useState(null);

  // Notify
  const [tgToken, setTgToken] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [notify, setNotify] = useState({
    trade_opened: true, trade_closed_win: true, trade_closed_loss: true,
    connection_lost: true, auto_order_failed: true,
  });

  // Symbol config
  const [symConfig, setSymConfig] = useState({});
  const [newSym, setNewSym] = useState("frxXAUUSD");
  const [newGran, setNewGran] = useState(60);
  const [newStrats, setNewStrats] = useState(["combined"]);

  // History
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("");

  const availableStrategies = s.available_strategies || [];
  const watchlist = s.watchlist || [];
  const validMults = s.valid_multipliers || [100, 200, 300, 500, 800];

  async function fetchState() {
    try {
      const r = await axiosInstance.get(`${API}/api/state`);
      setS(r.data);
      if (!activeSymbol && r.data.active_symbol) setActiveSymbol(r.data.active_symbol);
      if (!strategy && r.data.strategy) setStrategy(r.data.strategy);
      if (!btSymbol && r.data.active_symbol) setBtSymbol(r.data.active_symbol);
      if (btStrategies.length === 0 && r.data.available_strategies) setBtStrategies(r.data.available_strategies);
    } catch (e) {
      setErr("Errore stato: " + (e.response?.data?.detail || e.message));
    }
  }

  useEffect(() => { fetchState(); }, []);
  useInterval(fetchState, 2000);

  async function post(url, body) {
    setLoading(true); setErr("");
    try {
      const r = await axiosInstance.post(`${API}${url}`, body);
      setS(r.data);
      return r.data;
    } catch (e) {
      const msg = e.response?.data?.detail || e.message;
      setErr(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!token && !s.configured) { setErr("Inserisci il token API"); return; }
    await post("/api/config", { token, app_id: appId, env, active_symbol: activeSymbol || undefined, strategy: strategy || undefined });
  }

  async function setActive() {
    await post("/api/active", { active_symbol: activeSymbol || undefined, strategy: strategy || undefined });
  }

  async function sendOrder(direction) {
    if (orderLock) return;
    setOrderLock(true);
    try {
      await post("/api/order", { direction, stake: parseFloat(autoStake) || 1, multiplier: parseInt(autoMultiplier) || 100, symbol: activeSymbol || undefined });
    } finally {
      setTimeout(() => setOrderLock(false), 800);
    }
  }

  async function closeAll() {
    await post("/api/close_all", {});
  }

  async function closeOne(id) {
    await post(`/api/close/${id}`, {});
  }

  async function toggleAuto() {
    const next = !s.auto_mode;
    if (next && s.env === "real") {
      setConfirmAction({ type: "auto", onConfirm: async () => {
        await post("/api/auto", { enabled: true });
        setConfirmAction(null);
      }});
      return;
    }
    await post("/api/auto", { enabled: next });
  }

  async function saveAutoSettings() {
    await post("/api/auto-settings", {
      auto_stake: parseFloat(autoStake),
      auto_multiplier: parseInt(autoMultiplier),
      max_open_positions: parseInt(maxPositions),
      auto_multi_symbol: autoMultiSymbol,
      auto_tp_pct: parseFloat(autoTpPct),
      auto_sl_pct: parseFloat(autoSlPct),
      trailing_activation_pct: parseFloat(trailAct),
      trailing_giveback_pct: parseFloat(trailGive),
      early_cut_pct: parseFloat(earlyCut),
      early_cut_confirm: parseInt(earlyConfirm),
      min_volatility_index: parseFloat(minVolIdx),
    });
  }

  async function runBacktest() {
    setBtRunning(true); setErr(""); setBtResult(null);
    try {
      const r = await axiosInstance.post(`${API}/api/backtest`, {
        symbol: btSymbol || s.active_symbol,
        strategies: btStrategies.length ? btStrategies : s.available_strategies,
        granularity: parseInt(btGranularity) || 60,
        count: parseInt(btCount) || 5000,
        confirm_need: btConfirm === "" ? null : parseInt(btConfirm),
        tp_pct: parseFloat(btTpPct),
        sl_pct: parseFloat(btSlPct),
        multiplier: parseInt(btMultiplier),
        stake: parseFloat(btStake),
        min_volatility_index: parseFloat(btMinVol),
      });
      setBtResult(r.data);
    } catch (e) {
      setErr("Backtest: " + (e.response?.data?.detail || e.message));
    } finally {
      setBtRunning(false);
    }
  }

  async function saveNotify() {
    await post("/api/notify-settings", { telegram_bot_token: tgToken, telegram_chat_id: tgChat, notify_settings: notify });
  }

  async function testNotify() {
    setLoading(true);
    try {
      await axiosInstance.post(`${API}/api/notify-test`, {});
      alert("Notifica inviata!");
    } catch (e) {
      setErr("Test notifica: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  }

  async function saveSymbolConfig() {
    await post("/api/symbol-config", { symbol_config: symConfig });
  }

  async function resetStats() {
    await post("/api/reset-stats", {});
  }

  async function fetchHistory() {
    try {
      const r = await axiosInstance.get(`${API}/api/history?limit=200&source=${historyFilter || ""}`);
      setHistory(r.data.trades || []);
    } catch (e) {
      setErr("Storico: " + (e.response?.data?.detail || e.message));
    }
  }

  useEffect(() => { if (tab === "history") fetchHistory(); }, [tab, historyFilter]);

  // UI helpers
  const connected = s.connected;
  const authorized = s.authorized;
  const sig = s.signal || { dir: "WAIT", score: 0, conf: 0 };
  const ind = s.indicators || {};
  const vol = s.volatility || { index: 1, level: "normale" };
  const stats = s.stats || {};

  const volColor = vol.level === "elevata" ? "warn" : vol.level === "compressa" ? "danger" : "accent";
  const sigColor = sig.dir === "BUY" ? "accent" : sig.dir === "SELL" ? "danger" : "muted";

  const addSymConfig = () => {
    const list = symConfig[newSym] || [];
    const id = Math.random().toString(36).slice(2, 8);
    setSymConfig({ ...symConfig, [newSym]: [...list, { id, strategies: [...newStrats], granularity_sec: parseInt(newGran) }] });
  };
  const removeSymConfig = (sym, idx) => {
    const list = [...(symConfig[sym] || [])];
    list.splice(idx, 1);
    setSymConfig({ ...symConfig, [sym]: list });
  };

  const toggleBtStrategy = (name) => {
    setBtStrategies(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  };

  // Charts
  const candleChartData = (s.markets && s.markets[s.active_symbol] && s.markets[s.active_symbol].candles_count > 0)
    ? (() => {
        const mk = s.markets[s.active_symbol];
        const cs = mk.candles || [];
        return cs.slice(-120).map((c, i) => ({
          t: i, open: c.open, high: c.high, low: c.low, close: c.close,
          ma9: i >= 8 ? cs.slice(i-8, i+1).reduce((a,b)=>a+b.close,0)/9 : null,
          ma21: i >= 20 ? cs.slice(i-20, i+1).reduce((a,b)=>a+b.close,0)/21 : null,
        }));
      })()
    : [];

  const btChartData = btResult && btResult.results
    ? Object.entries(btResult.results).filter(([,v]) => !v.error).map(([k, v]) => ({
        name: k, wins: v.wins || 0, losses: v.losses || 0, pnl: v.total_pnl_usd || 0,
      }))
    : [];

  return (
    <div className="container">
      <div className="row items-center justify-between mb-18">
        <div>
          <h1 className="font3 text-xl" style={{ letterSpacing: "-0.5px" }}>TRDGWDBOT</h1>
          <div className="text-xs muted">Trading bot per Deriv Multipliers</div>
        </div>
        <div className="flex gap-8 items-center">
          <span className={`badge ${connected && authorized ? "badge-success" : "badge-danger"}`}>
            {connected && authorized ? "● Connesso" : connected ? "○ Autenticazione..." : "● Disconnesso"}
          </span>
          <span className="badge">{s.env || "demo"}</span>
          {s.account_type === "real" && <span className="badge badge-danger">REAL</span>}
        </div>
      </div>

      {err && (
        <div className="card mb-12" style={{ borderColor: "var(--danger)" }}>
          <div className="danger text-sm">{err}</div>
          <button className="btn btn-xs mt-12" onClick={() => setErr("")}>Chiudi</button>
        </div>
      )}

      {confirmAction && (
        <div className="card mb-12" style={{ borderColor: "var(--warn)" }}>
          <div className="warn text-sm mb-8">
            {confirmAction.type === "auto" && "Stai per attivare l'auto-trading su un conto REAL. Sei sicuro?"}
            {confirmAction.type === "closeAll" && "Chiudere TUTTE le posizioni aperte?"}
            {confirmAction.type === "reset" && "Azzerare tutte le statistiche?"}
          </div>
          <div className="flex gap-8">
            <button className="btn btn-danger btn-sm" onClick={confirmAction.onConfirm}>Conferma</button>
            <button className="btn btn-sm" onClick={() => setConfirmAction(null)}>Annulla</button>
          </div>
        </div>
      )}

      <div className="flex gap-8 mb-18" style={{ flexWrap: "wrap" }}>
        {["dashboard","config","auto","backtest","symbols","notify","history"].map(t => (
          <button key={t} className={`btn btn-sm ${tab===t?"btn-primary":""}`} onClick={()=>setTab(t)}>
            {t==="dashboard"&&"Dashboard"}{t==="config"&&"Config"}{t==="auto"&&"Automazione"}
            {t==="backtest"&&"Backtest"}{t==="symbols"&&"Simboli"}{t==="notify"&&"Notifiche"}{t==="history"&&"Storico"}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div className="row">
          <div className="col">
            <div className="card mb-12">
              <div className="flex justify-between items-center mb-8">
                <div className="font3 text-lg">{s.active_symbol ? s.active_symbol.replace("frx","").replace("cry","") : "—"}</div>
                <div className={`badge ${sigColor}`}>{sig.dir} {sig.conf}%</div>
              </div>
              <div className="grid-4 mb-8">
                <div className="card2 text-center">
                  <div className="text-xs muted">Prezzo</div>
                  <div className="text-lg font2">{fmt(s.price, 5)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">Spread</div>
                  <div className="text-lg font2">{fmt(s.spread, 5)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">Bid</div>
                  <div className="text-lg font2">{fmt(s.bid, 5)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">Ask</div>
                  <div className="text-lg font2">{fmt(s.ask, 5)}</div>
                </div>
              </div>
              <div className="grid-4 mb-8">
                <div className="card2 text-center">
                  <div className="text-xs muted">RSI</div>
                  <div className="text-lg font2">{fmt(ind.RSI, 1)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">MACD</div>
                  <div className="text-lg font2">{fmt(ind.MACD, 4)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">ATR</div>
                  <div className="text-lg font2">{fmt(ind.ATR, 5)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">Stoch K</div>
                  <div className="text-lg font2">{fmt(ind.SK, 1)}</div>
                </div>
              </div>
              <div className="grid-3 mb-8">
                <div className="card2 text-center">
                  <div className="text-xs muted">EMA 9</div>
                  <div className="text-lg font2">{fmt(ind.E9, 5)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">EMA 21</div>
                  <div className="text-lg font2">{fmt(ind.E21, 5)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">EMA 50</div>
                  <div className="text-lg font2">{fmt(ind.E50, 5)}</div>
                </div>
              </div>
              <div className="card2 mb-8">
                <div className="text-xs muted mb-4">Filtri</div>
                <div className="flex items-center gap-8">
                  <span className={`badge ${s.filter_ok ? "badge-success" : "badge-warn"}`}>{s.filter_ok ? "OK" : "Bloccato"}</span>
                  <span className="text-sm">{s.filter_reason || ""}</span>
                </div>
                <div className="mt-8 text-xs muted">Volatilità: <span className={volColor}>{vol.level}</span> (indice {fmt(vol.index, 2)})</div>
              </div>
              <div className="flex gap-8">
                <button className="btn btn-primary w-full" disabled={orderLock || !authorized} onClick={() => setPendingOrder("BUY")}>BUY</button>
                <button className="btn btn-danger w-full" disabled={orderLock || !authorized} onClick={() => setPendingOrder("SELL")}>SELL</button>
              </div>
              {pendingOrder && (
                <div className="card2 mt-8" style={{ borderColor: "var(--warn)" }}>
                  <div className="text-sm mb-8">Confermi ordine <strong>{pendingOrder}</strong> su {s.active_symbol}?</div>
                  <div className="flex gap-8">
                    <button className="btn btn-primary btn-sm" onClick={() => { sendOrder(pendingOrder); setPendingOrder(null); }}>Conferma</button>
                    <button className="btn btn-sm" onClick={() => setPendingOrder(null)}>Annulla</button>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex justify-between items-center mb-8">
                <div className="font3">Grafico candele</div>
                <div className="text-xs muted">{s.candles_count || 0} candele</div>
              </div>
              <div style={{ height: 260 }}>
                {candleChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={candleChartData}>
                      <defs>
                        <linearGradient id="cUp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient>
                        <linearGradient id="cDn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--danger)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="t" hide />
                      <YAxis domain={["auto","auto"]} tick={{fill:"var(--muted)",fontSize:11}} width={70} />
                      <Tooltip contentStyle={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}} />
                      <Area type="monotone" dataKey="close" stroke="var(--accent)" fill="url(#cUp)" strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="ma9" stroke="#60a5fa" fill="none" strokeWidth={1} dot={false} />
                      <Area type="monotone" dataKey="ma21" stroke="#f59e0b" fill="none" strokeWidth={1} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center muted" style={{ paddingTop: 100 }}>Attendi lo storico candele...</div>
                )}
              </div>
            </div>
          </div>

          <div className="col">
            <div className="card mb-12">
              <div className="flex justify-between items-center mb-8">
                <div className="font3">Posizioni aperte</div>
                <button className="btn btn-xs btn-danger" disabled={!authorized || !(s.positions || []).length} onClick={() => setConfirmAction({ type: "closeAll", onConfirm: () => { closeAll(); setConfirmAction(null); } })}>Chiudi tutte</button>
              </div>
              {(s.positions || []).length === 0 ? (
                <div className="text-sm muted">Nessuna posizione aperta</div>
              ) : (
                <div className="scroll">
                  <table>
                    <thead><tr><th>ID</th><th>Dir</th><th>P/L</th><th>Strat</th><th></th></tr></thead>
                    <tbody>
                      {(s.positions || []).map(p => (
                        <tr key={p.contract_id}>
                          <td className="text-xs">{p.contract_id}</td>
                          <td className={p.contract_type?.includes("MULTUP") ? "accent" : "danger"}>{p.contract_type?.includes("MULTUP") ? "BUY" : "SELL"}</td>
                          <td className={p.profit >= 0 ? "pnl-pos" : "pnl-neg"}>{fmt(p.profit, 2)}</td>
                          <td className="text-xs muted">{p.strategy || "—"}</td>
                          <td><button className="btn btn-xs btn-danger" onClick={() => closeOne(p.contract_id)}>Chiudi</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card mb-12">
              <div className="font3 mb-8">Statistiche sessione</div>
              <div className="grid-2">
                <div className="card2 text-center">
                  <div className="text-xs muted">Trade totali</div>
                  <div className="text-xl font2">{stats.trades_total || 0}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">Win rate</div>
                  <div className="text-xl font2">{stats.trades_total ? fmt((stats.trades_win / stats.trades_total) * 100, 1) + "%" : "—"}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">Profitto totale</div>
                  <div className={`text-xl font2 ${(stats.profit_total || 0) >= 0 ? "pnl-pos" : "pnl-neg"}`}>{fmt(stats.profit_total, 2)}</div>
                </div>
                <div className="card2 text-center">
                  <div className="text-xs muted">P/L sessione</div>
                  <div className={`text-xl font2 ${(stats.session_pnl || 0) >= 0 ? "pnl-pos" : "pnl-neg"}`}>{fmt(stats.session_pnl, 2)}</div>
                </div>
              </div>
              <div className="divider" />
              <div className="grid-2">
                <div>
                  <div className="text-xs muted">Auto</div>
                  <div className="text-sm">{stats.auto_trades_total || 0} trade — {stats.auto_trades_total ? fmt((stats.auto_trades_win / stats.auto_trades_total) * 100, 1) + "%" : "—"} win</div>
                </div>
                <div>
                  <div className="text-xs muted">Manuale</div>
                  <div className="text-sm">{stats.manual_trades_total || 0} trade — {stats.manual_trades_total ? fmt((stats.manual_trades_win / stats.manual_trades_total) * 100, 1) + "%" : "—"} win</div>
                </div>
              </div>
              <div className="mt-12">
                <button className="btn btn-xs btn-danger" onClick={() => setConfirmAction({ type: "reset", onConfirm: () => { resetStats(); setConfirmAction(null); } })}>Azzera statistiche</button>
              </div>
            </div>

            <div className="card">
              <div className="flex justify-between items-center mb-8">
                <div className="font3">Log</div>
                <span className="text-xs muted">{s.last_error ? "Errore" : "OK"}</span>
              </div>
              <div className="scroll">
                {(s.logs || []).map((l, i) => (
                  <div key={i} className="text-xs mb-4" style={{ opacity: 0.85 }}>
                    <span className="muted">{l.ts?.slice(11, 19) || ""}</span>{" "}
                    <span className={l.level === "E" ? "log-error" : l.level === "S" ? "log-success" : l.level === "W" ? "log-warn" : "log-info"}>{l.level}</span>{" "}
                    {l.msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "config" && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="font3 mb-12">Configurazione Deriv</div>
          <div className="grid-2">
            <div>
              <label className="label">Token API</label>
              <input className="input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder={s.configured ? "•••••••• (già salvato)" : "Incolla il token"} />
            </div>
            <div>
              <label className="label">App ID</label>
              <input className="input" value={appId} onChange={e => setAppId(e.target.value)} />
            </div>
            <div>
              <label className="label">Ambiente</label>
              <select className="select" value={env} onChange={e => setEnv(e.target.value)}>
                <option value="demo">Demo</option>
                <option value="real">Real</option>
              </select>
            </div>
            <div>
              <label className="label">Simbolo attivo</label>
              <select className="select" value={activeSymbol} onChange={e => { setActiveSymbol(e.target.value); }}>
                <option value="">—</option>
                {watchlist.map(sym => <option key={sym} value={sym}>{sym.replace("frx","").replace("cry","")}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Strategia</label>
              <select className="select" value={strategy} onChange={e => setStrategy(e.target.value)}>
                <option value="">—</option>
                {availableStrategies.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-8 mt-18">
            <button className="btn btn-primary" disabled={loading} onClick={saveConfig}>Salva & Connetti</button>
            <button className="btn" disabled={loading} onClick={setActive}>Applica simbolo/strategia</button>
          </div>
          {s.last_error && <div className="mt-12 text-sm danger">{s.last_error}</div>}
        </div>
      )}

      {tab === "auto" && (
        <div className="row">
          <div className="col">
            <div className="card mb-12">
              <div className="flex justify-between items-center mb-12">
                <div className="font3">Automazione</div>
                <button className={`btn btn-sm ${s.auto_mode ? "btn-danger" : "btn-primary"}`} onClick={toggleAuto}>
                  {s.auto_mode ? "DISATTIVA AUTO" : "ATTIVA AUTO"}
                </button>
              </div>
              <div className="grid-3">
                <div>
                  <label className="label">Stake ($)</label>
                  <input className="input" type="number" step="0.1" min="0.1" value={autoStake} onChange={e => setAutoStake(e.target.value)} />
                </div>
                <div>
                  <label className="label">Leva</label>
                  <select className="select" value={autoMultiplier} onChange={e => setAutoMultiplier(e.target.value)}>
                    {validMults.map(m => <option key={m} value={m}>x{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Max posizioni aperte</label>
                  <input className="input" type="number" min="1" max="20" value={maxPositions} onChange={e => setMaxPositions(e.target.value)} />
                </div>
                <div>
                  <label className="label">TP (%)</label>
                  <input className="input" type="number" step="1" min="1" value={autoTpPct} onChange={e => setAutoTpPct(e.target.value)} />
                </div>
                <div>
                  <label className="label">SL (%)</label>
                  <input className="input" type="number" step="1" min="1" value={autoSlPct} onChange={e => setAutoSlPct(e.target.value)} />
                </div>
                <div>
                  <label className="label">Min volatilità</label>
                  <input className="input" type="number" step="0.1" min="0.1" value={minVolIdx} onChange={e => setMinVolIdx(e.target.value)} />
                </div>
                <div>
                  <label className="label">Trailing attivazione (%)</label>
                  <input className="input" type="number" step="1" min="1" value={trailAct} onChange={e => setTrailAct(e.target.value)} />
                </div>
                <div>
                  <label className="label">Trailing giveback (%)</label>
                  <input className="input" type="number" step="1" min="1" value={trailGive} onChange={e => setTrailGive(e.target.value)} />
                </div>
                <div>
                  <label className="label">Early cut (%)</label>
                  <input className="input" type="number" step="1" min="1" value={earlyCut} onChange={e => setEarlyCut(e.target.value)} />
                </div>
                <div>
                  <label className="label">Early cut conferme</label>
                  <input className="input" type="number" min="1" max="20" value={earlyConfirm} onChange={e => setEarlyConfirm(e.target.value)} />
                </div>
                <div className="flex items-center gap-8" style={{ paddingTop: 20 }}>
                  <input type="checkbox" id="ams" checked={autoMultiSymbol} onChange={e => setAutoMultiSymbol(e.target.checked)} />
                  <label htmlFor="ams" className="text-sm">Multi-simbolo</label>
                </div>
              </div>
              <div className="mt-12">
                <button className="btn btn-primary" disabled={loading} onClick={saveAutoSettings}>Salva parametri</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "backtest" && (
        <div className="row">
          <div className="col">
            <div className="card mb-12">
              <div className="font3 mb-12">Parametri Backtest</div>
              <div className="grid-3">
                <div>
                  <label className="label">Simbolo</label>
                  <select className="select" value={btSymbol} onChange={e => setBtSymbol(e.target.value)}>
                    <option value="">— usa attivo —</option>
                    {watchlist.map(sym => <option key={sym} value={sym}>{sym.replace("frx","").replace("cry","")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Timeframe (sec)</label>
                  <select className="select" value={btGranularity} onChange={e => setBtGranularity(e.target.value)}>
                    <option value={60}>1 minuto</option>
                    <option value={300}>5 minuti</option>
                    <option value={900}>15 minuti</option>
                    <option value={3600}>1 ora</option>
                  </select>
                </div>
                <div>
                  <label className="label">Candele (max 10k)</label>
                  <input className="input" type="number" min="100" max="10000" value={btCount} onChange={e => setBtCount(e.target.value)} />
                </div>
                <div>
                  <label className="label">TP (%)</label>
                  <input className="input" type="number" step="1" min="1" value={btTpPct} onChange={e => setBtTpPct(e.target.value)} />
                </div>
                <div>
                  <label className="label">SL (%)</label>
                  <input className="input" type="number" step="1" min="1" value={btSlPct} onChange={e => setBtSlPct(e.target.value)} />
                </div>
                <div>
                  <label className="label">Leva</label>
                  <select className="select" value={btMultiplier} onChange={e => setBtMultiplier(e.target.value)}>
                    {validMults.map(m => <option key={m} value={m}>x{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Stake ($)</label>
                  <input className="input" type="number" step="0.1" min="0.1" value={btStake} onChange={e => setBtStake(e.target.value)} />
                </div>
                <div>
                  <label className="label">Conferme (vuoto = default)</label>
                  <input className="input" type="number" min="1" value={btConfirm} onChange={e => setBtConfirm(e.target.value)} placeholder="default" />
                </div>
                <div>
                  <label className="label">Min volatilità</label>
                  <input className="input" type="number" step="0.1" min="0.1" value={btMinVol} onChange={e => setBtMinVol(e.target.value)} />
                </div>
              </div>
              <div className="mt-12">
                <label className="label">Strategie da testare</label>
                <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                  {availableStrategies.map(name => (
                    <label key={name} className="flex items-center gap-4 text-sm" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={btStrategies.includes(name)} onChange={() => toggleBtStrategy(name)} />
                      {name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-12">
                <button className="btn btn-primary" disabled={btRunning || !authorized} onClick={runBacktest}>
                  {btRunning ? "In corso..." : "Avvia Backtest"}
                </button>
              </div>
            </div>

            {btResult && (
              <div className="card">
                <div className="flex justify-between items-center mb-8">
                  <div className="font3">Risultati Backtest</div>
                  <div className="text-xs muted">{btResult.candles_used} candele @ {btResult.granularity_sec}s — {btResult.symbol}</div>
                </div>
                <div className="grid-3 mb-12">
                  <div className="card2 text-center">
                    <div className="text-xs muted">Trade chiusi</div>
                    <div className="text-lg font2">{Object.values(btResult.results).reduce((a, v) => a + (v.n_trades_closed || 0), 0)}</div>
                  </div>
                  <div className="card2 text-center">
                    <div className="text-xs muted">P/L totale</div>
                    <div className={`text-lg font2 ${Object.values(btResult.results).reduce((a, v) => a + (v.total_pnl_usd || 0), 0) >= 0 ? "pnl-pos" : "pnl-neg"}`}>
                      ${fmt(Object.values(btResult.results).reduce((a, v) => a + (v.total_pnl_usd || 0), 0), 2)}
                    </div>
                  </div>
                  <div className="card2 text-center">
                    <div className="text-xs muted">Max drawdown</div>
                    <div className="text-lg font2 danger">${fmt(Math.min(...Object.values(btResult.results).map(v => v.max_drawdown_usd || 0)), 2)}</div>
                  </div>
                </div>
                <div style={{ height: 240 }} className="mb-12">
                  {btChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={btChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                        <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                        <Legend />
                        <Bar dataKey="wins" fill="var(--accent)" name="Win" />
                        <Bar dataKey="losses" fill="var(--danger)" name="Loss" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center muted" style={{ paddingTop: 80 }}>Nessun dato</div>
                  )}
                </div>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Strategia</th><th>Trade</th><th>Win</th><th>Loss</th><th>Win rate</th>
                        <th>P/L tot</th><th>P/L medio</th><th>Max DD</th><th>Aperti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(btResult.results).map(([k, v]) => (
                        <tr key={k}>
                          <td className="font2">{k}</td>
                          <td>{v.n_trades_closed ?? "—"}</td>
                          <td className="accent">{v.wins ?? "—"}</td>
                          <td className="danger">{v.losses ?? "—"}</td>
                          <td>{v.win_rate_pct !== null ? v.win_rate_pct + "%" : "—"}</td>
                          <td className={v.total_pnl_usd >= 0 ? "pnl-pos" : "pnl-neg"}>${fmt(v.total_pnl_usd, 2)}</td>
                          <td>{v.avg_pnl_usd !== null ? "$" + fmt(v.avg_pnl_usd, 2) : "—"}</td>
                          <td className="danger">${fmt(v.max_drawdown_usd, 2)}</td>
                          <td>{v.still_open_at_end ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "symbols" && (
        <div className="card" style={{ maxWidth: 800 }}>
          <div className="font3 mb-12">Configurazione per simbolo</div>
          <div className="flex gap-8 mb-12" style={{ flexWrap: "wrap" }}>
            <div>
              <label className="label">Simbolo</label>
              <select className="select" value={newSym} onChange={e => setNewSym(e.target.value)}>
                {watchlist.map(sym => <option key={sym} value={sym}>{sym.replace("frx","").replace("cry","")}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Timeframe</label>
              <select className="select" value={newGran} onChange={e => setNewGran(e.target.value)}>
                <option value={60}>1 min</option>
                <option value={300}>5 min</option>
                <option value={900}>15 min</option>
                <option value={3600}>1h</option>
              </select>
            </div>
            <div style={{ minWidth: 200 }}>
              <label className="label">Strategie</label>
              <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                {availableStrategies.map(st => (
                  <label key={st} className="flex items-center gap-4 text-sm" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={newStrats.includes(st)} onChange={() => setNewStrats(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])} />
                    {st}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <button className="btn btn-primary btn-sm" onClick={addSymConfig}>Aggiungi</button>
            </div>
          </div>
          <div className="divider" />
          {Object.entries(symConfig).length === 0 ? (
            <div className="text-sm muted">Nessuna configurazione per simbolo</div>
          ) : (
            Object.entries(symConfig).map(([sym, list]) => (
              <div key={sym} className="mb-12">
                <div className="font2 text-sm mb-4">{sym.replace("frx","").replace("cry","")}</div>
                {(list || []).map((cfg, idx) => (
                  <div key={cfg.id || idx} className="card2 mb-4 flex justify-between items-center">
                    <div className="text-sm">
                      <span className="muted">{cfg.granularity_sec}s</span>{" · "}
                      <span>{(cfg.strategies || []).join(", ")}</span>
                    </div>
                    <button className="btn btn-xs btn-danger" onClick={() => removeSymConfig(sym, idx)}>Rimuovi</button>
                  </div>
                ))}
              </div>
            ))
          )}
          <div className="mt-12">
            <button className="btn btn-primary" disabled={loading} onClick={saveSymbolConfig}>Salva configurazione</button>
          </div>
        </div>
      )}

      {tab === "notify" && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="font3 mb-12">Notifiche Telegram</div>
          <div className="grid-2">
            <div>
              <label className="label">Bot Token</label>
              <input className="input" type="password" value={tgToken} onChange={e => setTgToken(e.target.value)} placeholder={s.telegram_bot_token ? "••••••••" : ""} />
            </div>
            <div>
              <label className="label">Chat ID</label>
              <input className="input" value={tgChat} onChange={e => setTgChat(e.target.value)} placeholder={s.telegram_chat_id || ""} />
            </div>
          </div>
          <div className="mt-12">
            <label className="label">Eventi</label>
            <div className="flex flex-col gap-8">
              {Object.entries(notify).map(([k, v]) => (
                <label key={k} className="flex items-center gap-8 text-sm" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={v} onChange={e => setNotify({ ...notify, [k]: e.target.checked })} />
                  {k.replace(/_/g, " ")}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-8 mt-18">
            <button className="btn btn-primary" disabled={loading} onClick={saveNotify}>Salva</button>
            <button className="btn" disabled={loading} onClick={testNotify}>Test notifica</button>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <div className="flex justify-between items-center mb-12">
            <div className="font3">Storico trade</div>
            <select className="select" style={{ width: 140 }} value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}>
              <option value="">Tutti</option>
              <option value="manual">Manuali</option>
              <option value="auto">Automatici</option>
            </select>
          </div>
          {history.length === 0 ? (
            <div className="text-sm muted">Nessun trade nello storico</div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr><th>Data</th><th>Simbolo</th><th>Dir</th><th>Stake</th><th>Leva</th><th>P/L</th><th>Fonte</th><th>Strategia</th></tr>
                </thead>
                <tbody>
                  {history.map(t => (
                    <tr key={t.id}>
                      <td className="text-xs">{t.opened_at?.slice(0, 19).replace("T", " ") || "—"}</td>
                      <td>{t.symbol?.replace("frx","").replace("cry","") || "—"}</td>
                      <td className={t.direction === "BUY" ? "accent" : "danger"}>{t.direction}</td>
                      <td>${fmt(t.stake, 2)}</td>
                      <td>x{t.multiplier}</td>
                      <td className={t.profit >= 0 ? "pnl-pos" : "pnl-neg"}>{t.profit !== undefined ? fmt(t.profit, 2) : "—"}</td>
                      <td className="text-xs muted">{t.source}</td>
                      <td className="text-xs muted">{t.strategy || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
