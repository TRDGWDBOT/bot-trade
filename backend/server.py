
        len(all_candles) > total_count else all_candles
    max_extra_pages = 30
    n_more_pages = min(max_extra_pages, -(-remaining // per_page))
    oldest_epoch = first_page[0]["epoch"]
    ends = [oldest_epoch - granularity - i * per_page * granularity for i in range(n_more_pages)]
    async def _fetch_page(end_epoch: int):
        try:
            h = await client._send({
                "ticks_history": sym, "adjust_start_time": 1, "count": per_page,
                "end": end_epoch, "start": 1, "style": "candles", "granularity": granularity,
            }, timeout=30)
            return h.get("candles") or []
        except Exception as e:
            client.log("W", f"Backtest {sym}: pagina fallita ({e})")
            return []
    pages = await asyncio.gather(*[_fetch_page(e) for e in ends])
    for page in pages: all_candles.extend(page)
    by_epoch = {c["epoch"]: c for c in all_candles}
    merged = sorted(by_epoch.values(), key=lambda c: c["epoch"])
    return merged[-total_count:] if len(merged) > total_count else merged


@app.post("/api/backtest")
async def run_backtest(body: BacktestBody, x_api_key: str = Header(None, alias="X-API-Key")):
    require_auth(x_api_key)
    if not client.authorized or not client.ws:
        raise HTTPException(409, "Il bot deve essere connesso a Deriv per scaricare lo storico")
    sym = body.symbol or client.active_symbol
    count = min(max(body.count, 100), BACKTEST_MAX_CANDLES)
    try:
        raw_candles = await _fetch_candles_paginated(sym, body.granularity, count)
    except Exception as e:
        raise HTTPException(502, f"Errore scaricando lo storico da Deriv: {e}")
    if len(raw_candles) < 100:
        raise HTTPException(502, f"Storico troppo corto ricevuto da Deriv ({len(raw_candles)} candele)")
    candles = [{"open": c["open"], "high": c["high"], "low": c["low"], "close": c["close"]} for c in raw_candles]
    strategy_names = body.strategies or list(strategies.STRATEGIES.keys())
    invalid = [s for s in strategy_names if s not in strategies.STRATEGIES]
    if invalid: raise HTTPException(400, f"strategie non valide: {invalid}")
    report = backtest_engine.run_backtest(
        candles, strategy_names,
        confirm_need=body.confirm_need,
        tp_pct=body.tp_pct or client.auto_tp_pct,
        sl_pct=body.sl_pct or client.auto_sl_pct,
        multiplier=body.multiplier or client.auto_multiplier,
        stake=body.stake or client.auto_stake,
        min_volatility_index=body.min_volatility_index if body.min_volatility_index is not None else client.min_volatility_index,
    )
    report["symbol"] = sym
    report["granularity_sec"] = body.granularity
    report["candles_requested"] = count
    return report


@app.get("/api/trades")
async def get_trades(limit: int = 50, x_api_key: str = Header(None, alias="X-API-Key")):
    require_auth(x_api_key)
    cursor = db.trades.find().sort("opened_at", -1).limit(limit)
    out = []
    async for d in cursor:
        d["id"] = d.pop("_id"); out.append(d)
    return out


@app.post("/api/disconnect")
async def disconnect(x_api_key: str = Header(None, alias="X-API-Key")):
    require_auth(x_api_key)
    await db.config.delete_one({"_id": "main"})
    client.token = None; client.authorized = False
    await client.restart()
    return {"ok": True}
