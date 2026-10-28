// ローカル専用アプリとしての最低限の防御。
// - Host ヘッダーを検査し、DNSリバインディングで外部サイトから API を叩かれるのを防ぐ。
// - 変更系リクエストには独自ヘッダーを必須にし、他サイトからのフォーム送信（CSRF）を防ぐ。
//   独自ヘッダー付きのクロスオリジン要求はブラウザのプリフライトで止まり、本サーバーは CORS を許可しない。
import type { FastifyInstance } from 'fastify';

export const MUTATION_HEADER = 'x-niftp-office';

export function registerSecurity(app: FastifyInstance, port: number): void {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, '127.0.0.1:5173', 'localhost:5173']);

  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!allowedHosts.has(host)) {
      return reply.code(421).send({ error: 'このアプリはローカル（127.0.0.1 / localhost）からのみ利用できます' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers[MUTATION_HEADER] !== '1') {
        return reply.code(403).send({ error: '不正なリクエストです' });
      }
      const origin = req.headers.origin;
      if (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, ''))) {
        return reply.code(403).send({ error: '不正な送信元です' });
      }
    }
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    return payload;
  });
}
