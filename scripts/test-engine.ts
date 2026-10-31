/**
 * Test logika murni lib/engine.ts — dijalankan via: npx tsx scripts/test-engine.ts
 * Keluar kode 0 = semua lolos.
 */
import {
  ROLE_TABLE,
  TEAM_SIZES,
  assassinate,
  createRoom,
  failsNeeded,
  joinRoom,
  nightDone,
  nightKnowledge,
  proposeTeam,
  publicState,
  questVote,
  startGame,
  teamSizeFor,
  vote,
  type GameState,
} from "../lib/engine";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`GAGAL: ${name} ${detail}`);
  }
}

/** RNG deterministik */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame(n: number, seed = 42): { s: GameState; ids: string[] } {
  const rng = mulberry32(seed);
  const r = createRoom("ABCDEF", "Host", rng);
  if (!r.ok) throw new Error("createRoom gagal");
  let s = r.value.state;
  const ids = [r.value.playerId];
  for (let i = 2; i <= n; i++) {
    const j = joinRoom(s, `P${i}`, rng);
    if (!j.ok) throw new Error("joinRoom gagal: " + j.error);
    s = j.value.state;
    ids.push(j.value.playerId);
  }
  const st = startGame(s, ids[0], rng);
  if (!st.ok) throw new Error("startGame gagal: " + st.error);
  return { s: st.value, ids };
}

function nightAllDone(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const r = nightDone(s, id);
    if (!r.ok) throw new Error("nightDone gagal: " + r.error);
    s = r.value;
  }
  return s;
}

// --- 1. distribusi role 5..10 pemain
for (let n = 5; n <= 10; n++) {
  const { s } = newGame(n, n * 7);
  const roles = s.players.map((p) => p.role).sort();
  const expect = [...ROLE_TABLE[n]].sort();
  check(`role ${n}p`, JSON.stringify(roles) === JSON.stringify(expect), JSON.stringify(roles));
  check(`team ${n}p konsisten`, s.players.every((p) => p.team !== null));
}

// --- 2. ukuran tim & failsNeeded
const EXP_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
};
for (let n = 5; n <= 10; n++)
  for (let m = 0; m < 5; m++)
    check(`tim ${n}p misi${m + 1}`, teamSizeFor(n, m) === EXP_SIZES[n][m]);
for (let n = 5; n <= 10; n++)
  for (let m = 0; m < 5; m++)
    check(
      `fails ${n}p misi${m + 1}`,
      failsNeeded(n, m) === (n >= 7 && m === 3 ? 2 : 1)
    );
check("TEAM_SIZES konsisten", JSON.stringify(TEAM_SIZES) === JSON.stringify(EXP_SIZES));

// --- 3. alur penuh 5 pemain: baik menang 3 misi -> assassin salah tebak
{
  let { s, ids } = newGame(5, 99);
  s = nightAllDone(s, ids);
  check("fase propose setelah malam", s.phase === "propose");
  const evilIds = new Set(s.players.filter((p) => p.team === "jahat").map((p) => p.id));
  const goodIds = s.players.filter((p) => p.team === "baik").map((p) => p.id);
  const assassinId = s.players.find((p) => p.role === "assassin")!.id;
  const merlinId = s.players.find((p) => p.role === "merlin")!.id;

  for (let m = 0; m < 3; m++) {
    const leader = s.players[s.leaderIndex % s.players.length].id;
    const need = teamSizeFor(5, m);
    const team = goodIds.slice(0, need); // tim full baik
    let r = proposeTeam(s, leader, team);
    check(`misi${m + 1} propose ok`, r.ok, !r.ok ? (r as { error: string }).error : "");
    if (!r.ok) throw new Error("berhenti");
    s = r.value;
    for (const id of ids) {
      const v = vote(s, id, true);
      if (!v.ok) throw new Error("vote gagal");
      s = v.value;
    }
    check(`misi${m + 1} fase quest`, s.phase === "quest");
    for (const id of team) {
      const q = questVote(s, id, true);
      if (!q.ok) throw new Error("quest gagal: " + (q as { error: string }).error);
      s = q.value;
    }
    check(`misi${m + 1} sukses`, s.missions[m] === "sukses");
  }
  check("fase assassin", s.phase === "assassin");
  // assassin salah tebak (pilih pelayan, bukan merlin)
  const wrongTarget = goodIds.find((id) => id !== merlinId)!;
  const a = assassinate(s, assassinId, wrongTarget);
  check("assassinate ok", a.ok);
  if (!a.ok) throw new Error("berhenti");
  s = a.value;
  check("baik menang (assassin salah)", s.winner === "baik" && s.phase === "ended");
  void evilIds;
}

