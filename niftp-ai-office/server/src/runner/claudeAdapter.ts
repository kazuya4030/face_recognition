// Claude Code 実行アダプター。導入済みの claude CLI を非対話モード（-p, stream-json）で起動する。
// 仕様の根拠: `claude --help`（v2.1.312）と公式ドキュメント https://code.claude.com/docs/en/headless ・ /cli-reference
//
// 安全上の方針:
// - シェルを介さず引数配列で起動する（shell: false）。依頼内容は標準入力と brief.md で渡し、コマンドラインに埋め込まない。
// - 権限確認を無効化するオプション（--dangerously-skip-permissions / bypassPermissions）は使わない。
//   --permission-mode acceptEdits（作業ディレクトリ内の編集のみ自動許可）+ --permission-prompts none（それ以外は拒否）。
// - 使えるツールを --tools で限定し、Bash は渡さない。MCP ツールは無効化する。
// - 子プロセスに渡す環境変数は許可リスト方式（GitHub・クラウドの資格情報などは渡さない）。
// - ターン数・費用・時間に上限を設ける。
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import type { ReviewItem, RunUsage, StageKind } from '../domain/types.ts';
import { emptyResult, type AdapterAvailability, type ExecutionAdapter, type StageContext, type StageResult, type WebStats } from './adapter.ts';
import { redact, truncate } from './redact.ts';

const ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TZ',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'XDG_CONFIG_HOME',
  'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
  // Claude Code 自身の認証・接続設定（値はブラウザ・ログ・DBへは出さない）
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'ANTHROPIC_VERTEX_PROJECT_ID', 'CLOUD_ML_REGION',
];

/** Bedrock 等を使う場合だけ必要になる資格情報。該当プロバイダーが有効なときのみ渡す。 */
const PROVIDER_ENV: Record<string, string[]> = {
  CLAUDE_CODE_USE_BEDROCK: ['AWS_REGION', 'AWS_PROFILE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'],
  CLAUDE_CODE_USE_VERTEX: ['GOOGLE_APPLICATION_CREDENTIALS'],
};

export function buildChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const names = [...ENV_ALLOWLIST];
  for (const [flag, extra] of Object.entries(PROVIDER_ENV)) if (source[flag]) names.push(...extra);
  for (const extra of (source.NIFTP_CLAUDE_ENV_PASSTHROUGH ?? '').split(',').map((s) => s.trim()).filter(Boolean)) names.push(extra);
  for (const n of names) if (source[n] != null) env[n] = source[n];
  return env;
}

const QUESTIONS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      severity: { type: 'string', enum: ['info', 'warning', 'blocker'] },
    },
    required: ['text', 'severity'],
  },
  description: 'CEOへの確認事項・指摘。blocker は「人間に戻す条件」に該当する場合だけ使う',
};

/** 最終回答の形式（--json-schema）。工程ごとに必要な項目を足す。 */
export function outputSchema(kind: StageKind) {
  const properties: Record<string, unknown> = {
    summary: { type: 'string', description: '実施した作業と結果の要約（日本語、300字以内）' },
    deliverables: { type: 'array', items: { type: 'string' }, description: '作成・更新したファイル（作業ディレクトリからの相対パス）' },
    evidence: { type: 'array', items: { type: 'string' }, description: '根拠として参照したURL・資料・ファイル（実際に参照したものだけ）' },
    questions: QUESTIONS_SCHEMA,
  };
  const required = ['summary', 'deliverables', 'evidence', 'questions'];
  if (kind === 'research') {
    properties.webStatus = {
      type: 'string',
      enum: ['available', 'search_only', 'unavailable'],
      description: 'Webの利用状況。available: 検索とページ本文の取得ができた／search_only: 検索結果のみ／unavailable: 検索できなかった',
    };
    required.push('webStatus');
  }
  if (kind === 'review') {
    properties.verdict = { type: 'string', enum: ['pass', 'fail'], description: '判定。提出物の欠落・出典と食い違う事実・計算誤り・禁止事項への抵触があれば fail' };
    required.push('verdict');
  }
  return { type: 'object', properties, required };
}

