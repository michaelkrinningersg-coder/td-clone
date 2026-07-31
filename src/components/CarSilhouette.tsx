import type { CarData } from "@/lib/data";

/** A side view drawn from the car's own measurements.
 *
 * Length, height and wheelbase are all real, so the proportions are: a low long
 * coupé and a tall short van come out looking like what they are, and two cars
 * side by side are directly comparable because both are drawn to the same
 * scale. No image is hosted or fetched - there are five thousand cars in the
 * field and no licence that would cover photographs of them.
 *
 * What is not in the data is the shape between the measurements: where the
 * bonnet ends, how far back the windscreen leans, how big the wheels are. Those
 * are one set of proportions for every car, so this is a diagram of a car's
 * stance rather than a picture of the car. The overhangs are split 55/45 front
 * to rear, which is how a road car is usually laid out. */
const WHEEL_RADIUS_OF_HEIGHT = 0.17;
const FRONT_OVERHANG_SHARE = 0.55;
/** Where the bonnet sits and where the roof runs, as shares of the body. */
const BONNET_OF_HEIGHT = 0.52;
const ROOF_FROM_LENGTH = 0.3;
const ROOF_TO_LENGTH = 0.68;

interface Props {
  car: Pick<CarData, "lengthMm" | "heightMm" | "wheelbaseMm" | "make">;
  /** Drawn width in pixels; the height follows from the car. */
  width?: number;
  color?: string;
  className?: string;
}

export function CarSilhouette({ car, width = 220, color = "currentColor", className }: Props) {
  const { lengthMm: L, heightMm: H, wheelbaseMm: W } = car;
  const scale = width / L;
  const height = H * scale;

  const wheelR = H * WHEEL_RADIUS_OF_HEIGHT;
  const overhang = Math.max(0, L - W);
  const frontAxle = overhang * FRONT_OVERHANG_SHARE;
  const rearAxle = frontAxle + W;

  const ground = H;
  const bonnet = H - H * BONNET_OF_HEIGHT;
  const roofFrom = L * ROOF_FROM_LENGTH;
  const roofTo = L * ROOF_TO_LENGTH;

  // Nose, up over the bonnet, along the roof, down the back, and home.
  const body = [
    `M 0 ${ground - wheelR * 0.5}`,
    `L 0 ${bonnet + H * 0.12}`,
    `Q ${L * 0.04} ${bonnet} ${L * 0.16} ${bonnet}`,
    `L ${roofFrom} ${bonnet}`,
    `Q ${roofFrom + L * 0.06} ${H * 0.06} ${roofFrom + L * 0.14} ${H * 0.04}`,
    `L ${roofTo - L * 0.06} ${H * 0.04}`,
    `Q ${roofTo + L * 0.04} ${H * 0.06} ${roofTo + L * 0.09} ${bonnet}`,
    `L ${L} ${bonnet + H * 0.06}`,
    `L ${L} ${ground - wheelR * 0.5}`,
    "Z",
  ].join(" ");

  return (
    <svg
      viewBox={`${-wheelR * 0.2} 0 ${L + wheelR * 0.4} ${H + wheelR * 0.2}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`Seitenansicht: ${(L / 1000).toFixed(2)} m lang, ${(H / 1000).toFixed(2)} m hoch, ${(W / 1000).toFixed(2)} m Radstand`}
    >
      <path d={body} fill={color} opacity={0.85} />
      {[frontAxle, rearAxle].map((x) => (
        <g key={x}>
          <circle cx={x} cy={ground - wheelR} r={wheelR} fill="#18181b" />
          <circle cx={x} cy={ground - wheelR} r={wheelR * 0.55} fill={color} opacity={0.35} />
        </g>
      ))}
    </svg>
  );
}