// --- 4. assassin menemukan Merlin -> jahat menang
{
  let { s, ids } = newGame(6, 100);
  s = nightAllDone(s, ids);
  const goodIds = s.players.filter((p) => p.team === "baik").map((p) => p.id);
  const assassinId = s.players.find((p) => p.role === "assassin")!.id;
  const merlinId = s.players.find((p) => p.role === "merlin")!.id;
  for (let m = 0; m < 3; m++) {
    const leader = s.players[s.leaderIndex % s.players.length].id;
    const team = goodIds.slice(0, teamSizeFor(6, m));
    s = (proposeTeam(s, leader, team) as { ok: true; value: GameState }).value;
    for (const id of ids) s = (vote(s, id, true) as { ok: true; value: GameState }).value;
    for (const id of team) s = (questVote(s, id, true) as { ok: true; value: GameState }).value;
  }
  const a = assassinate(s, assassinId, merlinId);
  if (!a.ok) throw new Error("assassinate gagal");
  s = a.value;
  check("jahat menang (Merlin terbunuh)", s.winner === "jahat");
}

// --- 5. vote track 5x -> jahat menang
{
  let { s, ids } = newGame(5, 101);
  s = nightAllDone(s, ids);
  for (let t = 0; t < 5; t++) {
    const leader = s.players[s.leaderIndex % s.players.length].id;
    const team = ids.slice(0, teamSizeFor(5, s.missionIndex));
    const pr = proposeTeam(s, leader, team);
    if (!pr.ok) throw new Error("propose gagal");
    s = pr.value;
    for (const id of ids) {
      const v = vote(s, id, false); // semua menolak
      if (!v.ok) throw new Error("vote gagal");
      s = v.value;
    }
    if (t < 4) check(`tolak ${t + 1}: lanjut propose`, s.phase === "propose");
  }
  check("5x tolak -> jahat menang", s.phase === "ended" && s.winner === "jahat");
  check("voteTrack=5", s.voteTrack === 5);
}

// --- 6. misi gagal & butuh 2 gagal di misi 4 (7 pemain)
{
  let { s, ids } = newGame(7, 102);
  s = nightAllDone(s, ids);
  const evil = s.players.filter((p) => p.team === "jahat").map((p) => p.id);
  const leader = s.players[s.leaderIndex % s.players.length].id;
  // misi 1: 1 jahat ikut, pilih Gagal -> misi gagal
  const team1 = [evil[0], ...ids.filter((id) => !evil.includes(id)).slice(0, 1)];
  s = (proposeTeam(s, leader, team1) as { ok: true; value: GameState }).value;
  for (const id of ids) s = (vote(s, id, true) as { ok: true; value: GameState }).value;
  for (const id of team1) {
    const q = questVote(s, id, id === evil[0] ? false : true);
    if (!q.ok) throw new Error("quest gagal");
    s = q.value;
  }
  check("misi 1 gagal (1 fail)", s.missions[0] === "gagal");
  // kubu baik tidak boleh pilih Gagal
  const goodInTeam = team1.find((id) => !evil.includes(id))!;
  // (sudah lewat fasenya; uji aturan langsung di state baru)
  let { s: s2, ids: ids2 } = newGame(5, 103);
  s2 = nightAllDone(s2, ids2);
  const l2 = s2.players[s2.leaderIndex % s2.players.length].id;
  const g2 = s2.players.filter((p) => p.team === "baik").map((p) => p.id);
  const t2 = g2.slice(0, teamSizeFor(5, 0));
  s2 = (proposeTeam(s2, l2, t2) as { ok: true; value: GameState }).value;
  for (const id of ids2) s2 = (vote(s2, id, true) as { ok: true; value: GameState }).value;
  const bad = questVote(s2, t2[0], false);
  check("baik tidak bisa Gagal", !bad.ok);
  void goodInTeam;
}

