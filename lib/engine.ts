/**
 * Avalon (The Resistance: Avalon) — pure game logic.
 *
 * Tidak ada dependensi apa pun (no KV, no DOM, no Node imports) sehingga
 * bisa di-unit-test langsung dan dipakai di route handler maupun client.
 * Semua fungsi pure: terima state, kembalikan state baru (immutable-ish).
 */

// ---------------------------------------------------------------- types

export type RoleId =
  | "merlin"
  | "percival"
  | "pelayan"
  | "assassin"
  | "morgana"
  | "mordred"
  | "oberon"
  | "antek";

export type Team = "baik" | "jahat";

export type Phase =
  | "lobby"
  | "night"
  | "propose"
  | "vote"
  | "quest"
  | "assassin"
  | "ended";

export type MissionResult = "sukses" | "gagal";

export interface RoleDef {
  id: RoleId;
  name: string;
  team: Team;
  description: string;
  image: string;
}

export interface Player {
  id: string;
  name: string;
  token: string;
  role: RoleId | null;
  team: Team | null;
  isHost: boolean;
}

export interface GameState {
  code: string;
  phase: Phase;
  players: Player[];
  missionIndex: number; // 0..4, misi yang sedang berjalan
  missions: (MissionResult | null)[]; // panjang 5
  leaderIndex: number; // index ke players
  proposedTeam: string[] | null; // player ids
  votes: Record<string, boolean> | null; // playerId -> setuju?
  voteTrack: number; // voting tim ditolak beruntun (0..4); 5 = jahat menang
  questVotes: Record<string, boolean> | null; // playerId -> sukses? (hanya tim misi)
  nightReady: Record<string, boolean>; // playerId -> sudah lihat role
  assassinTarget: string | null;
  winner: Team | null;
  winReason: string | null;
  log: string[];
  createdAt: number;
}

export type EngineError = { error: string };
export type EngineResult<T> = { ok: true; value: T } | { ok: false } & EngineError;

// ------------------------------------------------------- static tables

export const ROLE_DEFS: Record<RoleId, RoleDef> = {
  merlin: {
    id: "merlin",
    name: "Merlin",
    team: "baik",
    description:
      "Penyihir agung. Kamu tahu siapa para pengkhianat — tapi harus sembunyi. Kalau Assassin menemukanmu di akhir, kubu baik kalah.",
    image: "/img/roles/merlin.jpg",
  },
  percival: {
    id: "percival",
    name: "Percival",
    team: "baik",
    description:
      "Ksatria setia. Kamu melihat dua kandidat Merlin — satu asli, satu Morgana yang menyamar. Lindungi Merlin yang asli.",
    image: "/img/roles/percival.jpg",
  },
  pelayan: {
    id: "pelayan",
    name: "Pelayan Setia",
    team: "baik",
    description:
      "Pelayan setia Raja Arthur. Kamu tidak tahu siapa-siapa — andalkan insting dan perhatikan voting orang lain.",
    image: "/img/roles/pelayan.jpg",
  },
  assassin: {
    id: "assassin",
    name: "Assassin",
    team: "jahat",
    description:
      "Pembunuh bayaran Mordred. Kamu tahu semua kawan jahatmu. Kalau kubu baik menang 3 misi, kamu dapat satu tebakan: bunuh Merlin dan kemenangan jadi milikmu.",
    image: "/img/roles/assassin.jpg",
  },
  morgana: {
    id: "morgana",
    name: "Morgana",
    team: "jahat",
    description:
      "Penyihir jahat yang menyamar sebagai Merlin di mata Percival. Manfaatkan kebingungan itu.",
    image: "/img/roles/morgana.jpg",
  },
  mordred: {
    id: "mordred",
    name: "Mordred",
    team: "jahat",
    description:
      "Tak terlihat oleh Merlin. Satu-satunya antek yang bahkan sang penyihir agung tidak bisa deteksi.",
    image: "/img/roles/mordred.jpg",
  },
  oberon: {
    id: "oberon",
    name: "Oberon",
    team: "jahat",
    description:
      "Agen ganda misterius — bahkan kawan jahatmu sendiri tidak mengenalmu, dan kamu tidak mengenal mereka.",
    image: "/img/roles/oberon.jpg",
  },
  antek: {
    id: "antek",
    name: "Antek Mordred",
    team: "jahat",
    description:
      "Pengikut setia Mordred. Kamu tahu semua kawan jahatmu (kecuali Oberon). Gagalkan misi diam-diam.",
    image: "/img/roles/antek.jpg",
  },
};

