// Test-only assertion helper: narrows `T | undefined` to `T`, throwing a
// descriptive error if undefined. Project ESLint forbids non-null assertions
// (`x!`), so this is the safe-access alternative used in TUI test probes
// where state is captured asynchronously into a let-binding.
export function expectDefined<T>(value: T | undefined, msg?: string): T {
  if (value === undefined) {
    throw new Error(msg ?? "expectDefined: value is undefined");
  }
  return value;
}
