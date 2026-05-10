/**
 * Single-source-of-truth for the published CLI/library version string.
 *
 * Kept in a tiny standalone module so `src/cli.ts` can import it without
 * dragging the rest of the engine into the require graph for `--version`.
 */

export const VERSION = "0.1.0";