const STAGE_TASK: Record<StageKind, string> = {
  plan: '依頼書を読み、提出物ごとに担当工程・必要な入力・完了条件・確認方法を決めた作業計画を作ってください。成果物そのものはまだ作らないでください。',
  research: '作業計画に沿って調査し、事実（出典付き）と仮説・推測と未確認事項を分けて調査結果にまとめてください。',
  execute: '作業計画と調査結果を使い、依頼の提出物を作ってください。入力にレビューの指摘やCEOのコメントがある場合は、それに対応した新しい版にしてください。',
  review: '提出物を、依頼書の条件と調査結果（原資料）に照らして確認し、問題点と判定（合格／不合格）を出してください。提出物は変更しないでください。',
};

export function buildSystemPrompt(ctx: Pick<StageContext, 'employee' | 'company'>): string {
  return [
    `あなたは「${ctx.company.name}」（${ctx.company.status}）のAI社員「${ctx.employee.name}」（役割: ${ctx.employee.roleTitle}）です。CEOは${ctx.company.ceo}です。`,
    '共通ルール:',
    '- 作業は現在の作業ディレクトリの中だけで行う。指定された出力ファイル以外は作成・変更しない。',
    '- メール送信・外部への連絡・外部公開・契約・支払い・ファイル削除は行わない。必要な場合は questions に書いてCEOの判断を求める。',
    '- 確認できない事実・出典・会社の実績・顧客・売上を作らない。推測は推測、仮説は仮説と明記する。',
    '- 日本語で書く。',
    '- 最終回答は指定されたJSON形式で、実施した操作・結果・根拠・確認事項を返す。',
    '',
    '担当指示:',
    ctx.employee.instructions,
    ...(ctx.employee.outputFormat ? ['', '提出形式:', ctx.employee.outputFormat] : []),
    ...(ctx.employee.escalation ? ['', '人間に戻す条件:', ctx.employee.escalation] : []),
  ].join('\n');
}

export function buildArgs(ctx: StageContext): string[] {
  const tools = ctx.employee.tools.filter((t) => /^[A-Za-z]+$/.test(t));
  const budget = Math.max(0.05, Math.min(ctx.settings.maxBudgetUsd, ctx.budgetUsd));
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--tools', tools.join(','),
    '--permission-mode', 'acceptEdits',
    '--permission-prompts', 'none',
    '--max-turns', String(ctx.settings.maxTurns),
    '--max-budget-usd', String(budget),
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disallowedTools', 'mcp__*',
    '--append-system-prompt', buildSystemPrompt(ctx),
    '--json-schema', JSON.stringify(outputSchema(ctx.stage.kind)),
  ];
  // Web の閲覧は読み取りのみ。社員設定でツールに含めた場合だけ事前許可する。
  const web = tools.filter((t) => t === 'WebSearch' || t === 'WebFetch');
  if (web.length > 0) args.push('--allowedTools', web.join(','));
  if (ctx.settings.claudeModel && /^[A-Za-z0-9._\-[\]]+$/.test(ctx.settings.claudeModel)) {
    args.push('--model', ctx.settings.claudeModel);
  }
  return args;
}

