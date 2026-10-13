// Tracks the ids of tabs this process opened, and makes sure none of them
// outlive it. Never touches a tab it did not open itself.
export class TabTracker {
  constructor({ cdpUrl, fetchImpl = fetch }) {
    this.cdpUrl = cdpUrl;
    this.fetchImpl = fetchImpl;
    this.opened = new Set();
  }

  track(id) {
    this.opened.add(id);
  }

  async close(id) {
    this.opened.delete(id);
    try {
      await this.fetchImpl(`${this.cdpUrl}/json/close/${id}`);
    } catch {
      // Best effort: the next sweep retries any tab still listed.
      this.opened.add(id);
    }
  }

  // Closes any of our own tabs still around (e.g. a close that failed
  // earlier). Called on start and on an interval.
  async sweep() {
    if (this.opened.size === 0) return [];
    let targets;
    try {
      const res = await this.fetchImpl(`${this.cdpUrl}/json/list`);
      targets = await res.json();
    } catch {
      return [];
    }
    const live = new Set(targets.map((t) => t.id));
    const closed = [];
    for (const id of [...this.opened]) {
      if (live.has(id)) {
        await this.close(id);
        closed.push(id);
      } else {
        this.opened.delete(id); // already gone, nothing to do
      }
    }
    return closed;
  }
}