/** Komposisi role per jumlah pemain: [baik..., jahat...] */
export const ROLE_TABLE: Record<number, RoleId[]> = {
  5: ["merlin", "percival", "pelayan", "assassin", "morgana"],
  6: ["merlin", "percival", "pelayan", "pelayan", "assassin", "morgana"],
  7: ["merlin", "percival", "pelayan", "pelayan", "assassin", "morgana", "antek"],
  8: [
    "merlin",
    "percival",
    "pelayan",
    "pelayan",
    "pelayan",
    "assassin",
    "morgana",
    "antek",
  ],
  9: [
    "merlin",
    "percival",
    "pelayan",
    "pelayan",
    "pelayan",
    "pelayan",
    "assassin",
    "morgana",
    "mordred",
  ],
  10: [
    "merlin",
    "percival",
    "pelayan",
    "pelayan",
    "pelayan",
    "pelayan",
    "assassin",
    "morgana",
    "mordred",
    "oberon",
  ],
};

/** Ukuran tim per misi (index 0..4) per jumlah pemain */
export const TEAM_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 5;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa 0/O/1/I

// -------------------------------------------------------------- helpers

function randId(rng: () => number): string {
  let s = "";
  for (let i = 0; i < 12; i++)
    s += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return s;
}

export function makeRoomCode(rng: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++)
    s += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return s;
}

/** Token 32 char acak. Pakai WebCrypto bila ada, fallback Math.random. */
export function makeToken(rng: () => number = Math.random): string {
  const CH =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  try {
    const g: unknown =
      typeof globalThis !== "undefined"
        ? (globalThis as Record<string, unknown>).crypto
        : undefined;
    const c = g as
      | { getRandomValues?: (a: Uint8Array) => Uint8Array }
      | undefined;
    if (c && typeof c.getRandomValues === "function") {
      const buf = new Uint8Array(32);
      c.getRandomValues(buf);
      for (let i = 0; i < 32; i++) s += CH[buf[i] % CH.length];
      return s;
    }
  } catch {
    /* abaikan, pakai fallback */
  }
  for (let i = 0; i < 32; i++)
    s += CH[Math.floor(rng() * CH.length)];
  return s;
}

export function shuffled<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clone(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p })),
    missions: [...s.missions],
    proposedTeam: s.proposedTeam ? [...s.proposedTeam] : null,
    votes: s.votes ? { ...s.votes } : null,
    questVotes: s.questVotes ? { ...s.questVotes } : null,
    nightReady: { ...s.nightReady },
    log: [...s.log],
  };
}

function pushLog(s: GameState, msg: string): void {
  s.log.push(msg);
  if (s.log.length > 60) s.log = s.log.slice(-60);
}

export function teamSizeFor(nPlayers: number, missionIndex: number): number {
  return TEAM_SIZES[nPlayers][missionIndex];
}

/** Berapa kartu Gagal yang dibutuhkan agar misi gagal */
export function failsNeeded(nPlayers: number, missionIndex: number): number {
  return nPlayers >= 7 && missionIndex === 3 ? 2 : 1;
}

function findPlayer(s: GameState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id);
}

function leader(s: GameState): Player {
  return s.players[s.leaderIndex % s.players.length];
}

// ------------------------------------------------------------------ API

export function createRoom(
  code: string,
  hostName: string,
  rng: () => number = Math.random
): EngineResult<{ state: GameState; playerId: string; token: string }> {
  const name = hostName.trim().slice(0, 20);
  if (!name) return { ok: false, error: "Nama tidak boleh kosong." };
  const playerId = randId(rng);
  const token = makeToken(rng);
  const state: GameState = {
    code,
    phase: "lobby",
    players: [
      { id: playerId, name, token, role: null, team: null, isHost: true },
    ],
    missionIndex: 0,
    missions: [null, null, null, null, null],
    leaderIndex: 0,
    proposedTeam: null,
    votes: null,
    voteTrack: 0,
    questVotes: null,
    nightReady: {},
    assassinTarget: null,
    winner: null,
    winReason: null,
    log: [`Ruang ${code} dibuat oleh ${name}.`],
    createdAt: Date.now(),
  };
  return { ok: true, value: { state, playerId, token } };
}

