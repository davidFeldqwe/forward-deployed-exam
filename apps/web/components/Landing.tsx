import Link from "next/link";

import { landingCopy } from "@/app/landing-copy";

export function Landing() {
  const { header, hero, demo, builtOn, suggestedQuestions, howItWorks, privacy, footer } =
    landingCopy;

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="wordmark">
            <span className="wordmark-mark" aria-hidden="true" />
            <span className="wordmark-name">{header.wordmark}</span>
          </div>
          {header.actions.map((action) => (
            <Link key={action.href} className="header-action" href={action.href}>
              {action.label}
            </Link>
          ))}
        </div>
      </header>

      <main className="landing-main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="landing-column">
            <h1 id="hero-title" className="hero-title">
              {hero.title}
            </h1>
            <p className="hero-subtitle">{hero.subtitle}</p>
            {hero.actions.map((action) => (
              <Link key={action.href} className="cta" href={action.href}>
                {action.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="landing-column demo-slot" aria-label="Fixture comparison">
          <div className="demo-card">
            <p className="demo-prompt">{demo.prompt}</p>
            <p className="demo-prose">{demo.prose}</p>
            <table className="demo-table">
              <thead>
                <tr>
                  {demo.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demo.rows.map((row) => (
                  <tr key={row.airport}>
                    <td>{row.airport}</td>
                    <td className="mono">{row.delayRate}</td>
                    <td className="mono">{row.avgDelay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="landing-column built-on" aria-label="Built on">
          <span className="built-on-label">Built on</span>
          <ul className="built-on-list">
            {builtOn.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="landing-column questions" aria-labelledby="questions-heading">
          <h2 id="questions-heading" className="questions-heading">
            Try one of these questions
          </h2>
          <ul className="question-list">
            {suggestedQuestions.map((question) => (
              <li key={question} className="question-card">
                <span>{question}</span>
                <span className="question-arrow" aria-hidden="true">
                  →
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-column how" aria-labelledby="how-heading">
          <h2 id="how-heading" className="how-heading">
            {howItWorks.heading}
          </h2>
          <ol className="how-steps">
            {howItWorks.steps.map((step, index) => (
              <li key={step} className="how-step">
                <div className="how-box">{step}</div>
                {index < howItWorks.steps.length - 1 ? (
                  <span className="how-arrow" aria-hidden="true">
                    ↓
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="how-caption">{howItWorks.caption}</p>
        </section>

        <section className="privacy" aria-label="Privacy">
          <p>{privacy}</p>
        </section>
      </main>

      <footer className="landing-footer">
        <a href={footer.githubHref}>{footer.githubLabel}</a>
      </footer>
    </div>
  );
}
