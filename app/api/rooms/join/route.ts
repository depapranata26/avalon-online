import { NextRequest, NextResponse } from "next/server";
import { joinRoom } from "@/lib/engine";
import { updateRoom } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/rooms/join {code, name} -> {playerId, token} */
export async function POST(req: NextRequest) {
  let body: { code?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }
  const code = (body.code ?? "").toUpperCase().trim();
  if (!code) return NextResponse.json({ error: "Kode room wajib diisi." }, { status: 400 });
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
  }
  const res = await updateRoom(code, (s) => {
    if (!s) return { error: "Room tidak ditemukan. Cek kodenya." };
    const r = joinRoom(s, body.name!);
    if (!r.ok) return { error: r.error };
    return {
      state: r.value.state,
      extra: { playerId: r.value.playerId, token: r.value.token },
    };
  });
  if ("error" in res) {
    const status = res.error.includes("tidak ditemukan") ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({
    code,
    playerId: res.extra!.playerId,
    token: res.extra!.token,
  });
}
