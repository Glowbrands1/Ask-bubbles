/**
 * CHAT_PARALLEL_LOADS_ENABLED (ported from the sibling app; QA, 9 Nov 2026): a promise started early and awaited
 * later. Its rejection is not reported as unhandled meanwhile, and it still reaches that await, where today's code
 * would have thrown it.
 */
export function held<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