export function joinRoom(
  s: GameState,
  name: string,
  rng: () => number = Math.random
): EngineResult<{ state: GameState; playerId: string; token: string }> {
  const clean = name.trim().slice(0, 20);
  if (!clean) return { ok: false, error: "Nama tidak boleh kosong." };
  if (s.phase !== "lobby")
    return { ok: false, error: "Permainan sudah dimulai." };
  if (s.players.length >= MAX_PLAYERS)
    return { ok: false, error: "Ruang sudah penuh (10 pemain)." };
  if (
    s.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())
  )
    return { ok: false, error: "Nama sudah dipakai, pilih nama lain." };
  const ns = clone(s);
  const playerId = randId(rng);
  const token = makeToken(rng);
  ns.players.push({
    id: playerId,
    name: clean,
    token,
    role: null,
    team: null,
    isHost: false,
  });
  pushLog(ns, `${clean} bergabung (${ns.players.length}/${MAX_PLAYERS}).`);
  return { ok: true, value: { state: ns, playerId, token } };
}

export function startGame(
  s: GameState,
  playerId: string,
  rng: () => number = Math.random
): EngineResult<GameState> {
  const p = findPlayer(s, playerId);
  if (!p) return { ok: false, error: "Pemain tidak dikenal." };
  if (!p.isHost) return { ok: false, error: "Hanya host yang bisa memulai." };
  if (s.phase !== "lobby")
    return { ok: false, error: "Permainan sudah dimulai." };
  const n = s.players.length;
  if (n < MIN_PLAYERS)
    return { ok: false, error: `Butuh minimal ${MIN_PLAYERS} pemain.` };
  if (n > MAX_PLAYERS)
    return { ok: false, error: `Maksimal ${MAX_PLAYERS} pemain.` };
  const ns = clone(s);
  const roles = shuffled(ROLE_TABLE[n], rng);
  ns.players.forEach((pl, i) => {
    pl.role = roles[i];
    pl.team = ROLE_DEFS[roles[i]].team;
  });
  ns.phase = "night";
  ns.nightReady = {};
  ns.leaderIndex = Math.floor(rng() * n);
  pushLog(ns, `Permainan dimulai! ${n} pemain. Malam tiba — lihat peran rahasiamu.`);
  return { ok: true, value: ns };
}

/** Pemain menandai sudah melihat role-nya di fase malam. */
export function nightDone(
  s: GameState,
  playerId: string
): EngineResult<GameState> {
  if (s.phase !== "night")
    return { ok: false, error: "Bukan fase malam." };
  if (!findPlayer(s, playerId))
    return { ok: false, error: "Pemain tidak dikenal." };
  const ns = clone(s);
  ns.nightReady[playerId] = true;
  if (s.players.every((p) => ns.nightReady[p.id])) {
    ns.phase = "propose";
    pushLog(
      ns,
      `Semua sudah melihat perannya. ${leader(ns).name} menjadi ketua pertama — susun tim misi 1.`
    );
  }
  return { ok: true, value: ns };
}

export function proposeTeam(
  s: GameState,
  playerId: string,
  memberIds: string[]
): EngineResult<GameState> {
  if (s.phase !== "propose")
    return { ok: false, error: "Bukan waktunya mengusulkan tim." };
  if (leader(s).id !== playerId)
    return { ok: false, error: "Hanya ketua yang bisa mengusulkan tim." };
  const need = teamSizeFor(s.players.length, s.missionIndex);
  if (memberIds.length !== need)
    return { ok: false, error: `Tim misi ini harus berisi ${need} orang.` };
  const ids = new Set(memberIds);
  if (ids.size !== memberIds.length)
    return { ok: false, error: "Ada nama ganda di tim." };
  for (const id of memberIds)
    if (!findPlayer(s, id))
      return { ok: false, error: "Ada anggota tim yang tidak dikenal." };
  const ns = clone(s);
  ns.proposedTeam = [...memberIds];
  ns.votes = {};
  ns.phase = "vote";
  const names = memberIds.map((id) => findPlayer(ns, id)!.name).join(", ");
  pushLog(
    ns,
    `${leader(ns).name} mengusulkan tim misi ${s.missionIndex + 1}: ${names}.`
  );
  return { ok: true, value: ns };
}

