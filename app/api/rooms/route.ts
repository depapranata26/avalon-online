import { NextRequest, NextResponse } from "next/server";
import { createRoom, makeRoomCode } from "@/lib/engine";
import { saveRoom, getRoom } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/rooms {hostName} -> {code, playerId, token} */
export async function POST(req: NextRequest) {
  let body: { hostName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }
  if (!body.hostName || !body.hostName.trim()) {
    return NextResponse.json({ error: "Nama host wajib diisi." }, { status: 400 });
  }
  // buat kode unik (coba beberapa kali kalau tabrakan)
  let code = "";
  for (let i = 0; i < 10; i++) {
    const c = makeRoomCode();
    if (!(await getRoom(c))) {
      code = c;
      break;
    }
  }
  if (!code) {
    return NextResponse.json({ error: "Gagal membuat kode room, coba lagi." }, { status: 500 });
  }
  const res = createRoom(code, body.hostName);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  await saveRoom(res.value.state);
  return NextResponse.json({
    code,
    playerId: res.value.playerId,
    token: res.value.token,
  });
}
