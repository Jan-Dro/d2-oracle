"use client";

import { FormEvent, useMemo, useState } from "react";

type Weapon = {
  name: string;
  archetype: string;
  element: string;
  mode: string;
  perks: string[];
  masterwork: string;
  mod: string;
  note: string;
};

const weapons: Weapon[] = [
  {
    name: "The Immortal",
    archetype: "Aggressive Frame SMG",
    element: "Strand",
    mode: "PVP",
    perks: ["Rangefinder", "Target Lock"],
    masterwork: "Range",
    mod: "Counterbalance Stock",
    note: "Built for range, consistency, and fast duels in the Crucible.",
  },
  {
    name: "Forbearance",
    archetype: "Wave Frame Grenade Launcher",
    element: "Arc",
    mode: "PVE",
    perks: ["Ambitious Assassin", "Chain Reaction"],
    masterwork: "Reload Speed",
    mod: "Minor Spec",
    note: "A room-clearing roll that turns every elimination into a storm.",
  },
  {
    name: "Apex Predator",
    archetype: "Adaptive Frame Rocket Launcher",
    element: "Solar",
    mode: "PVE",
    perks: ["Reconstruction", "Bait and Switch"],
    masterwork: "Handling",
    mod: "Boss Spec",
    note: "High sustained boss damage with effortless magazine overflow.",
  },
  {
    name: "Conditional Finality",
    archetype: "Exotic Double Barrel Shotgun",
    element: "Stasis / Solar",
    mode: "PVE + PVP",
    perks: ["Paracausal Pellets", "Split Decision"],
    masterwork: "Exotic",
    mod: "Intrinsic",
    note: "Freeze, ignite, and shut down close-range threats with two elements.",
  },
  {
    name: "Elsie's Rifle",
    archetype: "High-Impact Frame Pulse Rifle",
    element: "Void",
    mode: "PVP",
    perks: ["Zen Moment", "Headseeker"],
    masterwork: "Range",
    mod: "Counterbalance Stock",
    note: "A stable, forgiving pulse roll for winning mid-range engagements.",
  },
  {
    name: "Edge Transit",
    archetype: "Adaptive Frame Grenade Launcher",
    element: "Void",
    mode: "PVE",
    perks: ["Envious Assassin", "Bait and Switch"],
    masterwork: "Handling",
    mod: "Boss Spec",
    note: "Overflow the drum, prime your damage buff, and unload on bosses.",
  },
];

const featured = [weapons[1], weapons[2], weapons[4]];

function WeaponCard({ weapon, featuredCard = false }: { weapon: Weapon; featuredCard?: boolean }) {
  return (
    <article className={`weapon-card ${featuredCard ? "featured-card" : "result-card"}`}>
      <div className="card-topline">
        <span>{weapon.element}</span>
        <span className="mode">{weapon.mode}</span>
      </div>
      <div className="weapon-mark" aria-hidden="true"><i /><i /><i /></div>
      <h3>{weapon.name}</h3>
      <p className="archetype">{weapon.archetype}</p>
      <div className="perk-row">
        {weapon.perks.map((perk, index) => (
          <span className="perk" key={perk}><b>{index + 1}</b>{perk}</span>
        ))}
      </div>
      {!featuredCard && (
        <>
          <p className="weapon-note">{weapon.note}</p>
          <dl>
            <div><dt>Masterwork</dt><dd>{weapon.masterwork}</dd></div>
            <div><dt>Suggested mod</dt><dd>{weapon.mod}</dd></div>
          </dl>
        </>
      )}
    </article>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const results = useMemo(() => {
    const normalized = submitted.toLowerCase().trim();
    if (!normalized) return [];
    const terms = normalized.split(/\s+/);
    return weapons.filter((weapon) => {
      const haystack = `${weapon.name} ${weapon.archetype} ${weapon.element} ${weapon.mode} ${weapon.perks.join(" ")}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [submitted]);

  function search(event: FormEvent) {
    event.preventDefault();
    setSubmitted(query);
    requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function quickSearch(value: string) {
    setQuery(value);
    setSubmitted(value);
    requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <main>
      <aside className="system-rail" aria-label="System status">
        <div className="sigil" aria-hidden="true"><span /></div>
        <span className="rail-copy">ARSENAL NETWORK // ONLINE</span>
        <span className="rail-index">01</span>
      </aside>

      <header>
        <a className="wordmark" href="#top" aria-label="Arsenal Oracle home"><span>△</span> ARSENAL//ORACLE</a>
        <nav aria-label="Primary navigation">
          <a href="#featured">Featured</a>
          <a href="#how">Intel</a>
          <span className="status"><i /> LIVE INDEX</span>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>ARMORY QUERY INTERFACE</span><i /></div>
        <h1>WHAT WEAPON ARE YOU<br />SEARCHING FOR TODAY,<br /><em>GUARDIAN?</em></h1>
        <p className="hero-copy">Find focused PVE and PVP god rolls, perk pairings, and build-ready recommendations from the armory.</p>

        <form className="search-shell" onSubmit={search}>
          <label htmlFor="weapon-search">Weapon search</label>
          <span className="prompt">›</span>
          <input
            id="weapon-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter a weapon, archetype, or element..."
            autoComplete="off"
          />
          <button type="submit" aria-label="Search armory"><span>SEARCH</span><b>↗</b></button>
        </form>
        <div className="quick-searches" aria-label="Quick searches">
          <span>QUICK QUERY</span>
          {["Apex Predator", "PVE Void", "PVP Pulse Rifle"].map((item) => (
            <button key={item} onClick={() => quickSearch(item)}>{item}</button>
          ))}
        </div>
      </section>

      {submitted && (
        <section className="results-section" id="results" aria-live="polite">
          <div className="section-heading">
            <div><span>QUERY RESULT</span><h2>{results.length ? `${results.length} ROLL${results.length > 1 ? "S" : ""} FOUND` : "NO EXACT MATCH"}</h2></div>
            <p>SEARCH: “{submitted}”</p>
          </div>
          {results.length ? (
            <div className="results-grid">{results.map((weapon) => <WeaponCard key={weapon.name} weapon={weapon} />)}</div>
          ) : (
            <div className="no-results">
              <span>NO SIGNAL</span>
              <h3>The archive couldn’t resolve that query.</h3>
              <p>Try a weapon name, “PVE Void,” “PVP,” “Pulse Rifle,” or one of the quick queries above.</p>
            </div>
          )}
        </section>
      )}

      <section className="featured-section" id="featured">
        <div className="section-heading">
          <div><span>CURATED INTEL</span><h2>FEATURED GOD ROLLS</h2></div>
          <p>REFRESH // WEEKLY</p>
        </div>
        <div className="featured-grid">{featured.map((weapon) => <WeaponCard key={weapon.name} weapon={weapon} featuredCard />)}</div>
      </section>

      <section className="how-section" id="how">
        <span className="section-number">02</span>
        <div><span className="label">HOW IT WORKS</span><h2>LESS GRIND.<br />BETTER ROLLS.</h2></div>
        <div className="steps">
          <p><b>01</b><span>Search any weapon, archetype, activity, or element.</span></p>
          <p><b>02</b><span>Compare curated perk combinations for PVE and PVP.</span></p>
          <p><b>03</b><span>Lock your target roll and return to the fight.</span></p>
        </div>
      </section>

      <footer><span>ARSENAL//ORACLE</span><p>UNOFFICIAL COMMUNITY ARMORY CONCEPT</p><p>DATA LINK // ACTIVE</p></footer>
    </main>
  );
}
