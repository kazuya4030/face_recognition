// 画面へ「データが変わった」ことを知らせるための通知。内容は送らず、画面側が再取得する。
import { EventEmitter } from 'node:events';

export class ChangeBus extends EventEmitter {
  private version = 0;

  changed(jobId?: number): void {
    this.version += 1;
    this.emit('change', { version: this.version, jobId: jobId ?? null });
  }

  currentVersion(): number {
    return this.version;
  }
}
