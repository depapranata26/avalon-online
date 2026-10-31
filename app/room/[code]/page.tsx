"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Phase = "lobby" | "night" | "propose" | "vote" | "quest" | "assassin" | "ended";

interface NightInfo {
  name: string;
  note: string;
}
interface RoleDef {
  id: string;
  name: string;
  team: "baik" | "jahat";
  description: string;
  image: string;
}
interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isMe: boolean;
  isLeader: boolean;
  inTeam: boolean;
  hasVoted: boolean;
  hasQuestVoted: boolean;
  votedApprove: boolean | null;
  role: string | null;
  nightKnowledge: NightInfo[];
}
interface PublicState {
  code: string;
  phase: Phase;
  isStarted: boolean;
  players: PublicPlayer[];
  myId: string | null;
  amHost: boolean;
  amLeader: boolean;
  missionIndex: number;
  missions: ("sukses" | "gagal" | null)[];
  teamSizes: number[];
  currentTeamSize: number;
  failsNeeded: number;
  proposedTeamIds: string[] | null;
  proposedTeamNames: string[] | null;
  voteTrack: number;
  votesComplete: boolean;
  questVotedCount: number;
  questTeamSize: number;
  assassinId: string | null;
  winner: "baik" | "jahat" | null;
  winReason: string | null;
  log: string[];
  myRole: RoleDef | null;
}

interface Identity {
  playerId: string;
  token: string;
  name: string;
}

const ROLE_NAMES: Record<string, string> = {
  merlin: "Merlin",
  percival: "Percival",
  pelayan: "Pelayan Setia",
  assassin: "Assassin",
  morgana: "Morgana",
  mordred: "Mordred",
  oberon: "Oberon",
  antek: "Antek Mordred",
};

