/** Start every cleanup immediately, then share a single deadline. A stalled cleanup cannot block cancellation of another resource. */
export class Lifecycle {
  private tasks: (() => unknown | Promise<unknown>)[] = [];
  private result?: Promise<boolean>;
  add(cleanup: () => unknown | Promise<unknown>) { this.tasks.push(cleanup); }
  close(deadlineMs = 3000) {
    if (this.result) return this.result;
    let finish!: (value: boolean) => void;
    this.result = new Promise(resolve => { finish = resolve; });
    const timer = setTimeout(() => finish(false), deadlineMs);
    const tasks = this.tasks.map(task => { try { return Promise.resolve(task()); } catch { return Promise.reject(new Error('Cleanup failed')); } });
    void Promise.allSettled(tasks).then(results => { clearTimeout(timer); finish(results.every(result => result.status === 'fulfilled')); });
    return this.result;
  }
}
