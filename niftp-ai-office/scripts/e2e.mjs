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

async function createJob(page, { title, scenario = 'normal', start = true, assignee = 'researcher' }) {
  await page.goto(`${base}/#/request`);
  await page.getByLabel(/タイトル/).fill(title);
  await page.getByLabel(/^目的/).fill('E2E確認用の目的');
  await page.getByLabel(/^依頼内容/).fill('競合3社の料金を比較してください');
  await page.getByLabel(/^完了条件/).fill('3社の料金表がある\n出典が明記されている');
  await page.getByLabel(/担当社員/).selectOption(assignee);
  await page.getByLabel('デモのシナリオ').selectOption(scenario);
  await page.getByRole('button', { name: start ? '登録して開始' : '登録のみ（未着手）' }).click();
  await page.waitForURL(/#\/jobs\/\d+/);
  return Number(page.url().match(/jobs\/(\d+)/)[1]);
}

// オフィスの社員（data-status は実際の状態）
const person = (page, id) => page.locator(`[data-employee="${id}"]`);
const viewBox = (page) => page.locator('.iso-scene').getAttribute('viewBox');
const settle = (page) => page.waitForTimeout(650);
const vbWidth = (vb) => Number(vb.split(' ')[2]);
const waitStatus = (page, id, status, timeout = 15000) => page.locator(`[data-employee="${id}"][data-status="${status}"]`).waitFor({ timeout });

await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('dialog', (d) => d.accept());
let jobId;

try {
  await step('オフィス画面: エントランス・CEOのデスク・執務・会議室・資料棚・ラウンジと4人のAI社員、デモモード表示', async () => {
    await page.goto(base);
    for (const id of ['entrance', 'whiteboard', 'project-board', 'ceo', 'meeting-sign', 'furniture-shelf-1', 'furniture-meeting-table']) {
      await page.locator(`[data-testid="${id}"]`).first().waitFor();
    }
    for (const id of ['manager', 'researcher', 'builder', 'qa']) await person(page, id).waitFor();
    for (const n of ['ハル', 'ミナ', 'ソラ', 'リツ', 'CEO 植村']) await page.locator('.name-tag', { hasText: n }).waitFor();
    await page.locator('.mode-chip', { hasText: 'デモモード' }).waitFor();
    await page.locator('.brand-logo').waitFor();
    await page.locator('[data-testid="brand-logo"]').waitFor({ state: 'attached' });
    // 法人設立状況は会社情報に整理（設立済みと誤認させない表示を維持）
    await page.locator('.company-pop summary').click();
    await page.locator('.company-pop').getByText('構想上の名称（法人設立状況は未確認。設立済みとして扱わない）').waitFor();
    await page.locator('.company-pop summary').click();
    if ((await page.locator('.character.is-working').count()) !== 0) throw new Error('待機中なのに作業中の演出が表示されている');
    await page.screenshot({ path: path.join(shots, '01-office-idle.png') });

    // 画角：初期表示（デスク中心）⇔ オフィス全体、拡大・縮小
    const home = await viewBox(page);
    await page.getByRole('button', { name: 'オフィス全体' }).click();
    await settle(page);
    const all = await viewBox(page);
    if (!(vbWidth(all) > vbWidth(home) * 1.2)) throw new Error(`オフィス全体に切り替わらない（${home} → ${all}）`);
    await page.screenshot({ path: path.join(shots, '01a-overview.png') });
    await page.getByRole('button', { name: 'デスク中心' }).click();
    await settle(page);
    if ((await viewBox(page)) !== home) throw new Error('デスク中心に戻らない');
    await page.getByRole('button', { name: '拡大' }).click();
    await settle(page);
    if (!(vbWidth(await viewBox(page)) < vbWidth(home))) throw new Error('拡大できない');
    await page.getByRole('button', { name: 'デスク中心' }).click();
    await settle(page);

    // ドラッグで移動しても、社員を選択したことにならない
    const box = await person(page, 'researcher').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    if (await page.locator('[data-testid="employee-panel"]').count()) throw new Error('ドラッグで社員が選択されてしまう');
    if ((await viewBox(page)) === home) throw new Error('ドラッグで画角が動かない');
    await page.getByRole('button', { name: 'デスク中心' }).click();
    await settle(page);

    // プロジェクトボード：データがなければ「最初のプロジェクトを始める」
    await page.getByRole('button', { name: 'オフィス全体' }).click();
    await settle(page);
    await page.locator('[data-testid="project-board"]').click();
    await page.locator('[data-testid="projects-panel"]').getByRole('button', { name: '最初のプロジェクトを始める' }).click();
    await page.waitForURL(/#\/request/);
    await page.goto(base);
    // 家具のクリックが実際の機能につながる
    await page.locator('[data-testid="entrance"]').click();
    await page.locator('[data-testid="entrance-panel"]').getByText('構想上の名称（法人設立状況は未確認。設立済みとして扱わない）').waitFor();
    await page.screenshot({ path: path.join(shots, '01b-company-panel.png') });
    await page.locator('[data-testid="entrance-panel"]').getByRole('button', { name: '閉じる' }).click();
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
    const before = await viewBox(page);
    await person(page, 'researcher').click();
    const panel = page.locator('[data-testid="employee-panel"]');
    await panel.getByText('E2E 競合料金調査').first().waitFor();
    await panel.getByText('調査・企画AI').waitFor();
    for (const t of ['得意な仕事', '取り組んでいる案件', '直近の成果物', 'CEOへの確認事項']) await panel.getByText(t, { exact: true }).waitFor();
    await panel.getByText(/最終更新 \d/).waitFor();
    await panel.getByText(/工程を進めています/).waitFor();
    await settle(page);
    // 選んだ社員へ寄り、詳細パネルに隠れない
    if (!(vbWidth(await viewBox(page)) < vbWidth(before))) throw new Error('選択した社員へ寄らない');
    const pb = await person(page, 'researcher').boundingBox();
    const panelBox = await panel.boundingBox();
    if (!(pb.x + pb.width < panelBox.x)) throw new Error('選択した社員が詳細パネルに隠れている');
    await page.locator('.desk-highlight').waitFor({ state: 'attached' });
    await page.screenshot({ path: path.join(shots, '03-employee-panel.png') });
    // 閉じると元の画角に戻る
    await panel.getByRole('button', { name: '閉じる' }).click();
    await settle(page);
    if ((await viewBox(page)) !== before) throw new Error('パネルを閉じても元の画角に戻らない');
    // 品質確認への引き継ぎで書類が渡る演出
    await waitStatus(page, 'qa', 'working', 20000);
    await page.locator('.fx-doc').first().waitFor({ state: 'attached', timeout: 5000 });
    await waitStatus(page, 'researcher', 'waiting_review', 20000);
  });

  await step('社員パネルから「確認に答える」で該当の承認へ、「仕事を依頼する」で担当選択済みの依頼フォームへ', async () => {
    await person(page, 'researcher').click();
    const panel = page.locator('[data-testid="employee-panel"]');
    await panel.getByRole('button', { name: '確認に答える' }).click();
    await page.waitForURL(/#\/approvals\/\d+/);
    await page.locator('.approval-card.is-focused', { hasText: 'E2E 競合料金調査' }).waitFor();
    await page.goto(base);
    await person(page, 'builder').click();
    await page.locator('[data-testid="employee-panel"]').getByRole('button', { name: '仕事を依頼する' }).click();
    await page.waitForURL(/#\/request\?assignee=builder/);
    if ((await page.getByLabel(/担当社員/).inputValue()) !== 'builder') throw new Error('担当社員が選択された状態で開かない');
    await page.goto(base);
  });

  await step('再読み込みしても通知や演出が繰り返されない', async () => {
    await page.reload();
    await person(page, 'qa').waitFor();
    await page.waitForTimeout(2500);
    const toasts = await page.locator('.toast').count();
    const bubbles = await page.locator('.fx-bubble').count();
    if (toasts || bubbles) throw new Error(`再読み込みで過去の出来事が再演出された（通知 ${toasts}・吹き出し ${bubbles}）`);
  });

  await step('CEOのデスクと資料棚に通知が出て、クリックで承認・成果物へつながる', async () => {
    await page.getByRole('button', { name: 'オフィス全体' }).click();
    await settle(page);
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
    await page.getByRole('button', { name: '一覧' }).click();
    await page.locator('[data-testid="list-panel"] .person-card').nth(3).waitFor();
    await page.locator('[data-testid="list-panel"] .person-card', { hasText: 'リツ' }).click();
    await page.locator('[data-testid="employee-panel"]').getByText('品質確認AI').waitFor();
    await page.locator('[data-testid="employee-panel"]').getByRole('button', { name: '閉じる' }).click();
    await page.getByRole('button', { name: '出来事' }).click();
    await page.locator('[data-testid="events-panel"]').getByText('レビュー依頼').first().waitFor();
    await page.screenshot({ path: path.join(shots, '03d-events-panel.png') });
  });

  await step('3. 処理履歴と成果物が案件に記録される', async () => {
    await page.goto(`${base}/#/jobs/${jobId}`);
    await page.locator('.page-head .badge', { hasText: '確認待ち' }).waitFor();
    await page.locator('.timeline').getByText('［デモ］成果物を outputs/deliverables/deliverable.md に書き出し').waitFor();
    // 工程ごとの入力ファイル（前の工程の出力を引き継ぐ）
    await page.locator('details.run-io summary').nth(2).click();
    await page.locator('details.run-io[open]').getByText(/outputs\/deliverables\/deliverable\.md/).first().waitFor();
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

  await step('4b. 差し戻しを反映した第2版を作り、その版を承認する → 完了、承認した版が記録に残る', async () => {
    await page.goto(`${base}/#/jobs/${jobId}`);
    await page.getByText('出典URLを各数値の横に追加してください').first().waitFor();
    await page.getByRole('button', { name: '続きから開始（成果物作成から）' }).click();
    await page.locator('.page-head .badge', { hasText: '確認待ち' }).waitFor({ timeout: 25000 });
    const card = page.locator('.approval-card');
    await card.getByText('第2版', { exact: true }).waitFor();
    await card.getByText('レビュー: 合格').waitFor();
    // 作業計画はやり直さない（第2版は成果物作成とレビューだけ）
    if ((await page.locator('tr[data-testid^="run-"]').count()) !== 5) throw new Error('差し戻し後の修正で作業計画からやり直している');
    await card.getByLabel(/CEOコメント/).fill('確認しました。承認します');
    await card.getByRole('button', { name: '承認する' }).click();
    await page.locator('.page-head .badge', { hasText: '完了' }).waitFor();
    for (const a of await page.locator('.job-actions button').all()) {
      if (await a.isEnabled()) throw new Error(`完了した案件で「${await a.textContent()}」が押せる`);
    }
    await page.goto(`${base}/#/approvals`);
    await page.locator('.table').getByText('確認しました。承認します').waitFor();
    await page.locator('.table').getByText('出典URLを各数値の横に追加してください').waitFor();
    await page.locator('.table tr', { hasText: '確認しました。承認します' }).getByText(/第2版/).waitFor();
    await page.locator('.table tr', { hasText: '出典URLを各数値の横に追加してください' }).getByText(/第1版/).waitFor();
    await page.screenshot({ path: path.join(shots, '07-approval-history.png'), fullPage: true });
    await page.goto(base);
    await page.getByRole('button', { name: 'オフィス全体' }).click();
    await settle(page);
    await page.locator('[data-testid="project-board"]').click();
    await page.locator('[data-testid="projects-panel"]').getByText('E2E 競合料金調査').waitFor();
    await page.locator('[data-testid="projects-panel"]').getByRole('button', { name: /成果を見る/ }).first().waitFor();
    await page.screenshot({ path: path.join(shots, '07b-project-board.png') });
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
    await page.locator('.name-tag', { hasText: 'エラー' }).first().waitFor();
    await person(page, 'researcher').click();
    const panel = page.locator('[data-testid="employee-panel"]');
    await panel.getByText('エラーの理由').waitFor();
    await panel.getByText('エラー再現シナリオ').first().waitFor();
    await panel.getByText('次の対応').waitFor();
    await panel.getByRole('button', { name: '案件を見る' }).waitFor();
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

  await step('レビュー不合格は自動で1回修正し、前の版のレビューも残る（調査工程つき）', async () => {
    await createJob(page, { title: 'E2E 自動修正', scenario: 'rework', assignee: 'builder' });
    await page.locator('.page-head .badge', { hasText: '確認待ち' }).waitFor({ timeout: 40000 });
    const runs = page.locator('tr[data-testid^="run-"]');
    if ((await runs.count()) !== 6) throw new Error(`工程数が想定と違う: ${await runs.count()}`);
    await runs.nth(1).getByText('調査').waitFor();
    await runs.nth(3).getByText('不合格', { exact: true }).waitFor();
    await runs.nth(4).getByText('第2版').waitFor();
    await runs.nth(5).getByText('合格', { exact: true }).waitFor();
    await page.locator('.approval-card').getByText('第2版', { exact: true }).waitFor();
    const reviews = page.locator('.detail-grid .table tr', { hasText: 'review.md' });
    if ((await reviews.count()) !== 2) throw new Error('第1版のレビューが残っていない');
    await page.screenshot({ path: path.join(shots, '09b-auto-rework.png'), fullPage: true });
  });

  await step('会社情報を確定事項・仮説・未確認に分けて編集できる', async () => {
    await page.goto(`${base}/#/settings`);
    const company = page.locator('#company');
    if ((await company.getByLabel('仮説（検証が必要）').inputValue()) !== '') throw new Error('仮説が勝手に補完されている');
    if (!(await company.getByLabel('未決定・未確認').inputValue()).includes('実際の売上')) throw new Error('未確認事項がない');
    await company.getByLabel('仮説（検証が必要）').fill('E2E確認用の仮説');
    await company.getByRole('button', { name: '保存' }).click();
    await company.getByText('保存しました').waitFor();
    await page.reload();
    if ((await page.locator('#company').getByLabel('仮説（検証が必要）').inputValue()) !== 'E2E確認用の仮説') throw new Error('会社情報が保存されていない');
    await page.locator('.employee-editor').first().locator('summary').click();
    await page.locator('.employee-editor').first().getByLabel(/提出形式/).waitFor();
    await page.locator('.employee-editor').first().getByLabel(/人間に戻す条件/).waitFor();
    await page.screenshot({ path: path.join(shots, '09c-settings-company.png'), fullPage: true });
  });

  await step('案件ボードでデモ案件と実案件を分けて表示できる', async () => {
    await page.goto(`${base}/#/board`);
    await page.getByLabel('案件の種類').selectOption('real');
    if ((await page.locator('.board .card').count()) !== 0) throw new Error('実案件の表示にデモ案件が混ざる');
    await page.getByLabel('案件の種類').selectOption('demo');
    await page.locator('.board .card', { hasText: 'E2E 自動修正' }).waitFor();
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
    await page.locator('.timeline').getByText(/第2版を承認（ファイル\d+件）: 確認しました。承認します/).waitFor();
    await page.goto(`${base}/#/library`);
    await page.getByRole('button', { name: /deliverable\.md/ }).first().click();
    await page.locator('.file-content', { hasText: '【デモ出力】' }).waitFor();
    await page.screenshot({ path: path.join(shots, '10-after-restart-board.png'), fullPage: true });
  });

  await step('動きを減らす設定で演出を止められる', async () => {
    await page.goto(base);
    await page.getByRole('button', { name: '動きを減らす' }).click();
    if ((await page.evaluate(() => document.documentElement.dataset.motion)) !== 'reduced') throw new Error('動きを減らす設定が反映されない');
    // 動きを減らす設定では画角の切り替えが即時
    await page.getByRole('button', { name: 'オフィス全体' }).click();
    const immediate = await viewBox(page);
    await settle(page);
    if (immediate !== (await viewBox(page))) throw new Error('動きを減らす設定でも画角がアニメーションしている');
    await page.getByRole('button', { name: '動きを戻す' }).click();
    if ((await page.evaluate(() => document.documentElement.dataset.motion)) !== 'full') throw new Error('動きを戻せない');
  });

  await step('スマートフォン: 縮めずに表示し、オフィス／社員／案件を切り替えられる', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await person(page, 'qa').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`ページが横にはみ出しています（${overflow}px）`);
    // 初期表示でロゴ・オフィスの主要部分・仕事を依頼する操作が見える
    for (const sel of ['.brand-logo', '.hq-hud .btn.primary']) {
      const box = await page.locator(sel).boundingBox();
      if (!box || box.y + box.height > 844) throw new Error(`${sel} が初期表示に入っていません`);
    }
    const sceneBox = await page.locator('.hq-scene').boundingBox();
    if (!sceneBox || sceneBox.y > 200) throw new Error('オフィスが画面下に押し出されています');
    // 縦のスワイプはページのスクロールに使われ、オフィスの操作で妨げない
    const touchAction = await page.locator('.hq-scene').evaluate((el) => getComputedStyle(el).touchAction);
    if (touchAction !== 'pan-y') throw new Error(`touch-action が pan-y ではありません（${touchAction}）`);
    // 社員の名札が読める大きさ
    const tag = await page.locator('.name-tag', { hasText: 'ミナ' }).boundingBox();
    if (!tag || tag.height < 11) throw new Error(`名札が小さすぎます（${tag?.height}px）`);
    await page.getByRole('button', { name: 'メニュー' }).click();
    await page.locator('.menu-sheet').getByText('構想上の名称（法人設立状況は未確認。設立済みとして扱わない）').waitFor();
    await page.getByRole('button', { name: 'メニュー' }).click();
    await page.screenshot({ path: path.join(shots, '11-mobile.png') });
    // オフィスで社員を選ぶと下からパネルが開き、社員はパネルの上に見える
    await person(page, 'researcher').click();
    const sheet = page.locator('[data-testid="employee-panel"]');
    await sheet.waitFor();
    await settle(page);
    const pbox = await person(page, 'researcher').boundingBox();
    const sbox = await sheet.boundingBox();
    if (!(pbox.y + pbox.height * 0.5 < sbox.y)) throw new Error('選択した社員が下からのパネルに隠れている');
    await page.screenshot({ path: path.join(shots, '11b-mobile-select.png') });
    await sheet.getByRole('button', { name: '閉じる' }).click();
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
