// 運用コマンド（サーバーとは別に実行する）。
//   npm run backup                         バックアップを作成（サーバー稼働中でも可）
//   npm run backup:verify -- <ファイル>     バックアップの中身を検証
//   npm run restore -- <ファイル> [--data-dir <復元先>] [--force]
//                                          復元（サーバーを止めてから実行。既存データは削除せず退避）
//   npm run doctor                         起動に必要なものがそろっているか確認
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, projectRoot } from '../config.ts';
import { createBackup, DB_FILE, restoreBackup, verifyBackup } from './backup.ts';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.includes(name);
const option = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1] === '--data-dir'));
const config = loadConfig();
const appVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version as string;
const fmt = (c: Record<string, number>) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join('、');

async function main() {
  switch (cmd) {
    case 'backup': {
      const info = await createBackup(config.dataDir, config.backupDir, { appVersion });
      console.log(`バックアップを作成しました: ${info.path}（${(info.size / 1024).toFixed(1)} KB）`);
      console.log(`内容: ${fmt(info.counts ?? {})}`);
      console.log('この PC が壊れても残るよう、別の場所（外付けドライブ・クラウドストレージ等）にもコピーしてください。');
      return;
    }
    case 'verify': {
      const file = positional[0];
      if (!file) throw new Error('検証するバックアップファイルを指定してください');
      const { manifest } = verifyBackup(file);
      console.log(`正常です: ${manifest.files.length}ファイル（作成 ${manifest.createdAt}）、${fmt(manifest.counts)}`);
      return;
    }
    case 'restore': {
      const file = positional[0];
      if (!file) throw new Error('復元するバックアップファイルを指定してください');
      const target = path.resolve(option('--data-dir') ?? config.dataDir);
      if (target === config.dataDir && isServerRunning()) {
        throw new Error('サーバーが起動中です。停止（Ctrl+C）してから復元してください');
      }
      const { manifest, movedAside } = restoreBackup(file, target, { force: flag('--force') });
      if (movedAside) console.log(`既存のデータを退避しました: ${movedAside}`);
      console.log(`復元しました: ${target}（${fmt(manifest.counts)}、作成 ${manifest.createdAt}）`);
      console.log('復元先のデータで起動するには: ' + (target === config.dataDir ? 'npm start' : `NIFTP_DATA_DIR="${target}" npm start`));
      return;
    }
    case 'doctor': {
      doctor();
      return;
    }
    default:
      console.log('使い方: npm run backup | npm run backup:verify -- <ファイル> | npm run restore -- <ファイル> [--data-dir <復元先>] [--force] | npm run doctor');
      process.exitCode = 1;
  }
}

/** 同じデータディレクトリを使うサーバーが動いているか（DB の WAL を書き込み中か）を簡易に判定する。 */
function isServerRunning(): boolean {
  try {
    const res = execFileSync(process.platform === 'win32' ? 'tasklist' : 'ps', process.platform === 'win32' ? [] : ['-eo', 'args'], { encoding: 'utf8' });
    return /server[\\/]src[\\/]index\.ts/.test(res);
  } catch {
    return false;
  }
}

function doctor() {
  const results: [boolean, string][] = [];
  const [maj, min] = process.versions.node.split('.').map(Number);
  results.push([maj > 22 || (maj === 22 && min >= 16), `Node.js ${process.versions.node}（22.16 以上が必要）`]);
  try {
    const v = execFileSync(config.claudeBin, ['--version'], { encoding: 'utf8', timeout: 15000 }).trim();
    results.push([true, `Claude Code: ${v}`]);
    try {
      const st = JSON.parse(execFileSync(config.claudeBin, ['auth', 'status', '--json'], { encoding: 'utf8', timeout: 15000 }));
      results.push([Boolean(st.loggedIn), `Claude Code のログイン: ${st.loggedIn ? `済み（方式: ${st.authMethod ?? '不明'}）` : '未ログイン → ターミナルで claude を起動してログインしてください'}`]);
    } catch {
      results.push([false, 'Claude Code のログイン状態を確認できませんでした（claude auth status）']);
    }
  } catch {
    results.push([false, `Claude Code CLI（${config.claudeBin}）が見つかりません。デモ実行だけ使えます`]);
  }
  results.push([fs.existsSync(path.join(config.clientDir, 'index.html')), `画面のビルド（${config.clientDir}）${fs.existsSync(path.join(config.clientDir, 'index.html')) ? '' : ' → npm run build を実行してください'}`]);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.accessSync(config.dataDir, fs.constants.W_OK);
    results.push([true, `データの保存先: ${config.dataDir}${fs.existsSync(path.join(config.dataDir, DB_FILE)) ? '（既存データあり）' : '（新規）'}`]);
  } catch {
    results.push([false, `データの保存先に書き込めません: ${config.dataDir}`]);
  }
  results.push([true, `バックアップの保存先: ${config.backupDir}`]);
  results.push([true, `画面の URL: http://${config.host}:${config.port}/（この PC からのみ開けます）`]);
  for (const [ok, msg] of results) console.log(`${ok ? '✓' : '×'} ${msg}`);
  if (results.some(([ok]) => !ok)) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(`エラー: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
