import { Schema, model } from 'mongoose';

/**
 * Generic atomic counter used to generate gap-free, unique sequences such as
 * per-outlet order numbers and per-outlet/per-day token numbers.
 *
 * `_id` is a composite key, e.g.:
 *   "ORDER:<outletId>"
 *   "TOKEN:TAKEAWAY:<outletId>:2026-09-08"
 *   "TOKEN:DINE_IN:<outletId>:2026-09-08"
 *   "TOKEN:DELIVERY:<outletId>:2026-09-08"
 */
export interface ICounter {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = model<ICounter>('Counter', CounterSchema);

export async function getNextSequence(key: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc!.seq;
}
