interface MotionClip {
  Meta: { CurveCount: number; TotalPointCount: number; TotalSegmentCount: number; Loop: boolean; Duration: number };
  Curves: { Segments: number[] }[];
}

// Several game exports count endpoints as segments. Cubism validates both totals before playback.
export function prepareMotion(clip: MotionClip, once: boolean) {
  let points = 0;
  let segments = 0;
  for (const { Segments: values } of clip.Curves) {
    if (values.length < 2) throw new Error('Missing motion curve starting point');
    if (values.length === 2) values.push(0, clip.Meta.Duration, values[1]);
    points++;
    for (let i = 2; i < values.length;) {
      const kind = values[i];
      if (![0, 1, 2, 3].includes(kind)) throw new Error('Invalid motion segment type: ' + kind);
      const count = kind === 1 ? 3 : 1;
      i += 1 + 2 * count;
      if (i > values.length) throw new Error('Incomplete motion curve');
      points += count;
      segments++;
    }
  }
  clip.Meta.CurveCount = clip.Curves.length;
  clip.Meta.TotalSegmentCount = segments;
  clip.Meta.TotalPointCount = points;
  if (once) clip.Meta.Loop = false;
  return clip;
}
