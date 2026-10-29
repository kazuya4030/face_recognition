// バックアップと復元。DB（SQLite のバックアップ API による整合したコピー）と、案件の作業ディレクトリ・
// 成果物の保存版・添付資料を 1 つの tar.gz にまとめ、各ファイルの SHA-256 を manifest.json に記録する。
//
// 整合性: 先に DB を複製し、その後にファイルを集める。成果物の保存版・添付資料は DB に記録する前に
// 書き込まれ、後から削除・上書きされないため、複製した DB が参照するファイルは必ず含まれる。
// 復元: 空の（または存在しない）データディレクトリへ展開し、manifest の SHA-256 をすべて照合する。
// 既存のデータディレクトリは削除せず、退避（名前の変更）してから復元する。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';

export const DB_FILE = 'office.sqlite';
/** バックアップに含めるデータディレクトリ内のフォルダ。 */
const INCLUDED_DIRS = ['workspaces', 'deliverables', 'attachments'];
const FORMAT = 'niftp-office-backup';
const FORMAT_VERSION = 1;

export interface BackupManifest {
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  appVersion: string;
  counts: Record<string, number>;
  files: { path: string; size: number; sha256: string }[];
}

export interface BackupInfo {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  counts: Record<string, number> | null;
}

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

// ---- tar（ustar 形式。通常ファイルのみ） ----

function octal(n: number, len: number): string {
  return n.toString(8).padStart(len - 1, '0') + '\0';
}

function tarHeader(name: string, size: number, mtime: number): Buffer {
  const h = Buffer.alloc(512, 0);
  const full = Buffer.from(name, 'utf8');
  let nameBuf = full;
  let prefixBuf = Buffer.alloc(0);
  if (full.length > 100) {
    // 「/」の位置で prefix（最大155バイト）と name（最大100バイト）に分ける
    const parts = name.split('/');
    let split = -1;
    for (let i = 1; i < parts.length; i++) {
      const p = Buffer.from(parts.slice(0, i).join('/'), 'utf8');
      const n = Buffer.from(parts.slice(i).join('/'), 'utf8');
      if (p.length <= 155 && n.length <= 100) {
        split = i;
        break;
      }
    }
    if (split < 0) throw new Error(`パスが長すぎるためバックアップに含められません: ${name}`);
    prefixBuf = Buffer.from(parts.slice(0, split).join('/'), 'utf8');
    nameBuf = Buffer.from(parts.slice(split).join('/'), 'utf8');
  }
  nameBuf.copy(h, 0);
  h.write(octal(0o644, 8), 100, 'ascii');
  h.write(octal(0, 8), 108, 'ascii');
  h.write(octal(0, 8), 116, 'ascii');
  h.write(octal(size, 12), 124, 'ascii');
  h.write(octal(Math.floor(mtime / 1000), 12), 136, 'ascii');
  h.write('        ', 148, 'ascii');
  h.write('0', 156, 'ascii');
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  prefixBuf.copy(h, 345);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + ' ', 148, 'ascii');
  return h;
}

/** tar.gz の中身を読み出す。通常ファイル以外・危険なパス（絶対パス・..）は拒否する。 */
export function readTarGz(file: string): Map<string, Buffer> {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const out = new Map<string, Buffer>();
  let off = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const cstr = (s: number, l: number) => {
      const b = h.subarray(s, s + l);
      const z = b.indexOf(0);
      return (z >= 0 ? b.subarray(0, z) : b).toString('utf8');
    };
    const name = cstr(0, 100);
    const prefix = cstr(345, 155);
    const size = parseInt(cstr(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(h[156]);
    const p = prefix ? `${prefix}/${name}` : name;
    off += 512;
    if (type !== '0' && type !== '\0') throw new Error(`バックアップに通常ファイル以外が含まれています: ${p}`);
    if (!isSafeRelPath(p)) throw new Error(`バックアップに不正なパスが含まれています: ${p}`);
    out.set(p, Buffer.from(buf.subarray(off, off + size)));
    off += Math.ceil(size / 512) * 512;
  }
  return out;
}

export function isSafeRelPath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\') || /^[A-Za-z]:/.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

function walkFiles(root: string, rel: string, out: string[]) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const r = `${rel}/${ent.name}`;
    if (ent.isDirectory()) walkFiles(root, r, out);
    else if (ent.isFile()) out.push(r); // シンボリックリンクは含めない
  }
}

function countRows(dbPath: string): Record<string, number> {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const counts: Record<string, number> = {};
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((t) => t.name);
    for (const t of ['jobs', 'runs', 'deliverables', 'approvals', 'attachments', 'activities']) {
      if (tables.includes(t)) counts[t] = Number((db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c);
    }
    return counts;
  } finally {
    db.close();
  }
}

/**
 * バックアップを作成する。db を渡した場合はその接続から複製する（サーバー稼働中でも整合したコピーになる）。
 * 渡さない場合はデータディレクトリの DB を開いて複製する。
 */
