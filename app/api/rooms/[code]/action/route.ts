import { NextRequest, NextResponse } from "next/server";
import {
  assassinate,
  nightDone,
  proposeTeam,
  publicState,
  questVote,
  startGame,
  verifyToken,
  vote,
} from "@/lib/engine";
import { updateRoom } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActionBody = {
  playerId?: string;
  token?: string;
  kind?: string;
  memberIds?: string[];
  approve?: boolean;
  success?: boolean;
  targetId?: string;
};

const KINDS = ["start", "night_done", "propose", "vote", "quest", "assassinate"] as const;

/** POST /api/rooms/[code]/action {playerId, token, kind, ...} */
export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = params.code.toUpperCase().trim();
  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }
  const { playerId, token, kind } = body;
  if (!playerId || !token) {
    return NextResponse.json({ error: "Identitas pemain tidak lengkap." }, { status: 401 });
  }
  if (!kind || !(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  }

  const res = await updateRoom(code, (s) => {
    if (!s) return { error: "Room tidak ditemukan." };
    if (!verifyToken(s, playerId, token)) {
      return { error: "Token tidak valid. Coba gabung ulang." };
    }
    switch (kind) {
      case "start": {
        const r = startGame(s, playerId);
        return r.ok ? { state: r.value } : { error: r.error };
      }
      case "night_done": {
        const r = nightDone(s, playerId);
        return r.ok ? { state: r.value } : { error: r.error };
      }
      case "propose": {
        const r = proposeTeam(s, playerId, body.memberIds ?? []);
        return r.ok ? { state: r.value } : { error: r.error };
      }
      case "vote": {
        if (typeof body.approve !== "boolean")
          return { error: "Pilihan voting tidak valid." };
        const r = vote(s, playerId, body.approve);
        return r.ok ? { state: r.value } : { error: r.error };
      }
      case "quest": {
        if (typeof body.success !== "boolean")
          return { error: "Pilihan misi tidak valid." };
        const r = questVote(s, playerId, body.success);
        return r.ok ? { state: r.value } : { error: r.error };
      }
      case "assassinate": {
        if (!body.targetId) return { error: "Target Assassin wajib dipilih." };
        const r = assassinate(s, playerId, body.targetId);
        return r.ok ? { state: r.value } : { error: r.error };
      }
      default:
        return { error: "Aksi tidak dikenal." };
    }
  });

  if ("error" in res) {
    const status = res.error.includes("tidak ditemukan") ? 404 : res.error.includes("Token") ? 401 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json(publicState(res.state, playerId));
}
