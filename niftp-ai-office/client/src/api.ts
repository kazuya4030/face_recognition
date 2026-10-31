// サーバーAPIの呼び出し。変更系には CSRF 対策の独自ヘッダーを付ける。
import type { OfficeService } from '../../server/src/services/office.ts';
import type { OfficeEvent } from '../../server/src/services/officeEvents.ts';
import type { OperationsService } from '../../server/src/services/operations.ts';
import type { MaterialsService } from '../../server/src/services/materials.ts';
import type { ResearchProgram } from '../../server/src/services/research.ts';
import type { Attachment, JobTemplate, MemoryItem } from '../../server/src/domain/types.ts';

export type { OfficeEvent };

export type Snapshot = ReturnType<OfficeService['snapshot']>;
export type JobSummary = Snapshot['jobs'][number];
export type EmployeeView = Snapshot['employees'][number];
export type ApprovalView = Snapshot['approvals'][number];
export type JobDetail = ReturnType<OfficeService['jobDetail']>;
export type DeliverableView = ReturnType<OfficeService['deliverablesWithExistence']>[number];
export type DeliverableContent = ReturnType<OfficeService['deliverableContent']>;
export type ResearchView = ReturnType<ResearchProgram['view']>;
export type InboxItem = ReturnType<OperationsService['inbox']>[number];
export type QueueView = ReturnType<OperationsService['queue']>;
export type MemoryView = ReturnType<OperationsService['memory']>;
export type SummaryView = ReturnType<OperationsService['summary']>;
export type BackupsView = ReturnType<OperationsService['backups']>;
export type ApprovedDeliverable = ReturnType<MaterialsService['approvedDeliverables']>[number];
export type AttachmentContent = ReturnType<MaterialsService['content']>;
export type { Attachment, JobTemplate, MemoryItem };

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
  officeEvents: () => request<OfficeEvent[]>('GET', '/api/office/events'),
  job: (id: number) => request<JobDetail>('GET', `/api/jobs/${id}`),
  createJob: (body: Record<string, unknown>) => request<JobDetail>('POST', '/api/jobs', body),
  jobAction: (id: number, action: string, body: Record<string, unknown> = {}) => request<JobDetail>('POST', `/api/jobs/${id}/actions/${action}`, body),
  decide: (id: number, decision: 'approve' | 'reject', comment: string) => request('POST', `/api/approvals/${id}/decision`, { decision, comment }),
  deliverables: () => request<DeliverableView[]>('GET', '/api/deliverables'),
  deliverableContent: (id: number) => request<DeliverableContent>('GET', `/api/deliverables/${id}/content`),
  updateEmployee: (id: string, body: Record<string, unknown>) => request('PUT', `/api/employees/${id}`, body),
  updateSettings: (body: Record<string, unknown>) => request('PUT', '/api/settings', body),
  updateCompany: (body: Record<string, unknown>) => request('PUT', '/api/company', body),
  refreshAdapters: () => request('POST', '/api/adapters/refresh'),
  // 資料
  uploadAttachment: (jobId: number, name: string, contentBase64: string) => request<Attachment>('POST', `/api/jobs/${jobId}/attachments`, { name, contentBase64 }),
  addReference: (jobId: number, deliverableId: number) => request<Attachment>('POST', `/api/jobs/${jobId}/references`, { deliverableId }),
  removeAttachment: (id: number) => request('POST', `/api/attachments/${id}/remove`, {}),
  attachmentContent: (id: number) => request<AttachmentContent>('GET', `/api/attachments/${id}/content`),
  approvedDeliverables: () => request<ApprovedDeliverable[]>('GET', '/api/approved-deliverables'),
  templates: () => request<JobTemplate[]>('GET', '/api/templates'),
  // 受信箱
  inbox: () => request<InboxItem[]>('GET', '/api/inbox'),
  answer: (jobId: number, body: Record<string, unknown>) => request('POST', `/api/jobs/${jobId}/answers`, body),
  approvePlan: (jobId: number, body: Record<string, unknown>) => request('POST', `/api/jobs/${jobId}/plan/approve`, body),
  revisePlan: (jobId: number, comment: string) => request('POST', `/api/jobs/${jobId}/plan/revise`, { comment }),
  // 待ち行列
  queue: () => request<QueueView>('GET', '/api/queue'),
  queueStart: () => request<QueueView>('POST', '/api/queue/start', {}),
  queueStop: () => request<QueueView>('POST', '/api/queue/stop', {}),
  queueMove: (jobId: number, direction: 'up' | 'down' | 'top') => request<QueueView>('POST', `/api/queue/${jobId}/move`, { direction }),
  // 会社の記憶
  memory: () => request<MemoryView>('GET', '/api/memory'),
  addMemory: (kind: string, text: string) => request<MemoryItem>('POST', '/api/memory', { kind, text }),
  updateMemory: (id: number, body: Record<string, unknown>) => request<MemoryItem>('PUT', `/api/memory/${id}`, body),
  promoteNote: (id: number, kind: string, text: string) => request<MemoryItem>('POST', `/api/notes/${id}/promote`, { kind, text }),
  // 定期研究
  research: () => request<ResearchView>('GET', '/api/research'),
  addTopic: (text: string) => request('POST', '/api/research/topics', { text }),
  updateTopic: (id: number, body: Record<string, unknown>) => request<ResearchView>('PUT', `/api/research/topics/${id}`, body),
  researchRunNow: () => request('POST', '/api/research/run-now', {}),
  // 業務状況・バックアップ
  summary: () => request<SummaryView>('GET', '/api/summary'),
  backups: () => request<BackupsView>('GET', '/api/backups'),
  createBackup: () => request<{ name: string; size: number; createdAt: string }>('POST', '/api/backups', {}),
};
