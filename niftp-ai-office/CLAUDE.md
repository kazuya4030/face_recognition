# NIFTP AI Office — 開発メモ（Claude Code 向け）

## 目的

CEO（植村和也）が、仮想オフィスにいるAI社員へ仕事を依頼し、進捗確認・成果物の受領・承認／差し戻しを行うローカルWebアプリ。
「株式会社NIFTP」は**構想上の名称**であり、法人設立済みとして扱わない（画面・文書・AIへの指示すべてで同様）。

## 構成

```
niftp-ai-office/
  server/src/
    domain/     状態・型・状態遷移ルール（jobState.ts）・初期社員（seed.ts）。他層に依存しない
    store/      SQLite（node:sqlite）。SQL はこの層だけに書く
    runner/     AI実行部分。adapter.ts（共通IF）/ demoAdapter.ts / claudeAdapter.ts / jobRunner.ts（実行キュー）
    services/   業務管理（office.ts）。CEOの操作・入力検証・画面向け集計
    api/        HTTP（Fastify）とローカル専用の防御（security.ts）
    app.ts      各層の組み立て / index.ts 起動
  server/test/  vitest（業務フロー・偽CLIでのアダプター・防御）
  client/src/   React 画面。pages/ に画面ごとのコンポーネント
    office/     オフィス画面の描画（SVG のアイソメトリック表示。3Dエンジンは使わない）
      iso.ts        投影計算（床座標 x,y,z → 画面座標）と描画順のキー
      layout.ts     家具・壁・共同デスクと席の配置データ（模様替えはこのデータを変える）。CEO も共同デスクの席
      appearance.ts 社員の見た目（髪型・服装・小物・デスク周り）。将来サーバー保存に置き換えられる形
      Character.tsx / Furniture.tsx / Room.tsx  人物・家具・床と壁の描画
      OfficeScene.tsx  奥から手前へ並べて描画し、名札・通知・演出を最前面に重ねる
      Panels.tsx       社員・CEOのデスク・資料棚・実績ボードなどの詳細パネル
      state.ts         出来事の取得、動きを減らす設定、資料棚の既読（閲覧者ごとの localStorage）
  scripts/e2e.mjs  Playwright による画面の一連確認
  data/         実行データ（DB・案件ごとの作業ディレクトリ・成果物の保存版）。git 管理外
```

層の依存方向: `api → services → runner / store → domain`。画面は `server/src` の**型だけ**を import してよい（実装は import しない）。

## コマンド

- `npm run dev` — サーバー（:4317）と Vite（:5173）を同時起動
- `npm run build && npm start` — ビルド済み画面をサーバーから配信（:4317）
- `npm run typecheck` / `npm test` / `npm run e2e`（e2e は先に build が必要）

## 開発上のルール（守ること）

1. **状態遷移とボタンの可否はサーバーが決める**（`domain/jobState.ts` の `availableActions`）。画面は `actions[].enabled` と `reason` を表示するだけ。未対応の操作を有効なボタンにしない。
2. **完了したふりをしない**。失敗・タイムアウト・キャンセル・中断は `runs.status` と `jobs.error_message` に記録する。成果物は実在するファイルだけを記録し、保存版（`data/deliverables/`）がなければリンクを出さない。
3. **再起動時に自動で再実行しない**。`JobRunner.recoverOnStartup` は実行中→エラー（中断）、実行待ち→一時停止にする。
4. **費用は推測しない**。Claude Code が `total_cost_usd` を返したときだけ記録し、なければ null（画面は「未取得」）。
5. **AIの内部思考は記録しない**。記録するのはツール操作・結果・根拠・確認事項・権限拒否のみ。
6. **秘密情報を出さない**。子プロセスの環境変数は `claudeAdapter.ts` の許可リスト方式。ログ・DBに入る文字列は `redact()` を通す。API はブラウザへ環境変数を返さない。
7. **ユーザー入力をシェルに渡さない**。`spawn(..., { shell: false })` で引数配列を使い、依頼内容は標準入力と `brief.md` で渡す。
8. **権限確認を無効化しない**。`--dangerously-skip-permissions` / `bypassPermissions` は使用禁止。Claude Code は `--permission-mode acceptEdits` + `--permission-prompts none` + `--tools`（Bash なし）で、案件の作業ディレクトリ内だけを編集できる。
9. **外部に影響する処理（メール送信・外部公開・支払い・ファイル削除）は自動実行しない**。必要ならAIに確認事項として挙げさせ、CEOが判断する。
10. **上限を外さない**。ターン数・費用・時間・1日の工程数・1案件の実行回数は `SETTINGS_LIMITS` の範囲で設定する。
11. サーバーは `127.0.0.1` / `localhost` / `::1` でのみ待ち受ける（`config.ts` で強制）。変更系 API は `X-NIFTP-Office: 1` ヘッダー必須。
12. **オフィスの演出は実際の記録と連動させる**。作業中の動き・進捗は社員の状態（`working`）と案件の工程から、吹き出し・書類の受け渡しは `/api/office/events`（実行履歴・成果物・承認の記録から導出、`services/officeEvents.ts`）からだけ出す。社員の発言・会話・成果・能力値・売上などを作って表示しない。まばたき・呼吸など、状態と無関係な装飾は待機中でもよい。
13. 演出は操作を妨げない（`pointer-events: none`、クリック対象は動かさない）。見逃しても同じ情報を「出来事」パネルと案件履歴で確認できること。`data-motion="reduced"` のときはアニメーションを止める。
14. **ブランド基準を守る**。ロゴは `client/public/brand/` の提供画像だけを使い、縦横比を変えない・作り直さない・小さくしすぎない（小サイズ用の正式なシンボル素材が届くまで切り抜かない）。配色は `styles.css` の `:root` のトークン（インク・オフホワイト・グリーン・グレー）を使い、グリーンは主要ボタン・選択状態・空間の一部に限る。状態は色だけでなく記号（! × ✓）でも区別する。
15. 法人設立状況（構想上の名称・法人未設立）は会社情報に必ず表示し、設立済みと誤認させない。
16. Claude Code CLI の仕様を推測で使わない。フラグを追加・変更するときは `claude --help` と公式ドキュメント（https://code.claude.com/docs/en/headless 、/cli-reference）を確認し、`server/test/fixtures/fake-claude.mjs` とテストを更新する。

## 拡張の指針

- 並列実行: `AppConfig.maxConcurrentRuns` を上げる。`JobRunner.kick()` は既に複数件を取り出せる形。同一作業ディレクトリへの同時書き込みが起きないこと（案件単位で分離済み）と、1日の上限判定の競合に注意。
- 新しい実行方式: `ExecutionAdapter` を実装し `app.ts` の `adapters` に追加、`AdapterId` を拡張する。
- 家具の追加・模様替え: `office/layout.ts` の `FURNITURE` に追加し、新しい種類なら `Furniture.tsx` に描画を足す。`target` を付けるとクリックで機能につながる。
- 社員の見た目の変更: `office/appearance.ts` の `Appearance` を保存できるようにすれば、描画側は変更不要。
- 社員の追加: 現状は初期4名の編集のみ（席は `EMPLOYEE_SEATS` に5名分、CEO は `CEO_SEAT`）。追加する場合は `employees` への INSERT と、役割（roleKey）による工程割り当て（`stagesOf`）の見直しが必要。
