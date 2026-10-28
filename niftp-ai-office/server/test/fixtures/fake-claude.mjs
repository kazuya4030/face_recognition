#!/usr/bin/env node
// テスト用の偽 claude CLI。stream-json 形式の出力を模倣し、受け取った引数・環境変数名を記録する。
// brief.md の内容で挙動を切り替える: [fake:hang] 応答しない / [fake:error] エラー結果 / [fake:nojson] 結果なしで終了
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('9.9.9 (Fake Claude Code)');
  process.exit(0);
}
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', async () => {
  const brief = fs.existsSync('brief.md') ? fs.readFileSync('brief.md', 'utf8') : '';
  fs.writeFileSync('.fake-probe.json', JSON.stringify({ args, envNames: Object.keys(process.env), stdin, cwd: process.cwd() }));
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  out({ type: 'system', subtype: 'init', model: 'fake-model', permissionMode: 'acceptEdits', tools: [] });
  if (brief.includes('[fake:nojson]')) process.exit(3);
  if (brief.includes('[fake:hang]')) {
    process.on('SIGINT', () => process.exit(130));
    setInterval(() => {}, 1000);
    return;
  }
  out({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'SECRET THOUGHT' }, { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: process.cwd() + '/outputs/result.md', content: 'x' } }] } });
  fs.mkdirSync('outputs', { recursive: true });
  fs.writeFileSync('outputs/result.md', '# 偽Claudeの成果物\n');
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } });
  out({ type: 'system', subtype: 'permission_denied', tool_name: 'Write', decision_reason: 'outside workspace' });
  if (brief.includes('[fake:error]')) {
    out({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 3, total_cost_usd: 0.01, result: '' });
    return;
  }
  const withCost = !brief.includes('[fake:nocost]');
  out({
    type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: 'done',
    ...(withCost ? { total_cost_usd: 0.0123 } : {}),
    permission_denials: [{ tool_name: 'Write' }],
    structured_output: { summary: '偽の要約', deliverables: ['outputs/result.md'], evidence: ['https://example.com/source'], questions: [{ text: '価格の前提を確認してください', severity: 'warning' }] },
  });
});
