'use client';

/**
 * Drag slider for video clip duration (5s–30s). Replaces the fixed-button
 * DurationField in Video Studio. Updates in real time via onChange — the
 * value maps directly to the existing `durationSeconds` request field.
 */
export function DurationSlider({
  value,
  onChange,
  min = 5,
  max = 30,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Duration
        </p>
        <span className="text-sm font-medium text-brand-300">{value}s</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Duration in seconds"
        className="w-full cursor-pointer accent-brand-500"
      />
      <div className="mt-1 flex justify-between text-[11px] text-gray-600">
        <span>{min}s</span>
        <span>{max}s</span>
      </div>
    </div>
  );
}
