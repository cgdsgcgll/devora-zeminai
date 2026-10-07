import type { Model } from "./client";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const coverage = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;
const criterion = (v: unknown): v is Record<string, unknown> =>
  record(v) &&
  text(v.criterion_id) &&
  text(v.label) &&
  ["required", "preferred"].includes(String(v.priority));
export function validComplements(
  value: unknown,
  needId: string,
  anonymous: boolean,
): value is Model<"TeamComplements"> {
  if (
    !record(value) ||
    value.need_id !== needId ||
    value.anonymous !== anonymous ||
    !text(value.ordering) ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every(text) ||
    !Array.isArray(value.uncovered_criteria) ||
    !value.uncovered_criteria.every(criterion) ||
    !Array.isArray(value.candidates)
  )
    return false;
  const gaps = new Set(value.uncovered_criteria.map((c) => c.criterion_id));
  return value.candidates.every(
    (c) =>
      record(c) &&
      text(c.candidate_id) &&
      text(c.label) &&
      count(c.closes_required_count) &&
      count(c.closes_preferred_count) &&
      coverage(c.resulting_required_coverage) &&
      coverage(c.resulting_preferred_coverage) &&
      count(c.resulting_matched_count) &&
      Array.isArray(c.closes) &&
      c.closes.length > 0 &&
      c.closes.every(
        (s) =>
          criterion(s) &&
          gaps.has(s.criterion_id) &&
          Array.isArray(s.sources) &&
          s.sources.every(
            (e) =>
              record(e) && text(e.family) && text(e.status) && count(e.count),
          ),
      ) &&
      c.closes_required_count ===
        c.closes.filter((s) => s.priority === "required").length &&
      c.closes_preferred_count ===
        c.closes.filter((s) => s.priority === "preferred").length,
  );
}
