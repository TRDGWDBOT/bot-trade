"""Motore strategie."""
from typing import List, Dict, Optional

def _true_range_series(candles):
    trs = []
    for i in range(1, len(candles)):
        h, l, c_prev = candles[i]["high"], candles[i]["low"], candles[i-1]["close"]
        trs.append(max(h-l, abs(h-c_prev), abs(l-c_prev)))
    return trs

def volatility_index(candles, recent_window=14, baseline_window=50):
    trs = _true_range_series(candles)
    if len(trs) < recent_window + 5:
        return {"index": 1.0, "level": "normale", "recent_atr": 0.0, "baseline_atr": 0.0}
    recent = trs[-recent_window:]
    baseline_source = trs[-(recent_window+baseline_window):-recent_window] or trs[:-recent_window]
    recent_atr = sum(recent)/len(recent)
    baseline_atr = sum(baseline_source)/len(baseline_source) if baseline_source else recent_atr
    idx = (recent_atr/baseline_atr) if baseline_atr > 0 else 1.0
    level = "elevata" if idx >= 1.3 else "compressa" if idx <= 0.6 else "normale"
    return {"index": round(idx,2), "level": level, "recent_atr": recent_atr, "baseline_atr": baseline_atr}

def detect_swings(candles, lookback=2):
    swings = []
    n = len(candles)
    for i in range(lookback, n-lookback):
        window = candles[i-lookback:i+lookback+1]
        hi, lo = candles[i]["high"], candles[i]["low"]
        if hi == max(c["high"] for c in window):
            swings.append({"i": i, "type": "high", "price": hi})
        if lo == min(c["low"] for c in window):
            swings.append({"i": i, "type": "low", "price": lo})
    return swings

def market_structure(swings):
    highs = [s for s in swings if s["type"]=="high"][-2:]
    lows = [s for s in swings if s["type"]=="low"][-2:]
    if len(highs)==2 and len(lows)==2:
        if highs[-1]["price"] > highs[-2]["price"] and lows[-1]["price"] > lows[-2]["price"]:
            return "up"
        if highs[-1]["price"] < highs[-2]["price"] and lows[-1]["price"] < lows[-2]["price"]:
            return "down"
    return "range"

def detect_bos_choch(candles, swings):
    if not swings or len(candles) < 3:
        return None
    last_close = candles[-1]["close"]
    prevailing = market_structure(swings)
    recent_high = next((s for s in reversed(swings) if s["type"]=="high"), None)
    recent_low = next((s for s in reversed(swings) if s["type"]=="low"), None)
    if recent_high and last_close > recent_high["price"]:
        return {"dir": "up", "kind": "BOS" if prevailing != "down" else "CHoCH", "level": recent_high["price"]}
    if recent_low and last_close < recent_low["price"]:
        return {"dir": "down", "kind": "BOS" if prevailing != "up" else "CHoCH", "level": recent_low["price"]}
    return None

def detect_fvg(candles, max_lookback=30):
    gaps = []
    n = len(candles)
    start = max(1, n-max_lookback)
    for i in range(start, n-1):
        c0, c2 = candles[i-1], candles[i+1]
        if c2["low"] > c0["high"]:
            gaps.append({"i": i, "type": "bullish", "top": c2["low"], "bottom": c0["high"]})
        elif c2["high"] < c0["low"]:
            gaps.append({"i": i, "type": "bearish", "top": c0["low"], "bottom": c2["high"]})
    return gaps

def detect_order_blocks(candles, bos, max_lookback=15):
    if not bos:
        return []
    n = len(candles)
    start = max(0, n-max_lookback)
    obs = []
    if bos["dir"] == "up":
        for i in range(n-2, start, -1):
            if candles[i]["close"] < candles[i]["open"]:
                obs.append({"i": i, "type": "bullish", "top": candles[i]["high"], "bottom": candles[i]["low"]})
                break
    else:
        for i in range(n-2, start, -1):
            if candles[i]["close"] > candles[i]["open"]:
                obs.append({"i": i, "type": "bearish", "top": candles[i]["high"], "bottom": candles[i]["low"]})
                break
    return obs

def detect_liquidity_sweep(candles, swings):
    if len(candles) < 3 or not swings:
        return None
    last = candles[-1]
    recent_high = next((s for s in reversed(swings[:-1]) if s["type"]=="high"), None)
    recent_low = next((s for s in reversed(swings[:-1]) if s["type"]=="low"), None)
    if recent_high and last["high"] > recent_high["price"] and last["close"] < recent_high["price"]:
        return {"type": "sell_side_swept", "level": recent_high["price"]}
    if recent_low and last["low"] < recent_low["price"] and last["close"] > recent_low["price"]:
        return {"type": "buy_side_swept", "level": recent_low["price"]}
    return None

