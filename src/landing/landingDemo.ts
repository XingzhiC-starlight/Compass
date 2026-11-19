export type FrameKey = "stk" | "dtk" | "sth" | "dth";

type CardRect = readonly [number, number, number, number];

type ToggleRect = readonly [number, number, number, number];

export const FRAMES: Record<FrameKey, { src: string; alt: string }> = {
  stk: {
    src: "/landing/demo/frame-summary-task.png",
    alt: "Compass dashboard — summary cards with the Daily Task panel",
  },
  dtk: {
    src: "/landing/demo/frame-depth-task.png",
    alt: "Compass dashboard — expanded depth cards with the Daily Task panel",
  },
  sth: {
    src: "/landing/demo/frame-summary-thoughts.png",
    alt: "Compass dashboard — summary cards with the Thoughts panel",
  },
  dth: {
    src: "/landing/demo/frame-depth-thoughts.png",
    alt: "Compass dashboard — expanded depth cards with the Thoughts panel",
  },
};

export const CARD_RECTS: Record<FrameKey, readonly CardRect[]> = {
  stk: [
    [20.02, 5.58, 44.21, 29.07],
    [45.73, 5.24, 69.92, 29.07],
    [71.34, 5.41, 95.63, 29.24],
  ],
  dtk: [
    [20.63, 3.04, 39.33, 56.62],
    [40.75, 3.04, 65.75, 56.62],
    [67.17, 3.04, 96.14, 56.62],
  ],
  sth: [
    [19.72, 3.04, 44.11, 26.87],
    [45.63, 3.04, 69.92, 26.87],
    [71.44, 3.04, 95.83, 26.87],
  ],
  dth: [
    [19.51, 4.39, 38.31, 58.48],
    [39.84, 4.39, 64.94, 58.48],
    [66.46, 4.39, 95.73, 58.48],
  ],
};

export const TOGGLE_RECTS: Record<FrameKey, ToggleRect> = {
  stk: [89.3, 35.4, 4.1, 2.9],
  dtk: [89.3, 61.9, 4.5, 4.2],
  sth: [89.4, 32.9, 4.1, 2.9],
  dth: [89.3, 64.6, 4.1, 2.8],
};

export function frameKey(depth: boolean, thoughts: boolean): FrameKey {
  return ((depth ? "d" : "s") + (thoughts ? "th" : "tk")) as FrameKey;
}

export function cardRectStyle([left, top, right, bottom]: CardRect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${(right - left).toFixed(2)}%`,
    height: `${(bottom - top).toFixed(2)}%`,
  };
}

export function toggleRectStyle([left, top, width, height]: ToggleRect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}