// --- 7. pengetahuan malam
{
  const { s, ids } = newGame(10, 104); // ada mordred + oberon
  const byRole = (r: string) => s.players.find((p) => p.role === r)!;
  const merlinK = nightKnowledge(s, byRole("merlin").id).map((k) => k.name);
  const evilNames = s.players.filter((p) => p.team === "jahat").map((p) => p.name);
  const mordredName = byRole("mordred").name;
  check("Merlin tahu jahat kecuali Mordred",
    evilNames.filter((n) => n !== mordredName).every((n) => merlinK.includes(n)) &&
    !merlinK.includes(mordredName) && merlinK.length === 3,
    JSON.stringify(merlinK));
  const percK = nightKnowledge(s, byRole("percival").id);
  check("Percival lihat 2 kandidat", percK.length === 2);
  const oberonK = nightKnowledge(s, byRole("oberon").id);
  check("Oberon tidak tahu siapa pun", oberonK.length === 0);
  const assassinK = nightKnowledge(s, byRole("assassin").id).map((k) => k.name);
  check("Assassin tahu jahat kecuali Oberon",
    !assassinK.includes(byRole("oberon").name) &&
    assassinK.includes(byRole("morgana").name) &&
    assassinK.includes(byRole("mordred").name));
  const pelayanK = nightKnowledge(s, byRole("pelayan").id);
  check("Pelayan tidak tahu apa-apa", pelayanK.length === 0);
  void ids;
}

// --- 8. publicState tidak bocor
{
  let { s, ids } = newGame(5, 105);
  s = nightAllDone(s, ids);
  const viewer = ids[0];
  const pub = publicState(s, viewer);
  const others = pub.players.filter((p) => !p.isMe);
  check("role orang lain disembunyikan", others.every((p) => p.role === null));
  check("role sendiri terlihat", pub.players.find((p) => p.isMe)!.role !== null);
  // quest: pilihan tidak bocor, hanya hitungan
  const leader = s.players[s.leaderIndex % s.players.length].id;
  const team = ids.slice(0, teamSizeFor(5, 0));
  s = (proposeTeam(s, leader, team) as { ok: true; value: GameState }).value;
  for (const id of ids) s = (vote(s, id, true) as { ok: true; value: GameState }).value;
  const evilId = team.find((id) => s.players.find((p) => p.id === id)!.team === "jahat");
  if (evilId) {
    s = (questVote(s, evilId, false) as { ok: true; value: GameState }).value;
    const pub2 = publicState(s, ids.find((id) => id !== evilId)!);
    const raw = JSON.stringify(pub2);
    check("pilihan Gagal tidak bocor di state publik", !raw.includes('"questVotes"'));
  }
  // setelah ended semua role terbuka
  let { s: s3, ids: ids3 } = newGame(5, 106);
  s3 = nightAllDone(s3, ids3);
  for (let t = 0; t < 5; t++) {
    const ld = s3.players[s3.leaderIndex % s3.players.length].id;
    const tm = ids3.slice(0, teamSizeFor(5, s3.missionIndex));
    const pr = proposeTeam(s3, ld, tm);
    if (!pr.ok) break;
    s3 = pr.value;
    for (const id of ids3) s3 = (vote(s3, id, false) as { ok: true; value: GameState }).value;
  }
  const pub3 = publicState(s3, ids3[0]);
  check("ended: semua role terbuka", pub3.players.every((p) => p.role !== null));
}

// --- 9. validasi aksi
{
  let { s, ids } = newGame(5, 107);
  const notHost = ids[1];
  const r1 = startGame(s, notHost, mulberry32(1));
  check("bukan host tidak bisa start", !r1.ok);
  const solo = createRoom("X", "Solo", mulberry32(1));
  if (solo.ok) {
    const r2 = startGame(solo.value.state, "x", mulberry32(1));
    check("solo tidak bisa start (<5 pemain)", !r2.ok);
  }
  let { s: s4 } = newGame(5, 108);
  // join setelah mulai ditolak
  s4 = nightAllDone(s4, s4.players.map((p) => p.id));
  const j = joinRoom(s4, "Terlambat", mulberry32(1));
  check("join setelah mulai ditolak", !j.ok);
  // propose oleh bukan ketua ditolak
  const nonLeader = s4.players[(s4.leaderIndex + 1) % s4.players.length].id;
  const pr = proposeTeam(s4, nonLeader, s4.players.slice(0, 2).map((p) => p.id));
  check("bukan ketua tidak bisa propose", !pr.ok);
  // nama duplikat ditolak (di lobby)
  let { s: s5 } = newGame(5, 109);
  void s5;
  const l5 = createRoom("ZZZZZZ", "Host", mulberry32(5));
  if (l5.ok) {
    let st = l5.value.state;
    const j1 = joinRoom(st, "Budi", mulberry32(6));
    if (j1.ok) {
      const j2 = joinRoom(j1.value.state, "budi", mulberry32(7));
      check("nama duplikat ditolak", !j2.ok);
    }
  }
}

console.log(`\n${failed === 0 ? "SEMUA LOLOS" : "ADA YANG GAGAL"}: ${passed} lolos, ${failed} gagal`);
process.exit(failed === 0 ? 0 : 1);
