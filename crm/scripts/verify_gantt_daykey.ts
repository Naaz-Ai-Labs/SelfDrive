/**
 * One-off verification for the Gantt block/booking day-matching bug.
 *
 * Proves, against real serialized rows, that istDateKey() collapses a 24h
 * IST-anchored range to a single calendar day while the old .slice(0,10)
 * approach spans two — before any component code is touched.
 */
import { istDateKey } from "../src/lib/rental-clock";

const rows = [
  { id: 77, starts_at: "2026-08-28T18:30:00+00:00", ends_at: "2026-08-29T18:29:59+00:00" },
  { id: 76, starts_at: "2026-08-27T18:30:00+00:00", ends_at: "2026-08-28T18:29:59+00:00" },
  { id: 75, starts_at: "2026-08-26T18:30:00+00:00", ends_at: "2026-08-27T18:29:59+00:00" },
  { id: 74, starts_at: "2026-08-27T18:30:00+00:00", ends_at: "2026-08-28T18:29:59+00:00" },
  { id: 73, starts_at: "2026-08-23T18:30:00+00:00", ends_at: "2026-08-24T18:29:59+00:00" },
];

console.log("id | OLD .slice(0,10)                          | NEW istDateKey");
for (const r of rows) {
  const oldStart = r.starts_at.slice(0, 10);
  const oldEnd = r.ends_at.slice(0, 10);
  const newStart = istDateKey(new Date(r.starts_at));
  const newEnd = istDateKey(new Date(r.ends_at));
  const oldSpans = oldStart !== oldEnd;
  const newSpans = newStart !== newEnd;
  console.log(
    `${r.id}`.padStart(2),
    "|",
    `${oldStart}..${oldEnd} (${oldSpans ? "2 DAYS - BUG" : "1 day"})`.padEnd(42),
    "|",
    `${newStart}..${newEnd} (${newSpans ? "2 days - STILL BROKEN" : "1 day - CORRECT"})`
  );
}