def ict_signal(candles):
    if len(candles) < 25:
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": ["Poche candele"]}
    swings = detect_swings(candles)
    bos = detect_bos_choch(candles, swings)
    fvgs = detect_fvg(candles)
    obs = detect_order_blocks(candles, bos)
    sweep = detect_liquidity_sweep(candles, swings)
    price = candles[-1]["close"]
    score, reasons = 0, []
    if bos:
        score += 3 if bos["kind"]=="BOS" else 2
        reasons.append(f"{bos['kind']} {bos['dir']} @ {bos['level']:.2f}")
    bias = bos["dir"] if bos else None
    if bias:
        for g in [g for g in fvgs if g["type"]==("bullish" if bias=="up" else "bearish")][-3:]:
            if g["bottom"] <= price <= g["top"]:
                score += 2; reasons.append(f"Prezzo dentro FVG {g['type']}"); break
        for o in [o for o in obs if o["type"]==("bullish" if bias=="up" else "bearish")]:
            if o["bottom"] <= price <= o["top"]:
                score += 2; reasons.append(f"Prezzo dentro order block {o['type']}"); break
    if sweep:
        if sweep["type"]=="buy_side_swept" and bias=="up":
            score += 2; reasons.append(f"Liquidity sweep sotto {sweep['level']:.2f} poi rialzo")
        elif sweep["type"]=="sell_side_swept" and bias=="down":
            score += 2; reasons.append(f"Liquidity sweep sopra {sweep['level']:.2f} poi ribasso")
    if not bias:
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": reasons}
    direction = "BUY" if bias=="up" else "SELL"
    if score < 4: direction = "WAIT"
    conf = min(100, round(abs(score)/9*100))
    return {"dir": direction, "score": score, "conf": conf, "reasons": reasons}

def candle_pattern(c_prev, c):
    body = abs(c["close"]-c["open"])
    rng = c["high"]-c["low"] or 1e-9
    upper_wick = c["high"]-max(c["close"], c["open"])
    lower_wick = min(c["close"], c["open"])-c["low"]
    prev_bullish = c_prev["close"] > c_prev["open"]
    bullish = c["close"] > c["open"]
    if bullish and not prev_bullish and c["close"]>c_prev["open"] and c["open"]<c_prev["close"]:
        return "bullish_engulfing"
    if not bullish and prev_bullish and c["open"]>c_prev["close"] and c["close"]<c_prev["open"]:
        return "bearish_engulfing"
    if body/rng < 0.35:
        if lower_wick/rng > 0.55 and upper_wick/rng < 0.2:
            return "bullish_pinbar"
        if upper_wick/rng > 0.55 and lower_wick/rng < 0.2:
            return "bearish_pinbar"
    return None

def support_resistance(candles, swings, price, tol_pct=0.0015):
    for s in reversed(swings):
        if abs(s["price"]-price)/price <= tol_pct:
            return s
    return None

OBSTACLE_LOOKBACK = 8
MIN_OBSTACLE_PROMINENCE_RATIO = 0.15

def target_reachable(candles, direction, tp_distance, sl_distance, atr_val=None):
    if tp_distance <= 0 or direction not in ("BUY","SELL") or len(candles) < (OBSTACLE_LOOKBACK*2+5):
        return True, ""
    price = candles[-1]["close"]
    swings = detect_swings(candles, lookback=OBSTACLE_LOOKBACK)
    min_prominence = tp_distance * MIN_OBSTACLE_PROMINENCE_RATIO
    if direction == "BUY":
        tp_target = price + tp_distance
        obstacles = [s["price"] for s in swings if s["type"]=="high" and price+min_prominence < s["price"] < tp_target]
        if obstacles:
            return False, f"resistenza a {min(obstacles):.5f} prima del TP ({tp_target:.5f})"
    else:
        tp_target = price - tp_distance
        obstacles = [s["price"] for s in swings if s["type"]=="low" and tp_target < s["price"] < price-min_prominence]
        if obstacles:
            return False, f"supporto a {max(obstacles):.5f} prima del TP ({tp_target:.5f})"
    return True, ""

def price_action_signal(candles):
    if len(candles) < 20:
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": ["Poche candele"]}
    swings = detect_swings(candles)
    trend = market_structure(swings)
    price = candles[-1]["close"]
    pattern = candle_pattern(candles[-2], candles[-1])
    level = support_resistance(candles, swings, price)
    score, reasons = 0, []
    if trend == "up": score += 2; reasons.append("Struttura rialzista (HH/HL)")
    elif trend == "down": score -= 2; reasons.append("Struttura ribassista (LH/LL)")
    if pattern:
        reasons.append(f"Pattern candela: {pattern}")
        score += 2 if "bullish" in pattern else -2 if "bearish" in pattern else 0
    if level:
        reasons.append(f"Prezzo vicino a livello {level['type']} @ {level['price']:.2f}")
        if level["type"]=="low" and pattern and "bullish" in pattern: score += 2
        elif level["type"]=="high" and pattern and "bearish" in pattern: score -= 2
    direction = "BUY" if score >= 4 else "SELL" if score <= -4 else "WAIT"
    conf = min(100, round(abs(score)/6*100))
    return {"dir": direction, "score": score, "conf": conf, "reasons": reasons}

