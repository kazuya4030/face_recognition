// ログ・画面に出す文字列から秘密情報らしき値を取り除く。
const TOKEN_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
];

const SECRET_ENV_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)/i;

let envSecrets: string[] | null = null;

function secretEnvValues(): string[] {
  if (envSecrets == null) {
    envSecrets = Object.entries(process.env)
      .filter(([k, v]) => SECRET_ENV_NAME.test(k) && typeof v === 'string' && v.length >= 12)
      .map(([, v]) => v as string)
      .sort((a, b) => b.length - a.length);
  }
  return envSecrets;
}

export function redact(text: string): string {
  let out = text;
  for (const v of secretEnvValues()) {
    if (out.includes(v)) out = out.split(v).join('[秘匿]');
  }
  for (const re of TOKEN_PATTERNS) out = out.replace(re, '[秘匿]');
  return out;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…（以下省略）`;
}
