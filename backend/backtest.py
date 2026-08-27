"""Motore di backtest."""
from typing import List, Dict, Optional
import strategies

def _simulate_one_strategy(candles, strategy_name, confirm_need, tp_pct, sl_pct, multiplier, stake, min_volatility_index=0.6, warmup=60):
    fn = strategies.STRATEGIES.get(strategy_name)
    if fn is None:
        return {"error": f"strategia sconosciuta: {strategy_name}"}
    if len(candles) < warmup+20:
        return {"error": "storico troppo corto"}
    if confirm_need is None:
        confirm_need = strategies.STRATEGY_CONFIRM_NEED.get(strategy_name, 3)
    trades = []
    pending_dir, pending_count = "WAIT", 0
    last_dir = None
    i = warmup
    n = len(candles)
    LIVE_WINDOW = 200
    while i < n:
        window = candles[max(0, i+1-LIVE_WINDOW):i+1]
        sig = fn(window)
        d = sig["dir"]
        if d == pending_dir:
            pending_count += 1
        else:
            pending_dir, pending_count = d, 1
        confirmed = pending_count >= confirm_need
        if confirmed and d != "WAIT" and d != last_dir:
            price = candles[i]["close"]
            vol_info = strategies.volatility_index(window)
            if vol_info.get("level")=="compressa" or vol_info.get("index",1.0) < min_volatility_index:
                last_dir = d; i += 1; continue
            tp_distance = price * (tp_pct/(multiplier*100))
            sl_distance = price * (sl_pct/(multiplier*100))
            room_ok, _ = strategies.target_reachable(window, d, tp_distance, sl_distance)
            last_dir = d
            if room_ok:
                if d == "BUY":
                    tp_price, sl_price = price + tp_distance, price - sl_distance
                else:
                    tp_price, sl_price = price - tp_distance, price + sl_distance
                exit_i, outcome, exit_price = None, None, None
                for j in range(i+1, n):
                    c = candles[j]
                    hit_tp = (c["high"] >= tp_price) if d=="BUY" else (c["low"] <= tp_price)
                    hit_sl = (c["low"] <= sl_price) if d=="BUY" else (c["high"] >= sl_price)
                    if hit_tp and hit_sl:
                        if d == "BUY":
                            outcome = "TP" if c["close"] >= tp_price else "SL"
                        else:
                            outcome = "TP" if c["close"] <= tp_price else "SL"
                        exit_price = tp_price if outcome=="TP" else sl_price
                        exit_i = j; break
                    if hit_sl: exit_i, outcome, exit_price = j, "SL", sl_price; break
                    if hit_tp: exit_i, outcome, exit_price = j, "TP", tp_price; break
                if exit_i is None:
                    trades.append({"entry_i": i, "dir": d, "outcome": "OPEN_AT_END", "pnl_pct": None, "pnl_usd": None})
                    i = n; break
                else:
                    pnl_pct = tp_pct if outcome=="TP" else -sl_pct
                    trades.append({"entry_i": i, "exit_i": exit_i, "dir": d, "outcome": outcome, "pnl_pct": pnl_pct, "pnl_usd": stake*pnl_pct/100})
                    i = exit_i+1
                    pending_dir, pending_count, last_dir = "WAIT", 0, None
                    continue
        i += 1
    closed = [t for t in trades if t.get("outcome") in ("TP","SL")]
    wins = [t for t in closed if t["outcome"]=="TP"]
    losses = [t for t in closed if t["outcome"]=="SL"]
    open_at_end = [t for t in trades if t.get("outcome")=="OPEN_AT_END"]
    total_pnl = sum(t["pnl_usd"] for t in closed)
    equity, peak, max_dd = 0.0, 0.0, 0.0
    for t in closed:
        equity += t["pnl_usd"]
        peak = max(peak, equity)
        max_dd = min(max_dd, equity-peak)
    return {
        "strategy": strategy_name, "n_trades_closed": len(closed),
        "wins": len(wins), "losses": len(losses),
        "win_rate_pct": round(len(wins)/len(closed)*100,1) if closed else None,
        "total_pnl_usd": round(total_pnl,2),
        "avg_pnl_usd": round(total_pnl/len(closed),2) if closed else None,
        "max_drawdown_usd": round(max_dd,2),
        "still_open_at_end": len(open_at_end),
    }

def run_backtest(candles, strategy_names, confirm_need, tp_pct, sl_pct, multiplier, stake, min_volatility_index=0.6):
    results = {name: _simulate_one_strategy(candles, name, confirm_need, tp_pct, sl_pct, multiplier, stake, min_volatility_index) for name in strategy_names}
    return {
        "candles_used": len(candles),
        "params": {"confirm_need": confirm_need if confirm_need is not None else "per-strategia (default)", "tp_pct": tp_pct, "sl_pct": sl_pct, "multiplier": multiplier, "stake": stake, "min_volatility_index": min_volatility_index},
        "results": results,
    }
