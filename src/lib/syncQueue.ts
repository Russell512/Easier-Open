/** Serialize saves and drain edits received while a save is in flight. */
export function createSyncQueue(save: () => Promise<boolean>) {
  let pending = false
  let flight: Promise<void> | null = null

  async function drain() {
    try {
      while (pending) {
        pending = false
        const changedDuringSave = await save()
        pending ||= changedDuringSave
      }
    } finally {
      flight = null
    }
  }

  return {
    request(): Promise<void> {
      pending = true
      if (flight) return flight
      let resolve!: () => void
      let reject!: (reason: unknown) => void
      flight = new Promise<void>((done, failed) => { resolve = done; reject = failed })
      const result = flight
      void drain().then(resolve, reject)
      return result
    },
  }
}
