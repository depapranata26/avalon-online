/**
 * Abstraksi penyimpanan room.
 *
 * - Kalau env `KV_REST_API_URL` (dan `KV_REST_API_TOKEN`) ada → pakai @vercel/kv.
 * - Kalau tidak → fallback Map in-memory (cocok untuk dev lokal / testing).
 *
 * Semua mutasi state game WAJIB lewat `updateRoom` supaya baca-ubah-tulis
 * konsisten. Untuk game polling 2 detik, pola get+set sudah cukup.
 */
import type { GameState } from "./engine";

const PREFIX = "avalon:room:";
const TTL_SECONDS = 6 * 3600; // room kedaluwarsa 6 jam

function useKv(): boolean {
  return !!process.env.KV_REST_API_URL;
}

// In-memory fallback (satu proses — cukup untuk `npm run dev` & testing)
const mem = new Map<string, GameState>();

async function memGet(code: string): Promise<GameState | null> {
  return mem.get(code) ?? null;
}

async function memSet(state: GameState): Promise<void> {
  mem.set(state.code, state);
}

async function kvGet(code: string): Promise<GameState | null> {
  const { kv } = await import("@vercel/kv");
  return (await kv.get<GameState>(PREFIX + code)) ?? null;
}

async function kvSet(state: GameState): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(PREFIX + state.code, state, { ex: TTL_SECONDS });
}

export async function getRoom(code: string): Promise<GameState | null> {
  const c = code.toUpperCase().trim();
  return useKv() ? kvGet(c) : memGet(c);
}

export async function saveRoom(state: GameState): Promise<void> {
  if (useKv()) await kvSet(state);
  else await memSet(state);
}

/**
 * Muat room, terapkan mutator, simpan hasilnya.
 * Mutator mengembalikan {state} baru atau {error}.
 */
export async function updateRoom<T>(
  code: string,
  mutator: (s: GameState | null) => { state: GameState; extra?: T } | { error: string }
): Promise<{ state: GameState; extra?: T } | { error: string }> {
  const current = await getRoom(code);
  const res = mutator(current);
  if ("error" in res) return res;
  await saveRoom(res.state);
  return res;
}

export function storageKind(): "kv" | "memory" {
  return useKv() ? "kv" : "memory";
}