export async function createBackup(dataDir: string, backupDir: string, opts: { db?: DatabaseSync; appVersion?: string } = {}): Promise<BackupInfo> {
  const dbPath = path.join(dataDir, DB_FILE);
  if (!opts.db && !fs.existsSync(dbPath)) throw new Error(`データベースが見つかりません: ${dbPath}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'niftp-backup-'));
  try {
    const dbCopy = path.join(stage, DB_FILE);
    const source = opts.db ?? new DatabaseSync(dbPath);
    try {
      await sqliteBackup(source, dbCopy);
    } finally {
      if (!opts.db) source.close();
    }
    const files: { rel: string; abs: string }[] = [{ rel: DB_FILE, abs: dbCopy }];
    const rels: string[] = [];
    for (const d of INCLUDED_DIRS) walkFiles(dataDir, d, rels);
    for (const r of rels.sort()) files.push({ rel: r, abs: path.join(dataDir, r) });

    const createdAt = new Date().toISOString();
    const manifest: BackupManifest = {
      format: FORMAT,
      version: FORMAT_VERSION,
      createdAt,
      appVersion: opts.appVersion ?? '',
      counts: countRows(dbCopy),
      files: [],
    };
    const name = `niftp-backup-${createdAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.tar.gz`;
    const target = path.join(backupDir, name);
    const partial = `${target}.partial`;
    const gz = zlib.createGzip();
    const ws = fs.createWriteStream(partial);
    const done = new Promise<void>((resolve, reject) => {
      ws.on('finish', resolve);
      ws.on('error', reject);
      gz.on('error', reject);
    });
    gz.pipe(ws);
    const write = (b: Buffer) => new Promise<void>((r) => (gz.write(b) ? r() : gz.once('drain', () => r())));
    const pad = (n: number) => Buffer.alloc((512 - (n % 512)) % 512, 0);
    for (const f of files) {
      const content = fs.readFileSync(f.abs);
      const st = fs.statSync(f.abs);
      manifest.files.push({ path: f.rel, size: content.length, sha256: sha256(content) });
      await write(tarHeader(f.rel, content.length, st.mtimeMs));
      await write(content);
      await write(pad(content.length));
    }
    const m = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    await write(tarHeader('manifest.json', m.length, Date.now()));
    await write(m);
    await write(pad(m.length));
    await write(Buffer.alloc(1024, 0));
    gz.end();
    await done;
    fs.renameSync(partial, target); // 書き込み途中のファイルを完成品と取り違えないよう、最後に名前を付ける
    return { name, path: target, size: fs.statSync(target).size, createdAt, counts: manifest.counts };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** バックアップの中身を検証する（manifest の SHA-256 と DB の読み取り）。問題があれば例外。 */
export function verifyBackup(file: string): { manifest: BackupManifest; entries: Map<string, Buffer> } {
  const entries = readTarGz(file);
  const raw = entries.get('manifest.json');
  if (!raw) throw new Error('manifest.json がありません（NIFTP のバックアップではないか、壊れています）');
  const manifest = JSON.parse(raw.toString('utf8')) as BackupManifest;
  if (manifest.format !== FORMAT) throw new Error('NIFTP のバックアップ形式ではありません');
  if (manifest.version > FORMAT_VERSION) throw new Error(`新しい形式のバックアップです（形式 ${manifest.version}）。アプリを更新してください`);
  for (const f of manifest.files) {
    const b = entries.get(f.path);
    if (!b) throw new Error(`ファイルが欠けています: ${f.path}`);
    if (b.length !== f.size || sha256(b) !== f.sha256) throw new Error(`内容が一致しません（壊れています）: ${f.path}`);
  }
  if (!manifest.files.some((f) => f.path === DB_FILE)) throw new Error('データベースが含まれていません');
  const extra = [...entries.keys()].filter((k) => k !== 'manifest.json' && !manifest.files.some((f) => f.path === k));
  if (extra.length) throw new Error(`manifest にないファイルが含まれています: ${extra.slice(0, 3).join(', ')}`);
  return { manifest, entries };
}

/**
 * バックアップを targetDataDir へ復元する。targetDataDir が空でない場合、force のときだけ
 * 既存のディレクトリを「<名前>.before-restore-<日時>」へ退避してから復元する（削除はしない）。
 */
export function restoreBackup(file: string, targetDataDir: string, opts: { force?: boolean } = {}): { manifest: BackupManifest; movedAside: string | null } {
  const { manifest, entries } = verifyBackup(file);
  const target = path.resolve(targetDataDir);
  let movedAside: string | null = null;
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    if (!opts.force) {
      throw new Error(`復元先が空ではありません: ${target}\n既存データを退避して復元する場合は --force を付けてください（削除はしません）`);
    }
    movedAside = `${target}.before-restore-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
    fs.renameSync(target, movedAside);
  }
  const partial = `${target}.restoring`;
  fs.rmSync(partial, { recursive: true, force: true });
  for (const f of manifest.files) {
    const dest = path.join(partial, ...f.path.split('/'));
    if (!dest.startsWith(partial + path.sep)) throw new Error(`不正なパス: ${f.path}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entries.get(f.path)!);
  }
  // 展開した DB が開けることを確認してから、正式な場所に置く
  const counts = countRows(path.join(partial, DB_FILE));
  for (const [k, v] of Object.entries(manifest.counts)) {
    if (counts[k] !== v) throw new Error(`復元した DB の件数が一致しません（${k}: ${counts[k]} / ${v}）`);
  }
  fs.renameSync(partial, target);
  return { manifest, movedAside };
}

export function listBackups(backupDir: string): BackupInfo[] {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((n) => /^niftp-backup-[0-9TZ]+\.tar\.gz$/.test(n))
    .sort()
    .reverse()
    .map((name) => {
      const p = path.join(backupDir, name);
      const st = fs.statSync(p);
      return { name, path: p, size: st.size, createdAt: st.mtime.toISOString(), counts: null };
    });
}
