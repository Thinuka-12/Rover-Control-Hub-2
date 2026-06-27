interface ArcGaugeProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
  danger?: number;
  warning?: number;
  animate?: boolean;
}

export function ArcGauge({
  value,
  max = 100,
  label,
  unit = "",
  color,
  size = 100,
  strokeWidth = 9,
  danger,
  warning,
  animate = true,
}: ArcGaugeProps) {
  const clamped = Math.max(0, Math.min(value, max));
  const pct = clamped / max;

  const resolvedColor = color ?? (() => {
    if (danger != null && clamped <= danger) return "#ff4444";
    if (warning != null && clamped <= warning) return "#ffb000";
    return "#00f5ff";
  })();

  const cx = size / 2;
  const cy = size / 2;
  const r = cx - strokeWidth - 4;
  const circumference = 2 * Math.PI * r;
  const sweep = circumference * 0.75;
  const filled = sweep * pct;

  const glowId = `glow-${label.replace(/\s+/g, "")}`;

  const valueFontSize = size < 80 ? 12 : size < 120 ? 16 : 22;
  const unitFontSize = size < 80 ? 8 : 10;
  const labelFontSize = size < 80 ? 7 : 9;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-label={`${label}: ${value}${unit}`}
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Track (background arc) */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${sweep} ${circumference - sweep}`}
        transform={`rotate(-225, ${cx}, ${cy})`}
      />

      {/* Track inner glow */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={`${resolvedColor}18`}
        strokeWidth={strokeWidth + 4}
        strokeLinecap="round"
        strokeDasharray={`${sweep} ${circumference - sweep}`}
        transform={`rotate(-225, ${cx}, ${cy})`}
      />

      {/* Value arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={resolvedColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform={`rotate(-225, ${cx}, ${cy})`}
        filter={`url(#${glowId})`}
        style={animate ? { transition: "stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)" } : undefined}
      />

      {/* Center: value */}
      <text
        x={cx} y={cy + valueFontSize * 0.35}
        textAnchor="middle"
        fill={resolvedColor}
        fontSize={valueFontSize}
        fontFamily="monospace"
        fontWeight="bold"
        letterSpacing="-0.5"
      >
        {Number.isFinite(value) ? Math.round(value) : "—"}
        <tspan fontSize={unitFontSize} dy={-2} fill={`${resolvedColor}aa`}>{unit}</tspan>
      </text>

      {/* Bottom label */}
      <text
        x={cx} y={size - 6}
        textAnchor="middle"
        fill="rgba(255,255,255,0.3)"
        fontSize={labelFontSize}
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        {label.toUpperCase()}
      </text>
    </svg>
  );
}