export function vote(
  s: GameState,
  playerId: string,
  approve: boolean
): EngineResult<GameState> {
  if (s.phase !== "vote")
    return { ok: false, error: "Bukan waktunya voting." };
  const p = findPlayer(s, playerId);
  if (!p) return { ok: false, error: "Pemain tidak dikenal." };
  if (s.votes && playerId in s.votes)
    return { ok: false, error: "Kamu sudah voting." };
  const ns = clone(s);
  ns.votes = { ...(ns.votes ?? {}), [playerId]: approve };

  if (Object.keys(ns.votes).length < ns.players.length)
    return { ok: true, value: ns }; // tunggu yang lain

  const approves = Object.values(ns.votes).filter(Boolean).length;
  const majority = Math.floor(ns.players.length / 2) + 1;
  if (approves >= majority) {
    ns.phase = "quest";
    ns.questVotes = {};
    ns.voteTrack = 0; // penolakan beruntun direset setiap tim disetujui (aturan resmi: jahat menang hanya bila 5x DITOLAK BERUNTUN)
    pushLog(ns, `Tim disetujui ${approves}-${ns.players.length - approves}. Misi ${ns.missionIndex + 1} berjalan!`);
  } else {
    ns.voteTrack += 1;
    pushLog(
      ns,
      `Tim ditolak ${approves}-${ns.players.length - approves}. (Penolakan beruntun: ${ns.voteTrack}/5)`
    );
    if (ns.voteTrack >= 5) {
      ns.phase = "ended";
      ns.winner = "jahat";
      ns.winReason =
        "Tim ditolak 5 kali beruntun — kubu jahat menang otomatis!";
      pushLog(ns, ns.winReason);
    } else {
      ns.leaderIndex = (ns.leaderIndex + 1) % ns.players.length;
      ns.phase = "propose";
      ns.proposedTeam = null;
      ns.votes = null;
      pushLog(ns, `Kepemimpinan pindah ke ${leader(ns).name}.`);
    }
  }
  return { ok: true, value: ns };
}

export function questVote(
  s: GameState,
  playerId: string,
  success: boolean
): EngineResult<GameState> {
  if (s.phase !== "quest")
    return { ok: false, error: "Bukan waktunya misi." };
  const p = findPlayer(s, playerId);
  if (!p) return { ok: false, error: "Pemain tidak dikenal." };
  if (!s.proposedTeam || !s.proposedTeam.includes(playerId))
    return { ok: false, error: "Kamu tidak ikut misi ini." };
  if (s.questVotes && playerId in s.questVotes)
    return { ok: false, error: "Kamu sudah memilih." };
  if (p.team === "baik" && !success)
    return {
      ok: false,
      error: "Kubu baik tidak bisa menggagalkan misi!",
    };
  const ns = clone(s);
  ns.questVotes = { ...(ns.questVotes ?? {}), [playerId]: success };

  if (Object.keys(ns.questVotes).length < (ns.proposedTeam?.length ?? 0))
    return { ok: true, value: ns }; // tunggu anggota tim lain

  const fails = Object.values(ns.questVotes).filter((v) => !v).length;
  const need = failsNeeded(ns.players.length, ns.missionIndex);
  const result: MissionResult = fails >= need ? "gagal" : "sukses";
  ns.missions[ns.missionIndex] = result;
  pushLog(
    ns,
    `Misi ${ns.missionIndex + 1}: ${result === "sukses" ? "SUKSES ✅" : "GAGAL ❌"} (${fails} gagal, butuh ${need} untuk gagal).`
  );

  const sukses = ns.missions.filter((m) => m === "sukses").length;
  const gagal = ns.missions.filter((m) => m === "gagal").length;
  if (sukses >= 3) {
    ns.phase = "assassin";
    pushLog(ns, "Kubu baik memenangkan 3 misi! Assassin, inilah saat terakhirmu — temukan Merlin!");
  } else if (gagal >= 3) {
    ns.phase = "ended";
    ns.winner = "jahat";
    ns.winReason = "3 misi gagal — kubu jahat menang!";
    pushLog(ns, ns.winReason);
  } else {
    ns.missionIndex += 1;
    ns.leaderIndex = (ns.leaderIndex + 1) % ns.players.length;
    ns.phase = "propose";
    ns.proposedTeam = null;
    ns.votes = null;
    ns.questVotes = null;
    pushLog(
      ns,
      `Misi ${ns.missionIndex + 1} (butuh ${teamSizeFor(ns.players.length, ns.missionIndex)} orang). Ketua: ${leader(ns).name}.`
    );
  }
  return { ok: true, value: ns };
}

