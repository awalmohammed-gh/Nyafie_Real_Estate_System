import { useId } from "react";
import { availableSlots, viewingDateRange } from "../../utils/viewingTimes";

/**
 * Date and half-hour slot for a viewing, in Ghana time. `value` is { date, time }; a time that is no
 * longer available on a newly picked day is cleared, so only bookable slots can be submitted.
 */
const ViewingTimeFields = ({ value, onChange, disabled = false }) => {
  const id = useId();
  const range = viewingDateRange();
  const slots = availableSlots(value.date);
  const setDate = (date) => onChange({ date, time: availableSlots(date).includes(value.time) ? value.time : "" });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-date`} className="mb-1.5 block text-sm font-medium text-gray-700">Date</label>
        <input id={`${id}-date`} type="date" required min={range.min} max={range.max} value={value.date} onChange={(e) => setDate(e.target.value)} disabled={disabled} className="field" />
      </div>
      <div>
        <label htmlFor={`${id}-time`} className="mb-1.5 block text-sm font-medium text-gray-700">Time <span className="font-normal text-gray-500">(Ghana time)</span></label>
        <select id={`${id}-time`} required value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} disabled={disabled || !slots.length} className="field">
          <option value="">{!value.date ? "Choose a date first" : slots.length ? "Choose a time" : "No times left that day"}</option>
          {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </select>
      </div>
    </div>
  );
};

export default ViewingTimeFields;
