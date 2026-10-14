// Public entry point of the "zeitaku" package: the runtime that fixed tests import
export { __zeitaku } from "./runtime/zeitaku";
export { findSleeps, fixCode } from "./core/sleeps";
export type { Sleep } from "./core/sleeps";
