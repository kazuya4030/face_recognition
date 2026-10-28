// サーバーAPIの呼び出し。変更系には CSRF 対策の独自ヘッダーを付ける。
import type { OfficeService } from '../../server/src/services/office.ts';

export type Snapshot = ReturnType<OfficeService['snapshot']>;
export type JobSummary = Snapshot['jobs'][number];
export type EmployeeView = Snapshot['employees'][number];
export type ApprovalView = Snapshot['approvals'][number];
export type JobDetail = ReturnType<OfficeService['jobDetail']>;
export type DeliverableView = ReturnType<OfficeService['deliverablesWithExistence']>[number];
export type DeliverableContent = ReturnType<OfficeService['deliverableContent']>;

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-NIFTP-Office': '1' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `通信エラー（${res.status}）`);
  return data as T;
}

export const api = {
  state: () => request<Snapshot>('GET', '/api/state'),
  job: (id: number) => request<JobDetail>('GET', `/api/jobs/${id}`),
  createJob: (body: Record<string, unknown>) => request<JobDetail>('POST', '/api/jobs', body),
  jobAction: (id: number, action: string, body: Record<string, unknown> = {}) => request<JobDetail>('POST', `/api/jobs/${id}/actions/${action}`, body),
  decide: (id: number, decision: 'approve' | 'reject', comment: string) => request('POST', `/api/approvals/${id}/decision`, { decision, comment }),
  deliverables: () => request<DeliverableView[]>('GET', '/api/deliverables'),
  deliverableContent: (id: number) => request<DeliverableContent>('GET', `/api/deliverables/${id}/content`),
  updateEmployee: (id: string, body: Record<string, unknown>) => request('PUT', `/api/employees/${id}`, body),
  updateSettings: (body: Record<string, unknown>) => request('PUT', '/api/settings', body),
  refreshAdapters: () => request('POST', '/api/adapters/refresh'),
};
