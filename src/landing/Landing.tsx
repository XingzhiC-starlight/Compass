import InteractiveDemo from "./InteractiveDemo";
import "../styles/landing.css";

export default function Landing({ onLogIn }: { onLogIn: () => void }) {
  return (
    <div className="landing">
      <header className="landing-container landing-topbar">
        <div className="landing-wordmark">Compass</div>
        <button type="button" className="landing-login" onClick={onLogIn}>
          Log in
        </button>
      </header>

      <section className="landing-container landing-hero">
        <h1>
          <span className="zig">From scattered tasks</span>
          <span className="zag">to structured projects</span>
        </h1>
        <p className="landing-hero-sub">A workspace for complex self-directed projects.</p>
        <img
          className="landing-hero-pic"
          src="/landing/theme-pic.png"
          alt="Scattered notes and lists on the left; a person walks into a clean structured band of five labeled panels on the right."
          width={2544}
          height={1904}
          decoding="async"
          {...{ fetchpriority: "high" }}
        />
      </section>

      <section className="landing-container landing-categories">
        <div className="landing-eyebrow">Where am I</div>
        <div className="landing-card-grid">
          <div className="landing-card landing-card--time">
            <div className="landing-card-head">
              <span className="landing-card-dot" />
              <span className="landing-card-label">Commitment</span>
            </div>
            <p className="landing-card-copy">
              Know how much time you can realistically put into your work.
            </p>
          </div>
          <div className="landing-card landing-card--timeline">
            <div className="landing-card-head">
              <span className="landing-card-dot" />
              <span className="landing-card-label">Timeline</span>
            </div>
            <p className="landing-card-copy">Have a phase-to-phase plan for complex projects.</p>
          </div>
          <div className="landing-card landing-card--learning">
            <div className="landing-card-head">
              <span className="landing-card-dot" />
              <span className="landing-card-label">Learning</span>
            </div>
            <p className="landing-card-copy">Discover the knowledge gaps before success.</p>
          </div>
        </div>
        <div className="landing-eyebrow landing-eyebrow--what-now">What now</div>
        <div className="landing-task-bubble">
          <div>
            <div className="landing-card-head">
              <span className="landing-card-dot" />
              <span className="landing-card-label">Task</span>
            </div>
            <p className="landing-task-copy">What to do now lives under the structure.</p>
          </div>
          <div className="landing-thought-card">
            <div className="landing-card-head">
              <span className="landing-card-dot" />
              <span className="landing-card-label">Thought</span>
              <span className="landing-thought-tag">A second view of Task</span>
            </div>
            <p className="landing-thought-copy">
              Thoughts, personal reflections, and learned knowledge.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-intro">
        <h2>A simple workspace for personal project management</h2>
        <p className="landing-intro-sub">
          Clear architecture, flexible adjustment, continuous improvement
        </p>
      </section>

      <section className="landing-container landing-demo">
        <InteractiveDemo />
      </section>

      <section className="landing-container landing-cta">
        <div className="landing-cta-row">
          <div>
            <p className="landing-cta-headline">Start your first project.</p>
            <button type="button" className="landing-login landing-login--cta" onClick={onLogIn}>
              Log in
            </button>
          </div>
          <div className="landing-shapes" aria-hidden="true">
            <div className="landing-shape-circle" />
            <div className="landing-shape-arch" />
            <div className="landing-shape-quarter" />
            <div className="landing-shape-square" />
            <div className="landing-shape-outline" />
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-wordmark">Compass</div>
      </footer>
    </div>
  );
}
