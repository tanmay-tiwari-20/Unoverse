import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getRedis } from '../config/redis';
import type { RedisAuthorityLease } from '../config/redisAuthority';

export interface BugReport {
  id: string;
  createdAt: number;
  message: string;
  roomCode?: string;
}
export interface ReportStore { save(report: BugReport): Promise<void>; }

export class MemoryReportStore implements ReportStore {
  readonly reports = new Map<string, BugReport>();
  async save(report: BugReport): Promise<void> {
    if (this.reports.size >= 1000) this.reports.delete(this.reports.keys().next().value!);
    this.reports.set(report.id, { ...report });
  }
}

export class FileReportStore implements ReportStore {
  private lastPrunedAt = 0;
  private pruning: Promise<void> | null = null;
  constructor(private readonly dir: string, private readonly retentionSeconds: number) {}

  async save(report: BugReport): Promise<void> {
    if (!/^[a-f0-9-]{36}$/i.test(report.id)) throw new Error('Invalid report ID');
    await fs.mkdir(this.dir, { recursive: true });
    if (Date.now() - this.lastPrunedAt > 3_600_000) {
      this.pruning ??= this.prune().finally(() => { this.pruning = null; });
      await this.pruning;
    }
    const target = path.join(this.dir, `${report.id}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(report), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  private async prune(): Promise<void> {
    const cutoff = Date.now() - this.retentionSeconds * 1000;
    for (const name of await fs.readdir(this.dir)) {
      if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
      const target = path.join(this.dir, name);
      if ((await fs.stat(target)).mtimeMs < cutoff) await fs.rm(target, { force: true });
    }
    this.lastPrunedAt = Date.now();
  }
}

export class RedisReportStore implements ReportStore {
  constructor(private readonly client: any, private readonly retentionSeconds: number,
    private readonly authority: RedisAuthorityLease) {}
  async save(report: BugReport): Promise<void> {
    const key = `uno:report:${report.id}`;
    const json = JSON.stringify(report);
    await this.authority.write(this.client,
      "redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]); return 1",
      [key], [json, String(this.retentionSeconds)]);
  }
}

export async function createReportStore(authority?: RedisAuthorityLease): Promise<ReportStore> {
  const days = Number(process.env.REPORT_RETENTION_DAYS || 30);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('REPORT_RETENTION_DAYS must be an integer from 1 to 90');
  const seconds = days * 86_400;
  const backend = (process.env.STORE || 'file').toLowerCase();
  if (backend === 'memory') return new MemoryReportStore();
  if (backend === 'redis') {
    if (!authority) throw new Error('Redis reports require an authoritative backend lease');
    return new RedisReportStore(await getRedis(), seconds, authority);
  }
  return new FileReportStore(process.env.REPORT_DIR || path.resolve(process.cwd(), '.data/reports'), seconds);
}
