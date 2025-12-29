// =====================
// KONFIG
// =====================
// Jika halaman ini diakses dari domain worker yang sama, biarkan API_BASE = "".
// Kalau beda domain, isi "https://xxxx.workers.dev"
const API_BASE = "";

// Isi SYNC_KEY sesuai env.SYNC_KEY yang kamu set di Cloudflare Worker
const SYNC_KEY = "ISI_SYNC_KEY_KAMU_DI_SINI";

// =====================
// Helpers
// =====================
const $ = (id) => document.getElementById(id);

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

  // kalau kamu punya field total langsung
  const direct =
    (typeof obj.totalHutang === "number" && obj.totalHutang) ||
    (typeof obj.total === "number" && obj.total) ||
    (typeof obj.hutang === "number" && obj.hutang) ||
    (typeof obj.balance === "number" && obj.balance);

  if (typeof direct === "number") return direct;

  // kalau ada transactions
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
      else sum += amt; // default dianggap menambah
    }
    return sum;
  }

  return NaN;
}

function setStatus(msg, kind = "muted") {
  const box = $("status");
  const text = $("statusText");
  box.style.display = "flex";
  box.classList.remove("ok", "err");
  if (kind === "ok") box.classList.add("ok");
  if (kind === "err") box.classList.add("err");
  text.textContent = msg || "";
}

function hideStatus() {
  $("status").style.display = "none";
  $("statusText").textContent = "";
  $("status").classList.remove("ok", "err");
}

function showResult(obj, key) {
  $("hasil").style.display = "flex";
  $("outJson").textContent = JSON.stringify(obj, null, 2);

  $("outNomor").textContent = obj?.nomor ?? "-";
  $("outKey").textContent = key ? `KV Key: ${key}` : "";

  const total = computeTotalHutang(obj);
  $("outTotal").textContent = isFinite(total) ? formatIDR(total) : "-";

  const updatedAt = obj?.updatedAt ? new Date(obj.updatedAt).toLocaleString("id-ID") : null;
  const schema = obj?.schema ?? null;
  const txCount = Array.isArray(obj?.transactions) ? obj.transactions.length : null;

  const metaParts = [];
  if (schema != null) metaParts.push(`schema: ${schema}`);
  if (txCount != null) metaParts.push(`transactions: ${txCount}`);
  if (updatedAt) metaParts.push(`updated: ${updatedAt}`);

  $("outMeta").textContent = metaParts.join(" • ");
}

function hideResult() {
  $("hasil").style.display = "none";
  $("outJson").textContent = "{}";
  $("outNomor").textContent = "-";
  $("outTotal").textContent = "-";
  $("outMeta").textContent = "";
  $("outKey").textContent = "";
}

// =====================
// API
// =====================
async function fetchKVGet(wa) {
  const url = `${API_BASE}/kv/get?wa=${encodeURIComponent(wa)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Sync-Key": SYNC_KEY,
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    const t = await res.text().catch(() => "");
    throw new Error(`Response bukan JSON. Status ${res.status}. Body: ${t.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.error ? `${data.error}` : `HTTP_${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function ping() {
  try {
    const res = await fetch(`${API_BASE}/ping`);
    const data = await res.json().catch(() => null);
    return res.ok && data?.ok ? data : null;
  } catch {
    return null;
  }
}

// =====================
// UI Logic
// =====================
$("btnMasuk").addEventListener("click", async () => {
  hideResult();

  const raw = $("nomor").value;
  const wa = normWA(raw);

  if (!wa) {
    setStatus("Nomor tidak valid. Harus mulai 08 dan minimal 9 digit.", "err");
    return;
  }

  if (!SYNC_KEY || SYNC_KEY === "ISI_SYNC_KEY_KAMU_DI_SINI") {
    setStatus("SYNC_KEY belum diisi di index.js.", "err");
    return;
  }

  $("btnMasuk").disabled = true;
  setStatus("Mengecek data di KV...", "muted");

  try {
    const resp = await fetchKVGet(wa);

    if (!resp?.success) {
      setStatus("Gagal mengambil data.", "err");
      return;
    }

    if (!resp.found) {
      setStatus(`Data untuk ${wa} tidak ditemukan di KV.`, "err");
      return;
    }

    showResult(resp.value, resp.key);
    setStatus(`Data ditemukan untuk ${wa}.`, "ok");
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("UNAUTHORIZED")) {
      setStatus("UNAUTHORIZED. SYNC_KEY salah / tidak cocok dengan env worker.", "err");
    } else if (msg.includes("WA_INVALID")) {
      setStatus("WA_INVALID. Nomor harus format 08xxxx.", "err");
    } else {
      setStatus(`Error: ${msg}`, "err");
    }
  } finally {
    $("btnMasuk").disabled = false;
  }
});

$("btnReset").addEventListener("click", () => {
  $("nomor").value = "";
  hideResult();
  hideStatus();
});

$("nomor").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btnMasuk").click();
});

// Startup
(async () => {
  const info = await ping();
  if (info) setStatus(`Worker online • ${info.worker}`, "ok");
  else setStatus("Tidak bisa konek ke worker. Cek API_BASE / domain.", "err");
})();
