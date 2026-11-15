/** Redis script contract emulator; tests run without external infrastructure. */
export class FakeAuthorityRedis {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  calls: string[] = [];
  now: () => number = () => Date.now();
  private expires = new Map<string, number>();
  private delayedEval: ((resume: () => unknown) => Promise<unknown>) | null = null;

  private get(key: string): string | undefined {
    if ((this.expires.get(key) ?? Infinity) <= this.now()) {
      this.strings.delete(key);
      this.expires.delete(key);
    }
    return this.strings.get(key);
  }

  async set(key: string, value: string, _px: string, ttl: number, _nx: string): Promise<'OK' | null> {
    if (this.get(key) !== undefined) return null;
    this.strings.set(key, value);
    this.expires.set(key, this.now() + ttl);
    return 'OK';
  }

  async smembers(key: string): Promise<string[]> {
    this.calls.push('smembers');
    return [...(this.sets.get(key) ?? [])];
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    this.calls.push('mget');
    return keys.map((key) => this.get(key) ?? null);
  }

  delayNextEval(): { resume(): void } {
    let resume: () => unknown;
    let resolve: (value: unknown) => void;
    this.delayedEval = (operation) => {
      resume = operation;
      return new Promise((done) => { resolve = done; });
    };
    return { resume: () => { resolve(resume()); } };
  }

  async eval(script: string, count: number, ...input: any[]): Promise<unknown> {
    const keys = input.slice(0, count) as string[];
    const args = input.slice(count);
    const operation = () => {
      this.calls.push('eval');
      if (!script.startsWith("if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end")) {
        throw new Error('Mutation script is missing the ownership guard');
      }
      if (this.get(keys[0]) !== args[0]) return 0;
      if (script.includes("redis.call('PEXPIRE'")) {
        this.expires.set(keys[0], this.now() + Number(args[1]));
      } else if (script.includes("redis.call('SET', KEYS[2], ARGV[3])")) {
        this.strings.set(keys[1], args[2]);
        const index = this.sets.get(keys[2]) ?? new Set<string>();
        index.add(args[1]);
        this.sets.set(keys[2], index);
      } else if (script.includes("redis.call('DEL', KEYS[2])")) {
        this.strings.delete(keys[1]);
        this.sets.get(keys[2])?.delete(args[1]);
      } else if (script.includes('for i = 2, #ARGV')) {
        this.calls.push('prune');
        for (const id of args.slice(1)) this.sets.get(keys[1])?.delete(id);
      } else if (script.includes("redis.call('DEL', KEYS[1])")) {
        this.strings.delete(keys[0]);
        this.expires.delete(keys[0]);
      } else throw new Error('Unknown script in fake Redis');
      return 1;
    };
    if (this.delayedEval) {
      const delayed = this.delayedEval;
      this.delayedEval = null;
      return delayed(operation);
    }
    return operation();
  }
}
