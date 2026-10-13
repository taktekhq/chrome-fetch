const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs tasks one at a time. The next task never starts sooner than
// `minGapMs` after the previous one started. A task that throws does not
// jam the queue; the next one still runs.
export class GapQueue {
  constructor({ minGapMs = 0, now = Date.now, sleep = defaultSleep } = {}) {
    this.minGapMs = minGapMs;
    this.now = now;
    this.sleep = sleep;
    this.lastStart = -Infinity;
    this.tail = Promise.resolve();
  }

  run(task) {
    const turn = this.tail.then(() => this._runOne(task));
    // Swallow so a rejected task does not stop the chain for whoever is next.
    this.tail = turn.then(
      () => {},
      () => {},
    );
    return turn;
  }

  async _runOne(task) {
    const wait = this.lastStart + this.minGapMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart = this.now();
    return task();
  }
}