export function assassinate(
  s: GameState,
  playerId: string,
  targetId: string
): EngineResult<GameState> {
  if (s.phase !== "assassin")
    return { ok: false, error: "Bukan fase Assassin." };
  const p = findPlayer(s, playerId);
  if (!p) return { ok: false, error: "Pemain tidak dikenal." };
  if (p.role !== "assassin")
    return { ok: false, error: "Hanya Assassin yang bisa menebak." };
  const target = findPlayer(s, targetId);
  if (!target) return { ok: false, error: "Target tidak dikenal." };
  if (target.team !== "baik")
    return { ok: false, error: "Assassin hanya boleh menarget kubu baik." };
  const ns = clone(s);
  ns.assassinTarget = targetId;
  ns.phase = "ended";
  if (target.role === "merlin") {
    ns.winner = "jahat";
    ns.winReason = `Assassin menemukan Merlin (${target.name})! Kubu jahat mencuri kemenangan!`;
  } else {
    ns.winner = "baik";
    ns.winReason = `Assassin salah sasaran (${target.name} bukan Merlin). Kubu baik menang!`;
  }
  pushLog(ns, ns.winReason);
  return { ok: true, value: ns };
}

// ------------------------------------------------- night knowledge

export interface NightInfo {
  name: string;
  note: string;
}

/**
 * Pengetahuan malam untuk seorang pemain: daftar nama + keterangan
 * sesuai aturan Avalon. Tidak pernah membocorkan role ke yang tak berhak.
 */
export function nightKnowledge(s: GameState, viewerId: string): NightInfo[] {
  const me = findPlayer(s, viewerId);
  if (!me || !me.role) return [];
  const byId = (id: string) => findPlayer(s, id)!;
  const evilIds = s.players
    .filter((p) => p.team === "jahat")
    .map((p) => p.id);

  switch (me.role) {
    case "merlin": {
      // tahu semua jahat KECUALI Mordred
      return evilIds
        .filter((id) => byId(id).role !== "mordred")
        .map((id) => ({
          name: byId(id).name,
          note: "Pengkhianat (tapi ada yang tak terlihat olehmu…)",
        }));
    }
    case "percival": {
      const merlin = s.players.find((p) => p.role === "merlin")!;
      const morgana = s.players.find((p) => p.role === "morgana")!;
      // Acak beneran tiap view: kalau Merlin selalu di urutan pertama,
      // pemain yang jeli bisa menebak pola "nama pertama = Merlin".
      return shuffled(
        [
          { name: merlin.name, note: "Salah satu dari mereka adalah Merlin…" },
          { name: morgana.name, note: "Salah satu dari mereka adalah Merlin…" },
        ],
        Math.random
      );
    }
    case "assassin":
    case "morgana":
    case "mordred":
    case "antek": {
      // jahat saling kenal KECUALI Oberon
      return evilIds
        .filter((id) => id !== viewerId && byId(id).role !== "oberon")
        .map((id) => ({ name: byId(id).name, note: "Kawan jahatmu" }));
    }
    case "oberon":
    case "pelayan":
    default:
      return [];
  }
}

