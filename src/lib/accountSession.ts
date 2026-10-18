export interface AccountGuard {
  userId: string
  signal: AbortSignal
  assert: () => void
  invalidate: () => void
}

export function createAccountGuard(userId: string): AccountGuard {
  const controller = new AbortController()
  return {
    userId, signal: controller.signal,
    assert() { if (controller.signal.aborted) throw new Error('帳號已切換，請等待工作區重新載入。') },
    invalidate() { controller.abort() },
  }
}

let active: AccountGuard | null = null
export function bindAccountGuard(guard: AccountGuard) { active = guard }
export function currentAccountGuard() { return active }
export function assertCurrentAccount(userId?: string) {
  active?.assert()
  if (active && userId && active.userId !== userId) throw new Error('資料所屬帳號不符，已停止操作。')
}
