const { API_BASE, SYNC_KEY } = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);

function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name) || "";
}

function normWA(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits.startsWith("08")) return "";
  if (digits.length < 9) return "";
  return digits;
}

function formatIDR(n) {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);
}

function computeTotalHutang(obj) {
  if (!obj || typeof obj !== "object") return NaN;

  const direct =
    (typeof obj.totalHutang === "number" && obj.totalHutang) ||
    (typeof obj.total === "number" && obj.total) ||
    (typeof obj.hutang === "number" && obj.hutang) ||
    (typeof obj.balance === "number" && obj.balance);

  if (typeof direct === "number") return direct;

  if (Array.isArray(obj.transactions)) {
    let sum = 0;
    for (const t of obj.transactions) {
      const amt = Number(t?.amount);
      if (!isFinite(amt)) continue;

      const type = String(t?.type || "").toLowerCase();
      const isPlus = ["hutang", "debit", "pinjam", "tambah"].includes(type);
      const isMinus = ["bayar", "kredit", "payment", "kurang", "cicil"].includes(type);

      if (isMinus) sum -= amt;
      else if (isPlus) sum += amt;
      else sum += amt;
    }
    return sum;
  }

  return NaN;
}

function setStatus(msg, isErr=false) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (isErr ? " err" : "");
}

async function fetchKVGet(wa) {
  const url = `${API_BASE}/kv/get?wa=${encodeURIComponent(wa)}`;
  const res = await fetch(url, { headers: { "X-Sync-Key": SYNC_KEY } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
  return data;
}

$("btnBack").addEventListener("click", () => history.back());

(async () => {
  const wa = normWA(getParam("wa"));

  if (!wa) {
    $("subtitle").textContent = "Nomor tidak valid.";
    setStatus("Query parameter ?wa=08xxxx tidak valid.", true);
    return;
  }

  if (!SYNC_KEY || SYNC_KEY === "ISI_SYNC_KEY_KAMU_DI_SINI") {
    $("subtitle").textContent = `Nomor: ${wa}`;
    setStatus("SYNC_KEY belum diisi di config.js", true);
    return;
  }

  $("subtitle").textContent = `Nomor: ${wa}`;
  setStatus("Memuat data...");

  try {
    const resp = await fetchKVGet(wa);

    if (!resp?.success) throw new Error("Gagal mengambil data.");
    if (!resp.found) throw new Error("Data tidak ditemukan di KV.");

    const obj = resp.value;

    $("outNomor").textContent = obj?.nomor ?? wa;
    $("outJson").textContent = JSON.stringify(obj, null, 2);

    const total = computeTotalHutang(obj);
    $("outTotal").textContent = isFinite(total) ? formatIDR(total) : "-";

    setStatus("OK");
  } catch (e) {
    setStatus(`Error: ${String(e.message || e)}`, true);
  }
})();
