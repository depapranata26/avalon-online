import { NextRequest, NextResponse } from "next/server";
import { publicState, verifyToken } from "@/lib/engine";
import { getRoom } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/rooms/[code]/state?playerId= -> state publik + info privat pemain */
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = params.code.toUpperCase().trim();
  const s = await getRoom(code);
  if (!s) return NextResponse.json({ error: "Room tidak ditemukan." }, { status: 404 });
  const playerId = req.nextUrl.searchParams.get("playerId");
  const token = req.nextUrl.searchParams.get("token");
  // Info privat (role + night knowledge) hanya dikirim bila token cocok.
  // playerId saja tidak cukup: daftar ID pemain bersifat publik, jadi siapa
  // pun bisa menebak ID pemain lain. Tanpa token valid -> balas sebagai penonton.
  const known =
    playerId && token && verifyToken(s, playerId, token) ? playerId : null;
  return NextResponse.json(publicState(s, known));
}
