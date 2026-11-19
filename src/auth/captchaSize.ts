export type CaptchaSize = "normal" | "compact";

const COMPACT_BELOW_PX = 480;

export function captchaSizeForWidth(viewportWidth: number): CaptchaSize {
  return viewportWidth < COMPACT_BELOW_PX ? "compact" : "normal";
}
