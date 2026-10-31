# Avalon Online 🗡️

Game social deduction **The Resistance: Avalon** versi web multiplayer — main bareng
teman langsung dari HP, full Bahasa Indonesia. 5–10 pemain, ±30 menit.

## Cara jalan lokal

```bash
npm install
npm run dev
# buka http://localhost:3000
```

Tanpa konfigurasi apa pun, state room disimpan **in-memory** (satu proses) —
cukup untuk main bareng di jaringan yang sama / testing.

## Deploy ke Vercel

1. Push repo ini ke GitHub, import di Vercel.
2. Tambahkan **Vercel KV** (atau Upstash Redis) dari Storage tab — otomatis mengisi
   `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Kode otomatis memakai KV kalau env
   tersebut ada, tanpa perubahan kode.

## Struktur

```
app/
  page.tsx                 # home: buat / gabung room
  room/[code]/page.tsx     # client game (polling 2 detik, semua fase)
  api/rooms/route.ts       # POST create room
  api/rooms/join/route.ts  # POST gabung
  api/rooms/[code]/state/route.ts   # GET state (disanitasi per pemain)
  api/rooms/[code]/action/route.ts  # POST aksi: start, night_done, propose,
                                    # vote, quest, assassinate
lib/
  engine.ts   # PURE game logic: role, fase, voting, misi, assassin.
              # Tanpa dependensi — bisa di-test tanpa KV/DOM.
  store.ts    # abstraksi storage: @vercel/kv kalau env ada, else Map in-memory
public/img/
  hero.jpg, roles/*.jpg   # hasil image generation (fantasi Arthurian)
scripts/
  test-engine.ts  # 109 checks logika -> `npm run test:engine`
```

## Aturan main yang diimplementasikan

- Komposisi role resmi per 5–10 pemain (Merlin, Percival, Assassin, Morgana,
  Mordred, Oberon, Pelayan, Antek).
- Ukuran tim misi resmi per jumlah pemain; misi 4 butuh **2 Gagal** untuk
  7+ pemain.
- Vote track: 5x tim ditolak beruntun → kubu jahat langsung menang.
- Pengetahuan malam: Merlin tahu jahat kecuali Mordred; Percival lihat
  2 kandidat (Merlin/Morgana); jahat saling kenal kecuali Oberon.
- Assassin menebak Merlin di akhir kalau baik menang 3 misi.
- Voting tim TERBUKA setelah semua vote masuk (sesuai aturan Avalon);
  pilihan Sukses/Gagal misi TIDAK PERNAH dibocorkan (hanya jumlahnya).

## Keamanan state

- Tiap pemain dapat token acak 32 char (disimpan di localStorage), diverifikasi
  server di setiap aksi.
- `GET state` hanya mengirim info privat milik pemain itu (role sendiri +
  pengetahuan malam). Role orang lain & siapa memilih Gagal tidak dikirim.
- Pemain baik tidak bisa memilih Gagal (divalidasi server, bukan cuma UI).

## Test

```bash
npm run test:engine   # 109 checks: role, alur penuh, vote track, assassin,
                      # night knowledge, anti-bocor, validasi aksi
```

Test API manual (in-memory): lihat `/tmp/apitest.py` — create → join ×5 →
start → propose → vote → quest → voteTrack, semua via curl-equivalent.
