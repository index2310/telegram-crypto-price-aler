export function shortMint(mint) {
  const s = String(mint || "");
  if (s.length <= 10) return s;
  return s.slice(0, 4) + "…" + s.slice(-4);
}

export function fmtUsd(n) {
  if (n === null || n === undefined) return "N/A";
  const num = Number(n);
  if (!Number.isFinite(num)) return "N/A";
  if (num >= 1) return "$" + num.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (num >= 0.01) return "$" + num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return "$" + num.toPrecision(6);
}

export function fmtPct(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "N/A";
  const sign = num > 0 ? "+" : "";
  return sign + num.toFixed(2) + "%";
}
