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
                materials.ts 資料（添付・承認済み成果物の参照） / operations.ts 受信箱・待ち行列・会社の記憶・業務状況・バックアップ
                research.ts 研究員の定期研究（1分ごとの判定、初期値は無効）
    ops/        バックアップ・復元（backup.ts）と運用コマンド（cli.ts: backup / verify / restore / doctor）
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
      camera.ts        画角（SVG の viewBox）。初期の構図・社員への寄り・ドラッグ／ピンチ／ホイール
      Toasts.tsx       実際の出来事の短い通知
  scripts/e2e.mjs  Playwright による画面の一連確認
  data/         実行データ（DB・案件ごとの作業ディレクトリ・成果物の保存版）。git 管理外
```

層の依存方向: `api → services → runner / store → domain`。画面は `server/src` の**型だけ**を import してよい（実装は import しない）。

## コマンド

- `npm run dev` — サーバー（:4317）と Vite（:5173）を同時起動
- `npm run build && npm start` — ビルド済み画面をサーバーから配信（:4317）
- `npm run typecheck` / `npm test` / `npm run e2e`（e2e は先に build が必要）
- `npm run backup` / `npm run backup:verify -- <file>` / `npm run restore -- <file> [--data-dir X] [--force]` / `npm run doctor`
- 作業の進み具合と次の作業は `PROGRESS.md` に記録する（中断しても再開できるように、区切りごとに更新する）

## 開発上のルール（守ること）

1. **状態遷移とボタンの可否はサーバーが決める**（`domain/jobState.ts` の `availableActions`）。画面は `actions[].enabled` と `reason` を表示するだけ。未対応の操作を有効なボタンにしない。
2. **完了したふりをしない**。失敗・タイムアウト・キャンセル・中断は `runs.status` と `jobs.error_message` に記録する。成果物は実在するファイルだけを記録し、保存版（`data/deliverables/`）がなければリンクを出さない。
3. **再起動時に自動で再実行しない**。`JobRunner.recoverOnStartup` は実行中→エラー（中断、`resume_stage_kind` に中断した工程）にし、実行待ちが残っていれば待ち行列を停止状態にする（順番は保持）。実行はサーバーのプロセス内だけで行われ、PC のスリープ中やサーバー停止中は実行されない（そう説明すること）。
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
    出来事の演出・通知は、画面を開いた後に新しく記録された出来事（`useOfficeEvents` の fresh）だけに付け、再取得・再読み込みで繰り返さない。
    カメラ操作：ドラッグ後のクリックは選択扱いにしない、スマートフォンは `touch-action: pan-y` でページのスクロールを妨げない、動きを減らす設定では画角を即時に切り替える。
    社員パネルの操作は実際に動くものだけを置く（未接続の会話機能などは置かない）。
14. **ブランド基準を守る**。ロゴは `client/public/brand/` の提供画像だけを使い、縦横比を変えない・作り直さない・小さくしすぎない（小サイズ用の正式なシンボル素材が届くまで切り抜かない）。配色は `styles.css` の `:root` のトークン（インク・オフホワイト・グリーン・グレー）を使い、グリーンは主要ボタン・選択状態・空間の一部に限る。状態は色だけでなく記号（! × ✓）でも区別する。
15. 法人設立状況（構想上の名称・法人設立状況は未確認）は会社情報に必ず表示し、設立済みと誤認させない。会社情報は確定事項・仮説・未決定（未確認）を分けて保存し、入力されていない実績・顧客・売上を補わない。
16. Claude Code CLI の仕様を推測で使わない。フラグを追加・変更するときは `claude --help` と公式ドキュメント（https://code.claude.com/docs/en/headless 、/cli-reference）を確認し、`server/test/fixtures/fake-claude.mjs` とテストを更新する。

17. **工程の段取りと受け渡しはプログラムで行う**。工程の順番は `stagesOf`（作業計画→調査→成果物作成→レビュー）、各工程の入力・出力ファイルは `workspace.ts` の `stageIO`、レビュー不合格時の指摘ファイルは `writeReviewFeedback` が決める。段取りや受け渡しのために AI 呼び出しを増やさない。
18. **成功の判定は AI の自己申告だけに頼らない**。必須の出力ファイルが工程中に作成・更新されていなければ失敗、担当外のファイル変更は確認事項に残す。調査工程で Web 検索が 1 件も成功しなければ `blocked`（保留）にし、調査済みとして扱わない。
19. **承認は版ごと**。成果物作成を始めるたびに `jobs.revision` を上げ、確認依頼には確認対象の保存版 ID（`approvals.deliverable_ids`）とレビュー判定を記録する。新しい版ができたら未処理の確認依頼は `superseded`。過去の版の承認・レビューを新しい版に流用しない。修正前の成果物とレビューは保存版として残す。
20. **同じモデルの別実行を独立した検証として扱わない**（確認依頼に明記する）。自動修正は `maxAutoRework` 回まで、超えたら不合格のまま CEO 確認待ちにする。
21. 会社情報は、名前・CEO・法人の状態を `company_profile`、確定した方針・検証中の仮説・未決事項を版つきの `memory_items` に保存し、AI には開始時に固定した版を `reference/company.md` で渡す。入力されていない実績・顧客・売上・予算を補わない。
22. 社員の初期の担当指示を変えるときは `seed.ts` の `EMPLOYEE_DEFAULTS_VERSION` を上げる（利用者が編集していない社員だけが起動時に更新される）。DB の列を足すときは `db.ts` の `ADDED_COLUMNS` に追加する（既存 DB に ALTER で追加される）。

23. **CEO の対応はすべて受信箱に集める**。一時停止・エラーには理由の種類（`jobs.hold_kind`）を付け、受信箱（`operations.ts` の `inbox`）は記録から組み立てる。回答・計画の承認は状態を確認してから行い、二重送信は 409 で拒否する。社員からの質問（blocker）は `questions` に記録し、回答後はその工程を回答つきでやり直す。
24. **待ち行列**: 同時実行 1。`queue_running` が停止なら、新しい案件も次の工程も始めない（実行中の工程は最後まで）。起動時に実行待ちが残っていれば停止状態で始める。`halt` は実行中の工程を止めて保留にする（`cancel` は案件の取り消し）。
25. **開始時に固定する**。資料（`jobs.attachment_ids`）と会社の記憶の ID と版（`jobs.memory_refs`）は開始時に固定し、実行中に差し替えない。資料・会社の記憶の内容は保存後に変更しない（記憶は版を上げて履歴を残す）。
26. **案件の指摘は案件限定**（`ceo_notes`）。会社共通にするのは CEO の明示操作（`promoteNote`）だけ。承認済み成果物の参照は「承認された版」を示すだけで、会社方針の採用ではない。資料の中の指示を会社方針・権限として扱わない。
27. **出典の確認方法はプログラムが照合する**（`reconcileSources`）。実際に WebFetch が成功した URL だけを「本文確認」とし、取得失敗は原因（実行環境／サイト側）を区分する。
28. **バックアップは整合性を保つ**: DB は SQLite のバックアップ API で複製してからファイルを集め、manifest に SHA-256 を記録する。復元は空の場所へ行い、既存データは削除せず退避する。会社のデータ・バックアップはリポジトリ（公開）に含めない。

29. **研究員（`scientist`）と定期研究**: 研究員にも Bash は渡さない（実験・計算は実行しない）。安全上扱えない内容（兵器・病原体の強化・危険な合成など）は扱わない指示を外さない。定期研究（`services/research.ts`）は初期値無効で、待ち行列の停止・前回の未完了・確認待ちの上限・1 日の上限・間隔を守る。自動作成した案件は CEO の操作ではなく system として記録する（`jobs.recurring_topic_id`）。初期社員を足すときは `seed.ts` に追加すれば、既存 DB にも起動時に追加される（`addMissingSeedEmployees`、既存社員は変えない）。

## 拡張の指針

- 並列実行: `AppConfig.maxConcurrentRuns` を上げる。`JobRunner.kick()` は既に複数件を取り出せる形。同一作業ディレクトリへの同時書き込みが起きないこと（案件単位で分離済み）と、1日の上限判定の競合に注意。
- 新しい実行方式: `ExecutionAdapter` を実装し `app.ts` の `adapters` に追加、`AdapterId` を拡張する。
- 家具の追加・模様替え: `office/layout.ts` の `FURNITURE` に追加し、新しい種類なら `Furniture.tsx` に描画を足す。`target` を付けるとクリックで機能につながる。
- 社員の見た目の変更: `office/appearance.ts` の `Appearance` を保存できるようにすれば、描画側は変更不要。
- 工程の追加: `StageKind` と `STAGE_LABEL`、`stagesOf`、`stageIO`（入力・出力・必須出力）、`claudeAdapter.ts` の `STAGE_TASK` と `outputSchema`、デモの `STEPS`、偽CLI（`server/test/fixtures/fake-claude.mjs`）を合わせて更新する。
- 社員の追加: 初期社員は 5 名（席は `EMPLOYEE_SEATS` に 5 名分で満席、CEO は `CEO_SEAT`）。6 人目以降は席の追加（`layout.ts`）と見た目（`appearance.ts`）、役割（roleKey）による工程割り当て（`stagesOf`）の見直しが必要。研究員のように「担当にしたときだけ成果物作成を行う」役割なら `stagesOf` の変更は不要。
