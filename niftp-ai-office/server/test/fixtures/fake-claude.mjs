#!/usr/bin/env node
// テスト用の偽 claude CLI。stream-json 形式の出力を模倣し、受け取った引数・環境変数名を記録する。
// 標準入力の【出力ファイル】に書かれたファイルを作成する（末尾が / のものはその下に result.md）。
// brief.md の内容で挙動を切り替える:
//   [fake:hang] 応答しない / [fake:error] エラー結果 / [fake:nojson] 結果なしで終了 / [fake:nocost] 費用なし
//   [fake:nooutput] 出力ファイルを作らない / [fake:reviewfail] レビューを常に不合格 / [fake:reviewfail-once] 第1版だけ不合格
//   [fake:noweb] Web検索が失敗する / [fake:blocker] 作業計画で blocker を返す / [fake:samemodel] 常に同じモデル名
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('9.9.9 (Fake Claude Code)');
  process.exit(0);
}
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', async () => {
  const brief = fs.existsSync('brief.md') ? fs.readFileSync('brief.md', 'utf8') : '';
  const probes = fs.existsSync('.fake-probe.json') ? JSON.parse(fs.readFileSync('.fake-probe.json', 'utf8')) : [];
  const probe = { args, envNames: Object.keys(process.env), stdin, cwd: process.cwd() };
  fs.writeFileSync('.fake-probe.json', JSON.stringify([...(Array.isArray(probes) ? probes : [probes]), probe]));
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  const tools = (args[args.indexOf('--tools') + 1] ?? '').split(',');
  const stage = stdin.includes('作業計画を作って') ? 'plan' : stdin.includes('調査し、事実') ? 'research' : stdin.includes('提出物を作って') ? 'execute' : 'review';
  const revision = Number(/第(\d+)版/.exec(stdin)?.[1] ?? 0);
  const model = brief.includes('[fake:samemodel]') ? 'fake-model' : `fake-model-${stage === 'review' ? 'b' : 'a'}`;
  out({ type: 'system', subtype: 'init', model, permissionMode: 'acceptEdits', tools });
  if (brief.includes('[fake:nojson]')) process.exit(3);
  if (brief.includes('[fake:hang]')) {
    process.on('SIGINT', () => process.exit(130));
    setInterval(() => {}, 1000);
    return;
  }
  out({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'SECRET THOUGHT' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: process.cwd() + '/brief.md' } }] } });
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } });

  let webStatus = 'available';
  if (tools.includes('WebSearch') && stage === 'research') {
    const noweb = brief.includes('[fake:noweb]');
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'w1', name: 'WebSearch', input: { query: 'テスト 検索' } }] } });
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'w1', is_error: noweb, content: noweb ? 'network error' : 'results' }] } });
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'w2', name: 'WebFetch', input: { url: 'https://example.com/a' } }] } });
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'w2', is_error: true, content: 'proxy refused the connection' }] } });
    webStatus = noweb ? 'unavailable' : 'search_only';
  }

  // 【出力ファイル】の一覧に従って書く
  const block = stdin.split('【出力ファイル】')[1]?.split('\n\n')[0] ?? '';
  const targets = [...block.matchAll(/^- (\S+)/gm)].map((m) => m[1]);
  if (!brief.includes('[fake:nooutput]')) {
    for (const t of targets) {
      const file = t.endsWith('/') ? path.join(t, 'result.md') : t;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `# 偽Claudeの出力（${stage}、第${revision}版）\n`);
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `o-${file}`, name: 'Write', input: { file_path: path.join(process.cwd(), file), content: 'x' } }] } });
    }
  }
  out({ type: 'system', subtype: 'permission_denied', tool_name: 'Write', decision_reason: 'outside workspace' });
  if (brief.includes('[fake:error]')) {
    out({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 3, total_cost_usd: 0.01, result: '' });
    return;
  }
  const withCost = !brief.includes('[fake:nocost]');
  const fail = stage === 'review' && (brief.includes('[fake:reviewfail]') && !brief.includes('[fake:reviewfail-once]') || (brief.includes('[fake:reviewfail-once]') && revision === 1));
  const questions = [{ text: '価格の前提を確認してください', severity: 'warning' }];
  if (stage === 'plan' && brief.includes('[fake:blocker]')) questions.push({ text: '予算が未確定のため進められません', severity: 'blocker' });
  if (fail) questions.push({ text: '出典と食い違う記述があります', severity: 'warning' });
  out({
    type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: 'done',
    ...(withCost ? { total_cost_usd: 0.0123 } : {}),
    usage: { input_tokens: 120, output_tokens: 45, cache_read_input_tokens: 300, cache_creation_input_tokens: 10, server_tool_use: { web_search_requests: stage === 'research' ? 1 : 0 } },
    permission_denials: [{ tool_name: 'Write' }],
    structured_output: {
      summary: `偽の要約（${stage}）`,
      deliverables: targets,
      evidence: ['https://example.com/source'],
      questions,
      ...(stage === 'research' ? { webStatus } : {}),
      ...(stage === 'review' ? { verdict: fail ? 'fail' : 'pass' } : {}),
    },
  });
});