/** 標準入力で渡す指示。入力・出力ファイルの一覧はプログラムが作業ディレクトリの内容から決める。 */
export function buildStagePrompt(ctx: StageContext): string {
  const version = ctx.stage.kind === 'execute' || ctx.stage.kind === 'review' ? `、成果物 第${ctx.revision}版` : '';
  return [
    `【工程】${STAGE_TASK[ctx.stage.kind]}`,
    '',
    '【入力ファイル】（作業ディレクトリからの相対パス。最初にすべて読むこと）',
    ...(ctx.io.inputs.length > 0 ? ctx.io.inputs.map((f) => `- ${f.path} … ${f.label}`) : ['- なし']),
    '',
    '【出力ファイル】（ここにだけ書くこと）',
    ...ctx.io.outputs.map((f) => `- ${f.path} … ${f.label}`),
    '',
    `【実行日】${ctx.today}（出典の確認日にはこの日付を使う）`,
    `【案件】#${ctx.job.id}、${ctx.attempt}回目の実行${version}`,
  ].join('\n');
}

function summarizeToolInput(name: string, input: Record<string, unknown>, cwd: string): string {
  const rel = (p: unknown) => (typeof p === 'string' ? (path.isAbsolute(p) ? path.relative(cwd, p) || '.' : p) : '');
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return rel(input.file_path);
    case 'Glob':
    case 'Grep':
      return String(input.pattern ?? '');
    case 'WebSearch':
      return String(input.query ?? '');
    case 'WebFetch':
      return String(input.url ?? '');
    default:
      return '';
  }
}

const TOOL_LABEL: Record<string, string> = {
  Read: 'ファイルを読む', Write: 'ファイルを書く', Edit: 'ファイルを編集', Glob: 'ファイルを検索', Grep: '内容を検索',
  WebSearch: 'Web検索', WebFetch: 'Webページを取得', StructuredOutput: '報告を提出（指定形式）',
};

interface StreamTrack {
  model: string;
  toolNames: Map<string, string>;
  web: WebStats;
}

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** result メッセージの usage（トークン数）。項目がなければ null のまま記録する。 */
export function parseUsage(v: unknown): RunUsage | null {
  if (!v || typeof v !== 'object') return null;
  const u = v as Record<string, unknown>;
  const server = (u.server_tool_use ?? {}) as Record<string, unknown>;
  return {
    inputTokens: numOrNull(u.input_tokens),
    outputTokens: numOrNull(u.output_tokens),
    cacheReadTokens: numOrNull(u.cache_read_input_tokens),
    cacheCreationTokens: numOrNull(u.cache_creation_input_tokens),
    webSearchRequests: numOrNull(server.web_search_requests),
  };
}

function parseItems(v: unknown): ReviewItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((q): ReviewItem | null => {
      if (typeof q === 'string') return { text: q, severity: 'info' };
      if (q && typeof q === 'object' && typeof (q as ReviewItem).text === 'string') {
        const sev = (q as ReviewItem).severity;
        return { text: (q as ReviewItem).text, severity: sev === 'warning' || sev === 'blocker' ? sev : 'info' };
      }
      return null;
    })
    .filter((x): x is ReviewItem => x != null);
}

export class ClaudeCodeAdapter implements ExecutionAdapter {
  readonly id = 'claude' as const;
  readonly label = 'Claude Code';
  readonly isDemo = false;
  readonly supportsStepPause = false;
  private status: AdapterAvailability = { ok: false, detail: '確認中' };

  constructor(private readonly bin: string, private readonly env: NodeJS.ProcessEnv = process.env) {}

  availability(): AdapterAvailability {
    return this.status;
  }

  refreshAvailability(): Promise<AdapterAvailability> {
    return new Promise((resolve) => {
      execFile(this.bin, ['--version'], { env: buildChildEnv(this.env), timeout: 15000 }, (err, stdout) => {
        this.status = err
          ? { ok: false, detail: `Claude Code CLI が見つからないか起動できません（${this.bin}）` }
          : { ok: true, detail: 'Claude Code CLI を検出しました', version: stdout.trim() };
        resolve(this.status);
      });
    });
  }

