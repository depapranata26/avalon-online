"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function saveIdentity(code: string, playerId: string, token: string, name: string) {
  try {
    localStorage.setItem(
      `avalon-room-${code}`,
      JSON.stringify({ playerId, token, name })
    );
  } catch {
    /* abaikan */
  }
}

export default function Home() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function createRoom() {
    if (!hostName.trim()) {
      setErr("Isi dulu namamu.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: hostName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal membuat room.");
      saveIdentity(d.code, d.playerId, d.token, hostName.trim());
      router.push(`/room/${d.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal membuat room.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!joinCode.trim() || !joinName.trim()) {
      setErr("Isi kode room dan namamu.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim(), name: joinName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal gabung.");
      saveIdentity(d.code, d.playerId, d.token, joinName.trim());
      router.push(`/room/${d.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal gabung.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-400";
  const btnCls =
    "w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-3 transition";

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <img
          src="/img/hero.jpg"
          alt="Avalon"
          className="w-full h-44 object-cover rounded-2xl border border-amber-900/50 shadow-lg shadow-amber-950/30"
        />
        <h1 className="text-4xl font-black text-center mt-5 tracking-wide text-amber-300">
          AVALON
        </h1>
        <p className="text-center text-slate-400 mt-2 text-sm leading-relaxed">
          Game pengkhianatan ala legenda Raja Arthur.
          <br />
          5–10 pemain · ±30 menit · main bareng dari HP masing-masing.
        </p>

        {err && (
          <div className="mt-4 rounded-xl bg-red-950/70 border border-red-800 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        <div className="mt-6 rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
          <h2 className="font-bold text-lg text-amber-200">🏰 Buat Room Baru</h2>
          <input
            className={`${inputCls} mt-3`}
            placeholder="Namamu (jadi host)"
            value={hostName}
            maxLength={20}
            onChange={(e) => setHostName(e.target.value)}
          />
          <button className={`${btnCls} mt-3`} disabled={busy} onClick={createRoom}>
            {busy ? "Membuat…" : "Buat Room"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
          <h2 className="font-bold text-lg text-amber-200">⚔️ Gabung Room</h2>
          <input
            className={`${inputCls} mt-3 uppercase`}
            placeholder="Kode room (mis. K7X2QA)"
            value={joinCode}
            maxLength={6}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <input
            className={`${inputCls} mt-3`}
            placeholder="Namamu"
            value={joinName}
            maxLength={20}
            onChange={(e) => setJoinName(e.target.value)}
          />
          <button className={`${btnCls} mt-3`} disabled={busy} onClick={joinRoom}>
            {busy ? "Masuk…" : "Gabung"}
          </button>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Satu HP satu pemain · kode room dibagikan ke temanmu
        </p>
      </div>
    </main>
  );
}
