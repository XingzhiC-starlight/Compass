import { useEffect, useState } from "react";
import {
  CARD_RECTS,
  FRAMES,
  TOGGLE_RECTS,
  cardRectStyle,
  frameKey,
  toggleRectStyle,
  type FrameKey,
} from "./landingDemo";

const MOBILE_QUERY = "(max-width: 768px)";
const FRAME_KEYS = Object.keys(FRAMES) as FrameKey[];

export default function InteractiveDemo() {
  const [depth, setDepth] = useState(false);
  const [thoughts, setThoughts] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const active = frameKey(depth, thoughts);

  return (
    <>
      <p className="landing-demo-caption">Click any card to open its detail.</p>

      <div className="landing-demo-stage">
        {FRAME_KEYS.map((key) => (
          <img
            key={key}
            className={key === active ? "landing-demo-frame visible" : "landing-demo-frame"}
            src={FRAMES[key].src}
            alt={FRAMES[key].alt}
            aria-hidden={key !== active}
            decoding="async"
            draggable={false}
          />
        ))}

        {!isMobile && (
          <>
            {CARD_RECTS[active].map((rect, i) => (
              <button
                key={`${active}-card-${i}`}
                type="button"
                className="landing-hotspot"
                style={cardRectStyle(rect)}
                aria-label="Toggle summary or depth view"
                onClick={() => setDepth((d) => !d)}
              />
            ))}
            <button
              key={`${active}-toggle`}
              type="button"
              className="landing-hotspot landing-hotspot--toggle"
              style={toggleRectStyle(TOGGLE_RECTS[active])}
              aria-label="Switch between Task and Thoughts panel"
              onClick={() => setThoughts((t) => !t)}
            />
          </>
        )}
      </div>

      <div className="landing-seg-row">
        <Segmented
          label="Summary or depth view"
          options={["Summary", "Depth"]}
          selected={depth ? 1 : 0}
          onSelect={(i) => setDepth(i === 1)}
        />
        <Segmented
          label="Task or Thoughts panel"
          options={["Task", "Thoughts"]}
          selected={thoughts ? 1 : 0}
          onSelect={(i) => setThoughts(i === 1)}
        />
      </div>

      {isMobile && (
        <p className="landing-demo-note">
          Compass is built for desktop — use the controls above to explore.
        </p>
      )}
    </>
  );
}

function Segmented({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="landing-seg" role="group" aria-label={label}>
      {options.map((option, i) => (
        <button key={option} type="button" aria-pressed={i === selected} onClick={() => onSelect(i)}>
          {option}
        </button>
      ))}
    </div>
  );
}