  runStage(ctx: StageContext): Promise<StageResult> {
    return new Promise((resolve) => {
      const child = spawn(this.bin, buildArgs(ctx), {
        cwd: ctx.workspaceDir,
        env: buildChildEnv(this.env),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let resultMsg: Record<string, unknown> | null = null;
      const track: StreamTrack = { model: '', toolNames: new Map(), web: { searches: 0, searchErrors: 0, fetches: 0, fetchErrors: 0, reported: '' } };
      let stderrTail = '';
      let killTimers: NodeJS.Timeout[] = [];
      let spawnError = '';

      const onAbort = () => {
        ctx.emit({ kind: 'system', message: ctx.signal.reason === 'timeout' ? '制限時間に達したため停止信号を送信' : 'キャンセル指示により停止信号を送信' });
        // 公式ドキュメント: SIGINT でターンを終了、応答がなければ SIGTERM、最後に SIGKILL。
        child.kill('SIGINT');
        killTimers = [
          setTimeout(() => child.kill('SIGTERM'), 5000),
          setTimeout(() => child.kill('SIGKILL'), 15000),
        ];
      };
      if (ctx.signal.aborted) onAbort();
      else ctx.signal.addEventListener('abort', onAbort, { once: true });

      child.on('error', (e) => {
        spawnError = `Claude Code を起動できませんでした: ${e.message}`;
      });
      child.stdin.on('error', () => {});
      child.stdin.end(buildStagePrompt(ctx));

      child.stderr.on('data', (d: Buffer) => {
        stderrTail = (stderrTail + d.toString('utf8')).slice(-2000);
      });

      const rl = readline.createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        this.handleMessage(msg, ctx, track, (r) => (resultMsg = r));
      });

      child.on('close', (code, sig) => {
        ctx.signal.removeEventListener('abort', onAbort);
        killTimers.forEach(clearTimeout);
        resolve(this.toResult(ctx, resultMsg, track, code, sig, spawnError, stderrTail));
      });
    });
  }

  private handleMessage(msg: Record<string, unknown>, ctx: StageContext, track: StreamTrack, setResult: (r: Record<string, unknown>) => void) {
    const type = msg.type;
    const subtype = msg.subtype;
    if (type === 'system' && subtype === 'init') {
      track.model = typeof msg.model === 'string' ? msg.model : '';
      ctx.emit({ kind: 'system', message: `Claude Code を起動（モデル: ${String(msg.model ?? '不明')}、権限モード: ${String(msg.permissionMode ?? '不明')}）` });
    } else if (type === 'system' && subtype === 'permission_denied') {
      ctx.emit({ kind: 'denied', message: `権限により拒否: ${String(msg.tool_name ?? '')}`, detail: redact(truncate(String(msg.decision_reason ?? ''), 300)) });
    } else if (type === 'system' && subtype === 'api_retry') {
      ctx.emit({ kind: 'system', message: `API再試行 ${String(msg.attempt)}/${String(msg.max_retries)}（${String(msg.error ?? '')}）` });
    } else if (type === 'assistant' || type === 'user') {
      const content = ((msg.message as { content?: unknown[] } | undefined)?.content ?? []) as Record<string, unknown>[];
      for (const c of content) {
        // 内部思考（thinking）や途中の発話は記録しない。実行した操作と結果だけを残す。
        if (c.type === 'tool_use') {
          const name = String(c.name);
          track.toolNames.set(String(c.id), name);
          if (name === 'WebSearch') track.web.searches++;
          if (name === 'WebFetch') track.web.fetches++;
          const target = summarizeToolInput(name, (c.input ?? {}) as Record<string, unknown>, ctx.workspaceDir);
          ctx.emit({ kind: 'action', message: `${TOOL_LABEL[name] ?? name}${target ? `: ${redact(truncate(target, 200))}` : ''}` });
        } else if (c.type === 'tool_result' && c.is_error) {
          const toolName = track.toolNames.get(String(c.tool_use_id));
          if (toolName === 'WebSearch') track.web.searchErrors++;
          if (toolName === 'WebFetch') track.web.fetchErrors++;
          const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
          ctx.emit({ kind: 'error', message: `ツール実行が失敗${toolName ? `（${TOOL_LABEL[toolName] ?? toolName}）` : ''}`, detail: redact(truncate(text, 400)) });
        }
      }
    } else if (type === 'result') {
      setResult(msg);
    }
  }

