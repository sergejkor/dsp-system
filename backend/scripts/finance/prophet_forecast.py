"""
Prophet monthly forecast. Reads JSON from stdin:
  { "history": [ { "ds": "2025-01-01", "y": 123.45 }, ... ], "periods": 12 }

Writes JSON to stdout:
  { "ok": true, "points": [ { "ds", "yhat", "yhat_lower", "yhat_upper", "actual": number|null }, ... ], "engine": "prophet" }
"""
import json
import sys

try:
    import pandas as pd
    from prophet import Prophet
except ImportError as e:
    json.dump({"ok": False, "error": f"missing_dependency: {e}"}, sys.stdout)
    sys.exit(0)


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        json.dump({"ok": False, "error": "empty_stdin"}, sys.stdout)
        return
    inp = json.loads(raw)
    history = inp.get("history") or []
    periods = int(inp.get("periods") or 12)
    if len(history) < 2:
        json.dump({"ok": False, "error": "need_at_least_2_history_points"}, sys.stdout)
        return

    df = pd.DataFrame(history)
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = pd.to_numeric(df["y"], errors="coerce")
    df = df.dropna(subset=["ds", "y"])
    if len(df) < 2:
        json.dump({"ok": False, "error": "not_enough_numeric_points"}, sys.stdout)
        return

    m = Prophet(
        yearly_seasonality=len(df) >= 8,
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode="multiplicative",
    )
    m.fit(df)

    future = m.make_future_dataframe(periods=periods, freq="MS", include_history=True)
    fc = m.predict(future)

    last_hist = df["ds"].max()
    points = []
    hist_map = {
        pd.Timestamp(r["ds"]).strftime("%Y-%m-%d"): float(r["y"])
        for _, r in df.iterrows()
        if pd.notna(r["y"])
    }

    for _, r in fc.iterrows():
        ds = r["ds"]
        ds_key = pd.Timestamp(ds).strftime("%Y-%m-%d")
        actual = hist_map.get(ds_key)
        points.append(
            {
                "ds": ds_key,
                "yhat": float(r["yhat"]),
                "yhat_lower": float(r["yhat_lower"]),
                "yhat_upper": float(r["yhat_upper"]),
                "actual": actual,
                "is_forecast": bool(pd.Timestamp(ds) > last_hist),
            }
        )

    json.dump({"ok": True, "points": points, "engine": "prophet"}, sys.stdout)


if __name__ == "__main__":
    main()
