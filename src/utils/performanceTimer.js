/**
 * Performance Timer Utility
 * Simple utilities for measuring execution time of code sections.
 * Outputs structured logs for identifying bottlenecks.
 */

/**
 * Start a simple timer for measuring a single operation
 * @param {string} label - Operation name (e.g., 'llm_call', 'db_query')
 * @param {string} [phone] - Optional phone number (last 4 digits shown)
 * @returns {{end: () => number}} - Timer object with end() method
 *
 * @example
 * const timer = startTimer('llm_call');
 * await callLLM();
 * timer.end(); // Log: [PERF] llm_call: 2345ms
 */
export function startTimer(label, phone = null) {
  const start = performance.now();
  return {
    end: () => {
      const duration = Math.round(performance.now() - start);
      const phoneInfo = phone ? ` [${phone.slice(-4)}]` : '';
      console.log(`[PERF]${phoneInfo} ${label}: ${duration}ms`);
      return duration;
    }
  };
}

/**
 * Create a timeline for measuring multiple sequential steps
 * Tracks cumulative time from start and duration of each step
 * @param {string} [phone] - Optional phone number (last 4 digits shown)
 * @returns {Timeline} - Timeline object with mark() and summary() methods
 *
 * @example
 * const timeline = createTimeline(phone);
 * timeline.mark('start');
 * await loadUser();
 * timeline.mark('user_loaded');
 * await callLLM();
 * timeline.mark('llm_response');
 * timeline.summary();
 * // Output:
 * // [PERF] [1234] Timeline (4523ms total):
 * //   start: +0ms (0ms)
 * //   user_loaded: +312ms (312ms)
 * //   llm_response: +4211ms (4523ms)
 */
export function createTimeline(phone = null) {
  const steps = [];
  const globalStart = performance.now();

  return {
    /**
     * Mark a step in the timeline
     * @param {string} label - Step name
     */
    mark: (label) => {
      const now = performance.now();
      const fromStart = Math.round(now - globalStart);
      steps.push({ label, fromStart, timestamp: now });
    },

    /**
     * Print summary and return timing data
     * @returns {{total: number, steps: Array<{label: string, duration: number, fromStart: number}>}}
     */
    summary: () => {
      const total = Math.round(performance.now() - globalStart);
      const phoneInfo = phone ? ` [${phone.slice(-4)}]` : '';

      console.log(`[PERF]${phoneInfo} Timeline (${total}ms total):`);

      const result = steps.map((s, i) => {
        const duration = i > 0 ? s.fromStart - steps[i - 1].fromStart : s.fromStart;
        console.log(`  ${s.label}: +${duration}ms (${s.fromStart}ms)`);
        return { label: s.label, duration, fromStart: s.fromStart };
      });

      return { total, steps: result };
    },

    /**
     * Get current elapsed time without printing
     * @returns {number} - Milliseconds since timeline started
     */
    elapsed: () => Math.round(performance.now() - globalStart),
  };
}

export default { startTimer, createTimeline };
