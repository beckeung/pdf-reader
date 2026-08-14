import type { Annotation } from '../lib/annotations';

function pdfToCss(
  x: number,
  y: number,
  pageHeight: number,
  scale: number,
): { left: number; top: number } {
  return {
    left: x * scale,
    top: (pageHeight - y) * scale,
  };
}

export function AnnotationLayer({
  annotations,
  scale,
  pageHeight,
}: {
  annotations: Annotation[];
  scale: number;
  pageHeight: number;
}) {
  if (!pageHeight) return null;

  return (
    <svg className="annotation-layer" width="100%" height="100%">
      {annotations.map((ann) => {
        if (ann.type === 'highlight') {
          const { left, top } = pdfToCss(
            ann.x,
            ann.y + ann.height,
            pageHeight,
            scale,
          );
          return (
            <rect
              key={ann.id}
              x={left}
              y={top}
              width={ann.width * scale}
              height={ann.height * scale}
              fill={ann.color}
              opacity={0.35}
            />
          );
        }
        if (ann.type === 'line') {
          const a = pdfToCss(ann.x1, ann.y1, pageHeight, scale);
          const b = pdfToCss(ann.x2, ann.y2, pageHeight, scale);
          return (
            <line
              key={ann.id}
              x1={a.left}
              y1={a.top}
              x2={b.left}
              y2={b.top}
              stroke={ann.color}
              strokeWidth={ann.strokeWidth * scale}
              strokeLinecap="round"
            />
          );
        }
        if (ann.type === 'ink') {
          const d = ann.points
            .map((p, i) => {
              const c = pdfToCss(p.x, p.y, pageHeight, scale);
              return `${i === 0 ? 'M' : 'L'} ${c.left} ${c.top}`;
            })
            .join(' ');
          return (
            <path
              key={ann.id}
              d={d}
              fill="none"
              stroke={ann.color}
              strokeWidth={ann.strokeWidth * scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (ann.type === 'note') {
          const c = pdfToCss(ann.x, ann.y, pageHeight, scale);
          const label =
            ann.text.length > 40 ? `${ann.text.slice(0, 40)}…` : ann.text;
          return (
            <g key={ann.id}>
              <title>{ann.text}</title>
              <rect
                x={c.left}
                y={c.top - 12}
                width={12}
                height={12}
                fill={ann.color}
                rx={2}
              />
              <text x={c.left + 16} y={c.top - 2} fontSize={12} fill="#222">
                {label}
              </text>
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}
