// 起動時設定。秘密情報はここで扱わない（Claude Code の認証は Claude Code 自身の仕組みに任せる）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  /** バックアップの保存先。データディレクトリとは別の場所にする（データを消してもバックアップが残るように）。 */
  backupDir: string;
  clientDir: string;
  claudeBin: string;
  /** デモ実行アダプターの1手順あたりの待ち時間（ミリ秒）。 */
  demoStepMs: number;
  /** 同時実行数。初期版は1。並列化はキューの仕組みを変えずにこの値で拡張する。 */
  maxConcurrentRuns: number;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env.HOST ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`HOST=${host} は許可されていません。初期版はローカル（127.0.0.1 / localhost / ::1）でのみ起動できます。`);
  }
  return {
    host,
    port: Number(env.PORT ?? 4317),
    dataDir: path.resolve(env.NIFTP_DATA_DIR ?? path.join(projectRoot, 'data')),
    backupDir: path.resolve(env.NIFTP_BACKUP_DIR ?? path.join(projectRoot, 'backups')),
    clientDir: path.join(projectRoot, 'dist/client'),
    claudeBin: env.NIFTP_CLAUDE_BIN ?? 'claude',
    demoStepMs: Number(env.NIFTP_DEMO_STEP_MS ?? 1200),
    maxConcurrentRuns: 1,
  };
}
