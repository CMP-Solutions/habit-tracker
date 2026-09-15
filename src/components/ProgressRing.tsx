import { NumberTicker } from "@/components/magicui/number-ticker";

interface ProgressRingProps {
  value: number;
  target: number;
  unit: string | null;
}

const SIZE = 48;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatRemaining(remaining: number, unit: string | null): string {
  const rounded = Math.round(remaining * 10) / 10;
  return unit ? `noch ${rounded} ${unit}` : `noch ${rounded}`;
}

export function ProgressRing({ value, target, unit }: ProgressRingProps) {
  const ratio = target > 0 ? value / target : 0;
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const complete = ratio >= 1;
  const remaining = Math.max(target - value, 0);
  const offset = CIRCUMFERENCE * (1 - clamped);
  const percent = Math.round(clamped * 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
      title={complete ? "Ziel erreicht" : formatRemaining(remaining, unit)}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={
            complete
              ? "stroke-celebrate transition-[stroke-dashoffset] duration-500 ease-out [filter:drop-shadow(0_0_4px_var(--color-celebrate))]"
              : "stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
          }
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tabular-nums text-foreground">
        <NumberTicker value={percent} className="font-mono text-[10px] text-current" />%
      </span>
    </div>
  );
}
