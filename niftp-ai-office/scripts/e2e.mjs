// 画面からの一連の流れをブラウザで確認する（デモ実行）。
// 使い方: npm run build && npm run e2e
// 一時データディレクトリでサーバーを起動し、登録→状態変化→成果物→差し戻し→承認→再起動後の記録→エラー→キャンセルを確認する。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.E2E_PORT ?? 4399);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'niftp-e2e-'));
const shots = path.join(root, 'e2e-artifacts');
fs.mkdirSync(shots, { recursive: true });

let server;
function startServer() {
  server = spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'server/src/index.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NIFTP_DATA_DIR: dataDir, NIFTP_DEMO_STEP_MS: '600' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 20000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('NIFTP AI Office:')) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}
function stopServer() {
  return new Promise((resolve) => {
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['OK', name]);
    console.log(`OK   ${name}`);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
    console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);
    throw e;
  }
}

async function createJob(page, { title, scenario = 'normal', start = true }) {
  await page.goto(`${base}/#/request`);
  await page.getByLabel(/タイトル/).fill(title);
  await page.getByLabel(/^目的/).fill('E2E確認用の目的');
  await page.getByLabel(/^依頼内容/).fill('競合3社の料金を比較してください');
  await page.getByLabel(/^完了条件/).fill('3社の料金表がある\n出典が明記されている');
  await page.getByLabel(/担当社員/).selectOption('researcher');
  await page.getByLabel('デモのシナリオ').selectOption(scenario);
  await page.getByRole('button', { name: start ? '登録して開始' : '登録のみ（未着手）' }).click();
  await page.waitForURL(/#\/jobs\/\d+/);
  return Number(page.url().match(/jobs\/(\d+)/)[1]);
}

// オフィスの社員（data-status は実際の状態）
const person = (page, id) => page.locator(`[data-employee="${id}"]`);
const waitStatus = (page, id, status, timeout = 15000) => page.locator(`[data-employee="${id}"][data-status="${status}"]`).waitFor({ timeout });

await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('dialog', (d) => d.accept());
let jobId;

try {
  await step('オフィス画面: エントランス・CEOのデスク・執務・会議室・資料棚・ラウンジと4人のAI社員、デモモード表示', async () => {
    await page.goto(base);
    for (const id of ['entrance', 'whiteboard', 'achievements', 'ceo', 'meeting-sign', 'furniture-shelf-1', 'furniture-meeting-table']) {
      await page.locator(`[data-testid="${id}"]`).first().waitFor();
    }
    for (const id of ['manager', 'researcher', 'builder', 'qa']) await person(page, id).waitFor();
    for (const n of ['ハル', 'ミナ', 'ソラ', 'リツ', 'CEO 植村']) await page.locator('.name-tag', { hasText: n }).waitFor();
    await page.locator('.mode-chip', { hasText: 'デモモード' }).waitFor();
    await page.getByText('構想上の名称（法人未設立）').waitFor();
    if ((await page.locator('.character.is-working').count()) !== 0) throw new Error('待機中なのに作業中の演出が表示されている');
    await page.screenshot({ path: path.join(shots, '01-office-idle.png') });
    // 家具のクリックが実際の機能につながる
    await page.locator('[data-testid="entrance"]').click();
    await page.locator('[data-testid="entrance-panel"]').getByText('構想上の名称（法人未設立）').waitFor();
    await page.locator('[data-testid="whiteboard"]').click();
    await page.waitForURL(/#\/board/);
    await page.goto(base);
    await page.locator('[data-testid="meeting-sign"]').click();
    await page.waitForURL(/#\/request/);
  });

  await step('1. CEOが仕事を登録して開始する', async () => {
    jobId = await createJob(page, { title: 'E2E 競合料金調査' });
    await page.getByRole('heading', { name: /E2E 競合料金調査/ }).waitFor();
  });

  await step('2. 担当AI社員の状態が「作業中」に変わり、演出が実際の出来事と連動する', async () => {
    await page.goto(base);
    await waitStatus(page, 'manager', 'working', 10000);
    await waitStatus(page, 'researcher', 'working', 15000);
    if ((await page.locator('.character.is-working').count()) !== 1) throw new Error('作業中の社員だけに作業の演出が出るはず');
    // 引き継ぎ（業務責任者→担当）は実際の記録から演出される
    await page.locator('.fx-bubble').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: path.join(shots, '02-office-working.png') });
    await page.locator('.hud-running', { hasText: 'E2E 競合料金調査' }).waitFor();
    await person(page, 'researcher').click();
    await page.locator('[data-testid="employee-panel"]').getByText('E2E 競合料金調査').first().waitFor();
    await page.locator('[data-testid="employee-panel"]').getByText('調査・企画AI').waitFor();
    await page.screenshot({ path: path.join(shots, '03-employee-panel.png') });
    // 品質確認への引き継ぎで書類が渡る演出
    await waitStatus(page, 'qa', 'working', 20000);
    await page.locator('.fx-doc').first().waitFor({ state: 'attached', timeout: 5000 });
    await waitStatus(page, 'researcher', 'waiting_review', 20000);
  });

  await step('CEOのデスクと資料棚に通知が出て、クリックで承認・成果物へつながる', async () => {
    await page.locator('[data-testid="ceo-notice"]').waitFor();
    await page.locator('[data-testid="hud-pending"]', { hasText: '1' }).waitFor();
    await page.screenshot({ path: path.join(shots, '03b-office-review.png') });
    await page.locator('[data-testid="ceo-notice"]').click();
    await page.locator('[data-testid="ceo-panel"]').getByText('E2E 競合料金調査').waitFor();
    await page.screenshot({ path: path.join(shots, '03c-ceo-panel.png') });
    await page.locator('[data-testid="shelf-notice"]').click();
    await page.waitForURL(/#\/library\/\d+/);
    await page.locator('.file-content', { hasText: '【デモ出力】' }).waitFor();
    await page.goto(base);
    if (await page.locator('[data-testid="shelf-notice"]').count()) throw new Error('開いた後も新着通知が残っている');
    await page.getByRole('button', { name: '出来事' }).click();
    await page.locator('[data-testid="events-panel"]').getByText('レビュー依頼').first().waitFor();
    await page.screenshot({ path: path.join(shots, '03d-events-panel.png') });
  });

  await step('3. 処理履歴と成果物が案件に記録される', async () => {
    await page.goto(`${base}/#/jobs/${jobId}`);
    await page.locator('.page-head .badge', { hasText: '確認待ち' }).waitFor();
    await page.locator('.timeline').getByText('［デモ］成果物を outputs/deliverable.md に書き出し').waitFor();
    for (const f of ['plan.md', 'deliverable.md', 'review.md']) await page.getByRole('link', { name: f }).first().waitFor();
    await page.screenshot({ path: path.join(shots, '04-job-detail.png'), fullPage: true });
    await page.goto(`${base}/#/library`);
    await page.getByRole('button', { name: /deliverable\.md/ }).click();
    await page.locator('.file-content', { hasText: '【デモ出力】' }).waitFor();
    await page.getByRole('link', { name: 'ダウンロード' }).waitFor();
    await page.screenshot({ path: path.join(shots, '05-library.png'), fullPage: true });
  });

  await step('4a. CEOが差し戻す（コメント必須）→ 未着手に戻る', async () => {
    await page.goto(`${base}/#/approvals`);
    const card = page.locator('.approval-card').first();
    await card.getByText('確認事項（2件）').waitFor();
    if (await card.getByRole('button', { name: '差し戻す' }).isEnabled()) throw new Error('コメントなしで差し戻しできてしまう');
    await page.screenshot({ path: path.join(shots, '06-approval.png'), fullPage: true });
    await card.getByLabel(/CEOコメント/).fill('出典URLを各数値の横に追加してください');
    await card.getByRole('button', { name: '差し戻す' }).click();
    await page.goto(`${base}/#/board`);
    await page.locator('.col-todo .card', { hasText: 'E2E 競合料金調査' }).waitFor();
  });

  await step('4b. 再実行して承認する → 完了、承認記録が残る', async () => {
    await page.goto(`${base}/#/jobs/${jobId}`);
    await page.getByText('出典URLを各数値の横に追加してください').first().waitFor();
    await page.getByRole('button', { name: '開始' }).click();
    await page.locator('.page-head .badge', { hasText: '確認待ち' }).waitFor({ timeout: 25000 });
    const card = page.locator('.approval-card');
    await card.getByLabel(/CEOコメント/).fill('確認しました。承認します');
    await card.getByRole('button', { name: '承認する' }).click();
    await page.locator('.page-head .badge', { hasText: '完了' }).waitFor();
    for (const a of await page.locator('.job-actions button').all()) {
      if (await a.isEnabled()) throw new Error(`完了した案件で「${await a.textContent()}」が押せる`);
    }
    await page.goto(`${base}/#/approvals`);
    await page.locator('.table').getByText('確認しました。承認します').waitFor();
    await page.locator('.table').getByText('出典URLを各数値の横に追加してください').waitFor();
    await page.screenshot({ path: path.join(shots, '07-approval-history.png'), fullPage: true });
    await page.goto(base);
    await page.locator('[data-testid="achievements"]').click();
    await page.locator('[data-testid="achievements-panel"]').getByText('E2E 競合料金調査').waitFor();
    await page.screenshot({ path: path.join(shots, '07b-achievements.png') });
    await waitStatus(page, 'researcher', 'done');
  });

  await step('6a. エラーを正しく表示する（完了扱いにしない）', async () => {
    const id = await createJob(page, { title: 'E2E エラー確認', scenario: 'error' });
    await page.locator('.page-head .badge', { hasText: 'エラー' }).waitFor({ timeout: 25000 });
    await page.locator('.error-text', { hasText: 'エラー再現シナリオ' }).first().waitFor();
    await page.goto(`${base}/#/board`);
    await page.locator('.col-error .card', { hasText: 'E2E エラー確認' }).waitFor();
    await page.goto(base);
    await waitStatus(page, 'researcher', 'error');
    await page.screenshot({ path: path.join(shots, '08-error.png') });
    void id;
  });

  await step('6b. 実行中のキャンセルを記録する', async () => {
    const id = await createJob(page, { title: 'E2E キャンセル確認' });
    await page.locator('.page-head .badge', { hasText: '作業中' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await page.locator('.page-head .badge', { hasText: 'キャンセル' }).waitFor({ timeout: 10000 });
    await page.locator('.table .badge', { hasText: 'キャンセル' }).first().waitFor();
    await page.screenshot({ path: path.join(shots, '09-cancelled.png'), fullPage: true });
    void id;
  });

  await step('未対応の操作は押せない（未着手の案件では一時停止・再開が無効）', async () => {
    await createJob(page, { title: 'E2E 未着手', start: false });
    if (await page.getByRole('button', { name: '一時停止' }).isEnabled()) throw new Error('未着手で一時停止が押せる');
    if (await page.getByRole('button', { name: '再開' }).isEnabled()) throw new Error('未着手で再開が押せる');
    if (!(await page.getByRole('button', { name: '開始' }).isEnabled())) throw new Error('未着手で開始が押せない');
  });

  await step('5. アプリを再起動しても記録が残る', async () => {
    await stopServer();
    await startServer();
    await page.goto(`${base}/#/board`);
    await page.locator('.col-done .card', { hasText: 'E2E 競合料金調査' }).waitFor();
    await page.locator('.col-error .card', { hasText: 'E2E エラー確認' }).waitFor();
    await page.locator('.col-error .card', { hasText: 'E2E キャンセル確認' }).waitFor();
    await page.locator('.col-todo .card', { hasText: 'E2E 未着手' }).waitFor();
    await page.goto(`${base}/#/jobs/${jobId}`);
    await page.locator('.timeline').getByText('承認: 確認しました。承認します').waitFor();
    await page.goto(`${base}/#/library`);
    await page.getByRole('button', { name: /deliverable\.md/ }).first().click();
    await page.locator('.file-content', { hasText: '【デモ出力】' }).waitFor();
    await page.screenshot({ path: path.join(shots, '10-after-restart-board.png'), fullPage: true });
  });

  await step('動きを減らす設定で演出を止められる', async () => {
    await page.goto(base);
    await page.getByRole('button', { name: '動きを減らす' }).click();
    if ((await page.evaluate(() => document.documentElement.dataset.motion)) !== 'reduced') throw new Error('動きを減らす設定が反映されない');
    await page.getByRole('button', { name: '動きを戻す' }).click();
    if ((await page.evaluate(() => document.documentElement.dataset.motion)) !== 'full') throw new Error('動きを戻せない');
  });

  await step('スマートフォン: 縮めずに表示し、オフィス／社員／案件を切り替えられる', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await person(page, 'qa').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`ページが横にはみ出しています（${overflow}px）`);
    const sceneWidth = await page.locator('.iso-scene').evaluate((el) => el.getBoundingClientRect().width);
    if (sceneWidth < 800) throw new Error(`オフィスが縮小されすぎています（${sceneWidth}px）`);
    await page.screenshot({ path: path.join(shots, '11-mobile.png') });
    await page.getByRole('tab', { name: /社員/ }).click();
    await page.locator('.person-card', { hasText: 'ミナ' }).click();
    await page.locator('[data-testid="employee-panel"]').waitFor();
    await page.screenshot({ path: path.join(shots, '12-mobile-people.png') });
    await page.getByRole('button', { name: '閉じる' }).click();
    await page.getByRole('tab', { name: /案件/ }).click();
    await page.locator('.jobs-list').waitFor();
  });
} finally {
  await browser.close();
  await stopServer();
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} 件成功。スクリーンショット: ${shots}`);
  process.exitCode = failed ? 1 : 0;
}