// ------------------------------------------------------- public view

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isMe: boolean;
  isLeader: boolean;
  inTeam: boolean;
  hasVoted: boolean; // voting tim
  hasQuestVoted: boolean; // misi (tanpa membocorkan pilihan)
  votedApprove: boolean | null; // TERBUKA hanya setelah semua vote masuk
  role: RoleId | null; // role sendiri, atau semua role saat ended
  nightKnowledge: NightInfo[];
}

export interface PublicState {
  code: string;
  phase: Phase;
  isStarted: boolean;
  players: PublicPlayer[];
  myId: string | null;
  amHost: boolean;
  amLeader: boolean;
  missionIndex: number;
  missions: (MissionResult | null)[];
  teamSizes: number[];
  currentTeamSize: number;
  failsNeeded: number;
  proposedTeamIds: string[] | null;
  proposedTeamNames: string[] | null;
  voteTrack: number;
  votesComplete: boolean;
  questVotedCount: number;
  questTeamSize: number;
  assassinId: string | null; // terlihat hanya oleh assassin saat fase assassin
  winner: Team | null;
  winReason: string | null;
  log: string[];
  myRole: RoleDef | null;
}

/**
 * State yang aman dikirim ke satu pemain: info privat hanya miliknya.
 * TIDAK PERNAH membocorkan role orang lain / siapa yang memilih Gagal.
 */
export function publicState(s: GameState, viewerId: string | null): PublicState {
  const me = viewerId ? findPlayer(s, viewerId) : undefined;
  const ended = s.phase === "ended";
  const votesComplete =
    !!s.votes && Object.keys(s.votes).length === s.players.length;

  const players: PublicPlayer[] = s.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    isMe: p.id === viewerId,
    isLeader:
      (s.phase === "propose" || s.phase === "vote" || s.phase === "quest") &&
      i === s.leaderIndex % s.players.length,
    inTeam: !!s.proposedTeam?.includes(p.id),
    hasVoted: !!s.votes && p.id in s.votes,
    hasQuestVoted: !!s.questVotes && p.id in s.questVotes,
    votedApprove: votesComplete && s.votes ? s.votes[p.id] ?? null : null,
    role: ended ? p.role : p.id === viewerId ? p.role : null,
    nightKnowledge:
      p.id === viewerId && (s.phase === "night" || s.phase === "propose" || s.phase === "vote" || s.phase === "quest" || s.phase === "assassin")
        ? nightKnowledge(s, p.id)
        : [],
  }));

  const assassin = s.players.find((p) => p.role === "assassin");

  return {
    code: s.code,
    phase: s.phase,
    isStarted: s.phase !== "lobby",
    players,
    myId: viewerId,
    amHost: !!me?.isHost,
    amLeader:
      !!me &&
      (s.phase === "propose" || s.phase === "vote" || s.phase === "quest") &&
      s.players[s.leaderIndex % s.players.length]?.id === viewerId,
    missionIndex: s.missionIndex,
    missions: [...s.missions],
    teamSizes: s.players.length >= MIN_PLAYERS ? TEAM_SIZES[s.players.length] : [],
    currentTeamSize:
      s.players.length >= MIN_PLAYERS
        ? teamSizeFor(s.players.length, Math.min(s.missionIndex, 4))
        : 0,
    failsNeeded:
      s.players.length >= MIN_PLAYERS
        ? failsNeeded(s.players.length, Math.min(s.missionIndex, 4))
        : 1,
    proposedTeamIds: s.proposedTeam,
    proposedTeamNames: s.proposedTeam
      ? s.proposedTeam.map((id) => findPlayer(s, id)?.name ?? "?")
      : null,
    voteTrack: s.voteTrack,
    votesComplete,
    questVotedCount: s.questVotes ? Object.keys(s.questVotes).length : 0,
    questTeamSize: s.proposedTeam?.length ?? 0,
    assassinId:
      s.phase === "assassin" && me?.role === "assassin" ? assassin?.id ?? null : null,
    winner: s.winner,
    winReason: s.winReason,
    log: [...s.log].reverse(),
    myRole: me?.role ? ROLE_DEFS[me.role] : null,
  };
}

// ------------------------------------------------------- misc utils

export function verifyToken(s: GameState, playerId: string, token: string): boolean {
  const p = findPlayer(s, playerId);
  return !!p && p.token === token;
}