  private toResult(
    ctx: StageContext,
    msg: Record<string, unknown> | null,
    track: StreamTrack,
    code: number | null,
    sig: NodeJS.Signals | null,
    spawnError: string,
    stderrTail: string,
  ): StageResult {
    const cost = typeof msg?.total_cost_usd === 'number' ? (msg.total_cost_usd as number) : null;
    const base = {
      costUsd: cost,
      costNote: cost == null ? '' : 'Claude Code が報告した推定値（実際の請求額と異なる場合があります）',
      numTurns: typeof msg?.num_turns === 'number' ? (msg.num_turns as number) : null,
      model: track.model,
      usage: parseUsage(msg?.usage),
      web: ctx.employee.tools.some((t) => t === 'WebSearch' || t === 'WebFetch') ? track.web : null,
    };
    if (ctx.signal.aborted) {
      const timeout = ctx.signal.reason === 'timeout';
      return emptyResult(timeout ? 'timeout' : 'cancelled', {
        ...base,
        error: timeout ? `制限時間（${ctx.settings.timeoutSec}秒）を超えたため停止しました` : 'CEOの指示でキャンセルしました',
      });
    }
    if (spawnError) return emptyResult('failed', { ...base, error: spawnError });
    if (!msg) {
      return emptyResult('failed', {
        ...base,
        error: redact(`Claude Code が結果を返さずに終了しました（終了コード: ${code ?? 'なし'}、シグナル: ${sig ?? 'なし'}）${stderrTail ? `\n${truncate(stderrTail, 800)}` : ''}`),
      });
    }

    const structured = msg.structured_output as Record<string, unknown> | undefined;
    const resultText = typeof msg.result === 'string' ? msg.result : '';
    const denials = Array.isArray(msg.permission_denials) ? msg.permission_denials.length : 0;
    const summary = redact(truncate(typeof structured?.summary === 'string' ? structured.summary : resultText, 2000));
    const evidence = Array.isArray(structured?.evidence) ? (structured.evidence as unknown[]).map((e) => redact(truncate(String(e), 500))) : [];
    const items = parseItems(structured?.questions).map((i) => ({ ...i, text: redact(truncate(i.text, 1000)) }));
    if (denials > 0) items.push({ text: `権限により拒否された操作が${denials}件あります（作業履歴を確認してください）`, severity: 'warning' });

    if (msg.is_error || msg.subtype !== 'success') {
      const reason: Record<string, string> = {
        error_max_turns: `ターン数の上限（${ctx.settings.maxTurns}）に達しました`,
        error_max_budget_usd: `この工程の費用上限（${Math.min(ctx.settings.maxBudgetUsd, ctx.budgetUsd)} USD）に達しました`,
        error_during_execution: '実行中にエラーが発生しました',
      };
      return emptyResult('failed', {
        ...base,
        summary,
        evidence,
        items,
        error: reason[String(msg.subtype)] ?? redact(`Claude Code がエラーを報告しました（${String(msg.subtype)}）${resultText ? `: ${truncate(resultText, 500)}` : ''}`),
      });
    }
    if (!structured) {
      items.push({ text: '指定形式（JSON）の報告が得られなかったため、最終メッセージをそのまま要約として記録しました', severity: 'warning' });
    }
    if (base.web && typeof structured?.webStatus === 'string') base.web.reported = structured.webStatus;
    const verdict = ctx.stage.kind !== 'review' ? 'none' : structured?.verdict === 'pass' ? 'pass' : structured?.verdict === 'fail' ? 'fail' : 'unknown';
    return emptyResult('succeeded', { ...base, summary, evidence, items, verdict });
  }
}
