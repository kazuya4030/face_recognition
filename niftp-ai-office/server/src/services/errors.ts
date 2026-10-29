/** 利用者の操作が受け付けられない場合のエラー（画面にそのまま表示する）。 */
export class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