def combined_signal(candles):
    ict = ict_signal(candles)
    pa = price_action_signal(candles)
    reasons = [f"[ICT] {r}" for r in ict["reasons"]] + [f"[PA] {r}" for r in pa["reasons"]]
    if ict["dir"] == "WAIT":
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": reasons}
    if pa["dir"] != "WAIT" and pa["dir"] != ict["dir"]:
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": reasons}
    if pa["dir"] == ict["dir"]:
        return {"dir": ict["dir"], "score": ict["score"]+pa["score"], "conf": min(100, round(abs(ict["score"]+pa["score"])/15*100)), "reasons": reasons}
    return {"dir": ict["dir"], "score": ict["score"], "conf": min(100, round(abs(ict["score"])/12*100)), "reasons": reasons}

def _ema_series(values, period):
    if not values: return []
    k = 2/(period+1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v*k + out[-1]*(1-k))
    return out

def _rsi(closes, period=14):
    if len(closes) < period+1: return 50.0
    gains, losses = [], []
    for i in range(-period, 0):
        diff = closes[i]-closes[i-1]
        gains.append(max(diff,0)); losses.append(max(-diff,0))
    avg_gain, avg_loss = sum(gains)/period, sum(losses)/period
    if avg_loss == 0: return 100.0
    return 100 - (100/(1+avg_gain/avg_loss))

def trend_following_signal(candles):
    if len(candles) < 55:
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": ["Poche candele"]}
    closes = [c["close"] for c in candles]
    e9 = _ema_series(closes, 9)[-1]
    e21 = _ema_series(closes, 21)[-1]
    e50 = _ema_series(closes, 50)[-1]
    macd_hist = e9 - e21
    momentum = closes[-1] - closes[-6]
    score, reasons = 0, []
    if e9 > e21 > e50: score += 3; reasons.append("EMA allineate al rialzo (9>21>50)")
    elif e9 < e21 < e50: score -= 3; reasons.append("EMA allineate al ribasso (9<21<50)")
    if macd_hist > 0: score += 2; reasons.append("MACD positivo")
    elif macd_hist < 0: score -= 2; reasons.append("MACD negativo")
    if momentum > 0: score += 1; reasons.append("Momentum positivo")
    elif momentum < 0: score -= 1; reasons.append("Momentum negativo")
    direction = "BUY" if score >= 5 else "SELL" if score <= -5 else "WAIT"
    conf = min(100, round(abs(score)/6*100))
    return {"dir": direction, "score": score, "conf": conf, "reasons": reasons}

BB_STD_MULT = 1.5

def mean_reversion_signal(candles):
    if len(candles) < 25:
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": ["Poche candele"]}
    closes = [c["close"] for c in candles]
    price = closes[-1]
    window = closes[-20:]
    mid = sum(window)/len(window)
    std = (sum((x-mid)**2 for x in window)/len(window))**0.5
    upper, lower = mid + BB_STD_MULT*std, mid - BB_STD_MULT*std
    rsi_val = _rsi(closes)
    score, reasons = 0, []
    if price < lower: score += 3; reasons.append(f"Prezzo sotto banda inferiore ({lower:.5f})")
    elif price > upper: score -= 3; reasons.append(f"Prezzo sopra banda superiore ({upper:.5f})")
    if rsi_val < 30: score += 2; reasons.append(f"RSI ipervenduto ({rsi_val:.0f})")
    elif rsi_val > 70: score -= 2; reasons.append(f"RSI ipercomprato ({rsi_val:.0f})")
    direction = "BUY" if score >= 5 else "SELL" if score <= -5 else "WAIT"
    conf = min(100, round(abs(score)/5*100))
    return {"dir": direction, "score": score, "conf": conf, "reasons": reasons}

def breakout_signal(candles, lookback=20):
    if len(candles) < lookback+2:
        return {"dir": "WAIT", "score": 0, "conf": 0, "reasons": ["Poche candele"]}
    prior = candles[-(lookback+1):-1]
    last = candles[-1]
    highest = max(c["high"] for c in prior)
    lowest = min(c["low"] for c in prior)
    body = abs(last["close"]-last["open"])
    rng = max(last["high"]-last["low"], 1e-9)
    body_ratio = body/rng
    score, reasons = 0, []
    if last["close"] > highest: score += 3; reasons.append(f"Rottura sopra massimo {lookback} candele ({highest:.5f})")
    elif last["close"] < lowest: score -= 3; reasons.append(f"Rottura sotto minimo {lookback} candele ({lowest:.5f})")
    if body_ratio > 0.6:
        score += 1 if score > 0 else (-1 if score < 0 else 0)
        reasons.append(f"Candela decisa (corpo {body_ratio*100:.0f}% del range)")
    direction = "BUY" if score >= 4 else "SELL" if score <= -4 else "WAIT"
    conf = min(100, round(abs(score)/5*100))
    return {"dir": direction, "score": score, "conf": conf, "reasons": reasons}

STRATEGIES = {
    "ict": ict_signal, "price_action": price_action_signal, "combined": combined_signal,
    "trend_following": trend_following_signal, "mean_reversion": mean_reversion_signal,
    "breakout": breakout_signal,
}

STRATEGY_CONFIRM_NEED = {
    "trend_following": 5, "mean_reversion": 2, "breakout": 1,
    "ict": 3, "price_action": 3, "combined": 3, "indicators": 3,
}
