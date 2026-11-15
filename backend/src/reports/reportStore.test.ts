import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileReportStore, RedisReportStore } from './reportStore';

const directories: string[] = [];
afterAll(async () => {
  for (const directory of directories) {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('unoverse-reports-')) throw new Error('Unexpected test directory');
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

describe('acknowledged report storage', () => {
  it('writes a complete durable report and expires old report files without touching other files', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'unoverse-reports-'));
    directories.push(directory);
    const expired = path.join(directory, `${randomUUID()}.json`);
    await fs.writeFile(expired, '{}');
    await fs.utimes(expired, 1, 1);
    await fs.writeFile(path.join(directory, 'operator-notes.txt'), 'keep');
    const report = { id: randomUUID(), message: 'A complete report', createdAt: Date.now() };
    await new FileReportStore(directory, 86_400).save(report);
    expect(JSON.parse(await fs.readFile(path.join(directory, `${report.id}.json`), 'utf8'))).toEqual(report);
    expect(await fs.readdir(directory)).toEqual(expect.arrayContaining([`${report.id}.json`, 'operator-notes.txt']));
    expect(await fs.readdir(directory)).not.toContain(path.basename(expired));
    expect((await fs.readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
  });
  it('does not acknowledge a failed Redis save', async () => {
    const authority = { write: vi.fn().mockRejectedValue(new Error('storage offline')) };
    await expect(new RedisReportStore({}, 86_400, authority as any).save({ id: randomUUID(), message: 'Storage failure', createdAt: 1 })).rejects.toThrow('storage offline');
  });
  it('uses the authority guard and preserves retention on Redis writes', async () => {
    const authority = { write: vi.fn().mockResolvedValue(1) };
    const client = { set: vi.fn() };
    const report = { id: randomUUID(), message: 'Owned report', createdAt: 1 };
    await new RedisReportStore(client, 86_400, authority as any).save(report);
    expect(authority.write).toHaveBeenCalledWith(client, expect.stringContaining("'EX'"), [`uno:report:${report.id}`], [JSON.stringify(report), '86400']);
    expect(client.set).not.toHaveBeenCalled();
  });
});