function teamColor(team: string | null) {
  return team === "jahat" ? "text-red-400" : team === "baik" ? "text-sky-300" : "text-slate-300";
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code ?? "").toUpperCase();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [assassinTarget, setAssassinTarget] = useState("");
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const [connBad, setConnBad] = useState(false);
  const identityRef = useRef<Identity | null>(null);
  identityRef.current = identity;

  // muat identitas dari HP ini
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`avalon-room-${code}`);
      if (raw) setIdentity(JSON.parse(raw));
    } catch {
      /* abaikan */
    }
  }, [code]);

  const fetchState = useCallback(async () => {
    const id = identityRef.current;
    try {
      const url = `/api/rooms/${code}/state${id ? `?playerId=${id.playerId}&token=${encodeURIComponent(id.token)}` : ""}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("room tidak ditemukan");
      const d = (await r.json()) as PublicState;
      setState(d);
      setLastPoll(Date.now());
      setConnBad(false);
    } catch {
      setConnBad(true);
    }
  }, [code]);

  useEffect(() => {
    fetchState();
    const t = setInterval(fetchState, 2000);
    return () => clearInterval(t);
  }, [fetchState]);

  // reset pilihan tim tiap ganti misi/fase
  useEffect(() => {
    setSelected([]);
  }, [state?.missionIndex, state?.phase]);

  async function action(kind: string, extra: Record<string, unknown> = {}) {
    const id = identityRef.current;
    if (!id) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/rooms/${code}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: id.playerId, token: id.token, kind, ...extra }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Aksi gagal.");
      setState(d as PublicState);
      setLastPoll(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function joinInline() {
    if (!joinName.trim()) {
      setErr("Isi dulu namamu.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: joinName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal gabung.");
      const idt = { playerId: d.playerId, token: d.token, name: joinName.trim() };
      localStorage.setItem(`avalon-room-${code}`, JSON.stringify(idt));
      setIdentity(idt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal gabung.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-400";
  const btnGold =
    "w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-3 transition";
  const btnGhost =
    "w-full rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold px-4 py-3 transition border border-slate-700";

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (!state || prev.length >= state.currentTeamSize) return prev;
      return [...prev, id];
    });
  }

  const me = state?.players.find((p) => p.isMe);
  const knownEvilNames = new Set(
    (me?.nightKnowledge ?? []).filter((k) => k.note.includes("Kawan jahat")).map((k) => k.name)
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-md">
        {/* header status */}
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
          <span>
            {connBad ? "🔴 koneksi bermasalah" : "🟢 terhubung"}
            {lastPoll ? ` · ${new Date(lastPoll).toLocaleTimeString("id-ID")}` : ""}
          </span>
          <button
            className="underline"
            onClick={() => {
              if (confirm("Keluar dari room di HP ini?")) {
                localStorage.removeItem(`avalon-room-${code}`);
                router.push("/");
              }
            }}
          >
            keluar
          </button>
        </div>

        {err && (
          <div className="mb-4 rounded-xl bg-red-950/70 border border-red-800 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {!state && (
          <div className="text-center text-slate-400 mt-16">Memuat room…</div>
        )}

        {/* belum punya identitas di HP ini -> form gabung */}
        {state && !identity && state.phase === "lobby" && (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
            <h2 className="font-bold text-lg text-amber-200">Gabung ke room {code}</h2>
            <p className="text-sm text-slate-400 mt-1">
              {state.players.length} pemain sudah di dalam.
            </p>
            <input
              className={`${inputCls} mt-3`}
              placeholder="Namamu"
              maxLength={20}
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
            />
            <button className={`${btnGold} mt-3`} disabled={busy} onClick={joinInline}>
              {busy ? "Masuk…" : "Gabung"}
            </button>
          </div>
        )}

        {state && !identity && state.phase !== "lobby" && (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 text-center text-slate-400 text-sm">
            Permainan sudah dimulai dan HP ini belum terdaftar sebagai pemain.
            <br />
            Minta host mengulang dari awal di room baru.
          </div>
        )}

        {state && identity && (
          <>
            <MissionTracker state={state} />

            {state.phase === "lobby" && (
              <LobbyView
                state={state}
                busy={busy}
                onStart={() => action("start")}
                btnGold={btnGold}
              />
            )}

            {state.phase === "night" && (
              <NightView
                state={state}
                me={me}
                busy={busy}
                onDone={() => action("night_done")}
                btnGold={btnGold}
              />
            )}

            {(state.phase === "propose" || state.phase === "vote" || state.phase === "quest") && (
              <GameView
                state={state}
                me={me}
                busy={busy}
                selected={selected}
                toggleSelect={toggleSelect}
                onPropose={() => action("propose", { memberIds: selected })}
                onVote={(approve: boolean) => action("vote", { approve })}
                onQuest={(success: boolean) => action("quest", { success })}
                btnGold={btnGold}
                btnGhost={btnGhost}
              />
            )}

            {state.phase === "assassin" && (
              <AssassinView
                state={state}
                me={me}
                busy={busy}
                target={assassinTarget}
                setTarget={setAssassinTarget}
                knownEvilNames={knownEvilNames}
                onFire={() => action("assassinate", { targetId: assassinTarget })}
                btnGold={btnGold}
                inputCls={inputCls}
              />
            )}

            {state.phase === "ended" && (
              <EndedView state={state} onAgain={() => router.push("/")} btnGold={btnGold} />
            )}

            <details className="mt-5 rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
              <summary className="text-sm text-slate-400 cursor-pointer">
                📜 Catatan permainan
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-500 max-h-48 overflow-y-auto">
                {state.log.map((l, i) => (
                  <li key={i}>• {l}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </main>
  );
}

/* ---------------------------------------------------------- komponen */

function MissionTracker({ state }: { state: PublicState }) {
  if (!state.isStarted) return null;
  return (
    <div className="flex justify-center gap-2 mb-5">
      {state.missions.map((m, i) => {
        const active = i === state.missionIndex && state.phase !== "ended";
        const bg = m === "sukses" ? "bg-emerald-500" : m === "gagal" ? "bg-red-500" : "bg-slate-800";
        return (
          <div
            key={i}
            className={`${bg} ${active ? "ring-2 ring-amber-300" : ""} w-12 h-12 rounded-full flex flex-col items-center justify-center border border-slate-700`}
          >
            <span className="text-[10px] text-slate-300 leading-none">M{i + 1}</span>
            <span className="text-sm font-bold leading-none">
              {state.teamSizes[i] ?? "?"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PlayerRow({ p, showRole }: { p: PublicPlayer; showRole?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-800/60 border border-slate-700/60 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate font-medium">
          {p.name}
          {p.isMe && <span className="text-amber-300 text-xs"> (kamu)</span>}
        </span>
        {p.isHost && <span title="Host">👑</span>}
        {p.isLeader && <span title="Ketua">🎖️</span>}
        {p.inTeam && <span title="Tim misi">🛡️</span>}
      </div>
      <div className="text-xs text-slate-400 shrink-0 ml-2">
        {showRole && p.role ? (
          <span className={teamColor(p.role === "merlin" || p.role === "percival" || p.role === "pelayan" ? "baik" : "jahat")}>
            {ROLE_NAMES[p.role] ?? p.role}
          </span>
        ) : (
          <>
            {p.hasVoted && p.votedApprove === null && <span>🗳️</span>}
            {p.votedApprove === true && <span className="text-emerald-300">Setuju</span>}
            {p.votedApprove === false && <span className="text-red-300">Tolak</span>}
            {p.hasQuestVoted && <span>⚔️</span>}
          </>
        )}
      </div>
    </div>
  );
}

function LobbyView({
  state,
  busy,
  onStart,
  btnGold,
}: {
  state: PublicState;
  busy: boolean;
  onStart: () => void;
  btnGold: string;
}) {
  const canStart = state.players.length >= 5 && state.players.length <= 10;
  function copyCode() {
    try {
      navigator.clipboard.writeText(state.code);
      alert(`Kode ${state.code} disalin!`);
    } catch {
      /* abaikan */
    }
  }
  return (
    <div>
      <div className="text-center">
        <div className="text-xs text-slate-500">KODE ROOM</div>
        <button
          onClick={copyCode}
          className="text-5xl font-black tracking-[0.2em] text-amber-300 mt-1"
          title="Ketuk untuk salin"
        >
          {state.code}
        </button>
        <div className="text-xs text-slate-500 mt-1">ketuk kode untuk menyalin</div>
      </div>
      <div className="mt-5 space-y-2">
        {state.players.map((p) => (
          <PlayerRow key={p.id} p={p} />
        ))}
      </div>
      <div className="text-center text-sm text-slate-400 mt-3">
        {state.players.length}/10 pemain
        {state.players.length < 5 && " — butuh minimal 5 untuk mulai"}
      </div>
      {state.amHost ? (
        <button className={`${btnGold} mt-4`} disabled={busy || !canStart} onClick={onStart}>
          {busy ? "Memulai…" : "🚀 Mulai Permainan"}
        </button>
      ) : (
        <div className="text-center text-sm text-slate-500 mt-4">
          Menunggu host ({state.players.find((p) => p.isHost)?.name}) memulai…
        </div>
      )}
    </div>
  );
}

function NightView({
  state,
  me,
  busy,
  onDone,
  btnGold,
}: {
  state: PublicState;
  me: PublicPlayer | undefined;
  busy: boolean;
  onDone: () => void;
  btnGold: string;
}) {
  const role = state.myRole;
  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 text-center">
      <div className="text-sm text-slate-500">🌙 Fase Malam — rahasiakan layarmu!</div>
      {role && (
        <>
          <img
            src={role.image}
            alt={role.name}
            className="w-40 h-52 object-cover rounded-2xl mx-auto mt-4 border-2 border-amber-500/60 shadow-lg shadow-amber-950/40"
          />
          <h2 className={`text-2xl font-black mt-3 ${teamColor(role.team)}`}>
            {role.name}
          </h2>
          <div className="text-xs text-slate-500 mt-1">
            Kubu {role.team === "baik" ? "BAIK 🕊️" : "JAHAT 🗡️"}
          </div>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">{role.description}</p>
        </>
      )}
      {me && me.nightKnowledge.length > 0 && (
        <div className="mt-4 rounded-xl bg-slate-800/70 border border-slate-700 p-3 text-left">
          <div className="text-xs font-bold text-amber-200 mb-2">👁️ YANG KAMU KETAHUI</div>
          {me.nightKnowledge.map((k, i) => (
            <div key={i} className="text-sm py-1 border-b border-slate-700/50 last:border-0">
              <span className="font-semibold text-white">{k.name}</span>
              <span className="text-slate-400"> — {k.note}</span>
            </div>
          ))}
        </div>
      )}
      {me && me.nightKnowledge.length === 0 && (
        <div className="mt-4 text-sm text-slate-500 italic">
          Kamu tidak mengenali siapa pun malam ini. Percayai instingmu.
        </div>
      )}
      <button className={`${btnGold} mt-5`} disabled={busy} onClick={onDone}>
        {busy ? "…" : "✅ Saya sudah melihat peran saya"}
      </button>
      <div className="text-xs text-slate-500 mt-2">
        Game lanjut saat semua pemain menekan tombol ini.
      </div>
    </div>
  );
}

function GameView({
  state,
  me,
  busy,
  selected,
  toggleSelect,
  onPropose,
  onVote,
  onQuest,
  btnGold,
  btnGhost,
}: {
  state: PublicState;
  me: PublicPlayer | undefined;
  busy: boolean;
  selected: string[];
  toggleSelect: (id: string) => void;
  onPropose: () => void;
  onVote: (approve: boolean) => void;
  onQuest: (success: boolean) => void;
  btnGold: string;
  btnGhost: string;
}) {
  const leaderName = state.players.find((p) => p.isLeader)?.name ?? "?";
  const myVote: PublicPlayer | undefined = me;

  return (
    <div>
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
        <div className="text-sm">
          <span className="text-slate-400">Misi {state.missionIndex + 1}</span>
          <span className="text-slate-600"> · </span>
          <span className="text-amber-200 font-semibold">
            butuh {state.currentTeamSize} orang
          </span>
          {state.failsNeeded > 1 && (
            <span className="text-red-300"> · butuh {state.failsNeeded} Gagal untuk menggagalkan</span>
          )}
        </div>
        <div className="text-sm text-slate-400 mt-1">
          🎖️ Ketua: <span className="text-white font-semibold">{leaderName}</span>
          {state.voteTrack > 0 && (
            <span className="text-red-300"> · penolakan beruntun: {state.voteTrack}/5</span>
          )}
        </div>
      </div>

      {/* PROPOSE */}
      {state.phase === "propose" && (
        <div className="mt-4">
          {state.amLeader ? (
            <div className="rounded-2xl bg-slate-900/70 border border-amber-800/60 p-4">
              <div className="font-bold text-amber-200">
                Kamu ketuanya! Pilih {state.currentTeamSize} anggota tim:
              </div>
              <div className="mt-3 space-y-2">
                {state.players.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleSelect(p.id)}
                      className={`w-full text-left rounded-xl border px-3 py-2 transition ${
                        on
                          ? "bg-amber-500/20 border-amber-400"
                          : "bg-slate-800/60 border-slate-700"
                      }`}
                    >
                      <span className="mr-2">{on ? "✅" : "⬜"}</span>
                      {p.name}
                      {p.isMe && <span className="text-amber-300 text-xs"> (kamu)</span>}
                    </button>
                  );
                })}
              </div>
              <button
                className={`${btnGold} mt-4`}
                disabled={busy || selected.length !== state.currentTeamSize}
                onClick={onPropose}
              >
                {busy ? "Mengajukan…" : `⚔️ Ajukan Tim (${selected.length}/${state.currentTeamSize})`}
              </button>
            </div>
          ) : (
            <div className="text-center text-slate-400 text-sm mt-4">
              Menunggu <span className="text-white font-semibold">{leaderName}</span> menyusun
              tim misi {state.missionIndex + 1}…
            </div>
          )}
        </div>
      )}

      {/* VOTE */}
      {state.phase === "vote" && (
        <div className="mt-4 rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
          <div className="font-bold text-amber-200">🗳️ Voting tim</div>
          <div className="text-sm text-slate-300 mt-2">
            Tim usulan:{" "}
            <span className="font-semibold text-white">
              {state.proposedTeamNames?.join(", ")}
            </span>
          </div>
          {!myVote?.hasVoted ? (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-bold px-4 py-3"
                disabled={busy}
                onClick={() => onVote(true)}
              >
                👍 Setuju
              </button>
              <button
                className="rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 font-bold px-4 py-3"
                disabled={busy}
                onClick={() => onVote(false)}
              >
                👎 Tolak
              </button>
            </div>
          ) : !state.votesComplete ? (
            <div className="text-sm text-slate-400 mt-3 text-center">
              Sudah voting. Menunggu{" "}
              {state.players.length - state.players.filter((p) => p.hasVoted).length} pemain
              lain…
            </div>
          ) : null}
          <div className="mt-4 space-y-2">
            {state.players.map((p) => (
              <PlayerRow key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {/* QUEST */}
      {state.phase === "quest" && (
        <div className="mt-4 rounded-2xl bg-slate-900/70 border border-slate-800 p-4">
          <div className="font-bold text-amber-200">⚔️ Misi {state.missionIndex + 1} berjalan</div>
          <div className="text-sm text-slate-300 mt-2">
            Tim:{" "}
            <span className="font-semibold text-white">
              {state.proposedTeamNames?.join(", ")}
            </span>
          </div>
          {me?.inTeam && !me.hasQuestVoted ? (
            <div className="mt-4">
              <div className="text-sm text-slate-400 mb-2 text-center">
                Pilihanmu <b>rahasia</b> — tidak ada yang tahu kamu pilih apa.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-bold px-4 py-3"
                  disabled={busy}
                  onClick={() => onQuest(true)}
                >
                  ✅ Sukses
                </button>
                <button
                  className="rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 font-bold px-4 py-3 disabled:cursor-not-allowed"
                  disabled={busy || state.myRole?.team === "baik"}
                  onClick={() => onQuest(false)}
                  title={
                    state.myRole?.team === "baik"
                      ? "Kubu baik tidak bisa menggagalkan misi"
                      : undefined
                  }
                >
                  ❌ Gagal
                </button>
              </div>
              {state.myRole?.team === "baik" && (
                <div className="text-xs text-slate-500 mt-2 text-center">
                  Kamu kubu baik — tombol Gagal dikunci untukmu.
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400 mt-3 text-center">
              {me?.inTeam
                ? "Pilihanmu terkunci. Menunggu anggota tim lain…"
                : "Menunggu tim misi menyelesaikan misinya…"}
              <div className="mt-1">
                {state.questVotedCount}/{state.questTeamSize} sudah memilih
              </div>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {state.players
              .filter((p) => p.inTeam)
              .map((p) => (
                <PlayerRow key={p.id} p={p} />
              ))}
          </div>
        </div>
      )}

      {/* daftar pemain selalu terlihat */}
      {state.phase !== "vote" && state.phase !== "quest" && (
        <div className="mt-4 space-y-2">
          {state.players.map((p) => (
            <PlayerRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssassinView({
  state,
  me,
  busy,
  target,
  setTarget,
  knownEvilNames,
  onFire,
  btnGold,
  inputCls,
}: {
  state: PublicState;
  me: PublicPlayer | undefined;
  busy: boolean;
  target: string;
  setTarget: (v: string) => void;
  knownEvilNames: Set<string>;
  onFire: () => void;
  btnGold: string;
  inputCls: string;
}) {
  const iAmAssassin = state.assassinId === me?.id;
  const candidates = state.players.filter((p) => !knownEvilNames.has(p.name));
  return (
    <div className="rounded-2xl bg-red-950/40 border border-red-800/60 p-5 text-center">
      <div className="text-2xl">🗡️</div>
      <h2 className="font-black text-xl text-red-300 mt-2">Fase Assassin</h2>
      <p className="text-sm text-slate-300 mt-2 leading-relaxed">
        Kubu baik memenangkan 3 misi. Tapi kemenangan bisa dirampok —
        <b> temukan dan bunuh Merlin!</b>
      </p>
      {iAmAssassin ? (
        <div className="mt-4 text-left">
          <label className="text-sm text-slate-400">
            Kamu sang Assassin. Siapa Merlin?
          </label>
          <select
            className={`${inputCls} mt-2`}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">— pilih target —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isMe ? " (kamu)" : ""}
              </option>
            ))}
          </select>
          <button
            className={`${btnGold} mt-3`}
            disabled={busy || !target}
            onClick={onFire}
          >
            {busy ? "…" : "🔪 Bunuh Merlin!"}
          </button>
          <div className="text-xs text-slate-500 mt-2">
            Salah tebak = kubu baik menang mutlak.
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-400 mt-4">
          Assassin sedang membidik… tahan napas. 😬
        </div>
      )}
    </div>
  );
}

function EndedView({
  state,
  onAgain,
  btnGold,
}: {
  state: PublicState;
  onAgain: () => void;
  btnGold: string;
}) {
  const good = state.winner === "baik";
  return (
    <div className="text-center">
      <div className="text-5xl">{good ? "🕊️" : "🗡️"}</div>
      <h2 className={`text-3xl font-black mt-2 ${good ? "text-sky-300" : "text-red-400"}`}>
        {good ? "KUBU BAIK MENANG!" : "KUBU JAHAT MENANG!"}
      </h2>
      {state.winReason && (
        <p className="text-sm text-slate-300 mt-2">{state.winReason}</p>
      )}
      <div className="mt-5 text-left">
        <div className="text-xs font-bold text-slate-500 mb-2">🎭 SEMUA PERAN TERBUKA</div>
        <div className="space-y-2">
          {state.players.map((p) => (
            <PlayerRow key={p.id} p={p} showRole />
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {state.missions.map((m, i) => (
          <div
            key={i}
            className={`${m === "sukses" ? "bg-emerald-500" : "bg-red-500"} w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold`}
          >
            M{i + 1}
          </div>
        ))}
      </div>
      <button className={`${btnGold} mt-6`} onClick={onAgain}>
        🔄 Main Lagi (room baru)
      </button>
    </div>
  );
}
