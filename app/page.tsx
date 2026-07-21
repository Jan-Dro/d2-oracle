"use client";

import { FormEvent, useMemo, useState } from "react";
import godRollData from "@/data/god-rolls.json";

type Roll = {
  mode: string;
  heading: string;
  fields: Record<string, string[]>;
};

type Weapon = {
  id: string;
  weapon: string;
  type: string;
  ammo: string;
  element: string;
  tier: { rank: string; label: string };
  excels: string[];
  acquisitionSource: string;
  lastUpdate: string;
  image: string;
  rollStatus: string;
  rolls: Roll[];
};

const weapons = godRollData.weapons as Weapon[];
const RESULTS_PER_PAGE = 24;
const availableWeapons = weapons.filter((weapon) => weapon.rollStatus === "available");
const tierWeight: Record<string, number> = { "S+": 5, S: 4, A: 3, B: 2, C: 1 };
const featured = [...availableWeapons]
  .sort((a, b) => (tierWeight[b.tier.rank] ?? 0) - (tierWeight[a.tier.rank] ?? 0))
  .slice(0, 3);

function preferredRoll(weapon: Weapon) {
  return weapon.rolls.find((roll) => roll.mode === "pve") ?? weapon.rolls.find((roll) => roll.mode === "pvp") ?? weapon.rolls[0];
}

function rollPerks(roll?: Roll) {
  if (!roll) return [];
  return Object.entries(roll.fields).map(([slot, values]) => ({ slot: slot.replace(/:$/, ""), value: values.join(" / ") }));
}

function WeaponCard({ weapon, featuredCard = false }: { weapon: Weapon; featuredCard?: boolean }) {
  const modeRolls = weapon.rolls.filter((roll) => roll.mode === "pve" || roll.mode === "pvp");
  const fallbackRoll = preferredRoll(weapon);
  const [activeMode, setActiveMode] = useState(fallbackRoll?.mode ?? "general");
  const roll = modeRolls.find((candidate) => candidate.mode === activeMode) ?? fallbackRoll;
  const perks = rollPerks(roll);

  return (
    <article className={`weapon-card ${featuredCard ? "featured-card" : "result-card"}`}>
      <div className="weapon-image-wrap">
        {/* Images and weapon data are provided by the attributed source dataset. */}
        <img src={weapon.image} alt="" className="weapon-image" loading="lazy" />
        <div className="card-topline">
          <span>{weapon.element}</span>
          <span className="mode">{weapon.excels.join(" + ") || "GENERAL"}</span>
        </div>
        <span className="tier-badge">{weapon.tier.rank}</span>
      </div>
      <div className="weapon-card-body">
        <h3>{weapon.weapon}</h3>
        <p className="archetype">{weapon.ammo} // {weapon.type}</p>
        {roll ? (
          <>
            {modeRolls.length > 0 && (
              <div className="roll-tabs" role="group" aria-label={`${weapon.weapon} roll mode`}>
                {modeRolls.map((candidate) => (
                  <button
                    type="button"
                    className={candidate.mode === roll.mode ? "active" : ""}
                    aria-pressed={candidate.mode === roll.mode}
                    onClick={() => setActiveMode(candidate.mode)}
                    key={candidate.mode}
                  >
                    <span className={`mode-dot ${candidate.mode}`} />
                    {candidate.mode.toUpperCase()} ROLL
                  </button>
                ))}
              </div>
            )}
            <p className={`roll-heading ${roll.mode}`}>{roll.heading}</p>
            <div className="perk-list">
              {perks.map(({ slot, value }) => (
                <div className="perk" key={slot}><b>{slot}</b><span>{value}</span></div>
              ))}
            </div>
          </>
        ) : <p className="roll-unavailable">No structured god roll is currently indexed.</p>}
        {!featuredCard && (
          <dl>
            <div><dt>Source</dt><dd>{weapon.acquisitionSource}</dd></div>
            <div><dt>Last update</dt><dd>{weapon.lastUpdate}</dd></div>
          </dl>
        )}
      </div>
    </article>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const results = useMemo(() => {
    const normalized = submitted.toLowerCase().trim();
    if (!normalized) return [];
    const terms = normalized.split(/\s+/);
    return weapons.filter((weapon) => {
      const rollText = weapon.rolls.flatMap((roll) => [roll.mode, roll.heading, ...Object.keys(roll.fields), ...Object.values(roll.fields).flat()]).join(" ");
      const haystack = `${weapon.weapon} ${weapon.type} ${weapon.ammo} ${weapon.element} ${weapon.tier.rank} ${weapon.excels.join(" ")} ${weapon.acquisitionSource} ${rollText}`.toLowerCase();
      return terms.every((term) => {
        if (term === "pve" || term === "pvp") return weapon.rolls.some((roll) => roll.mode === term);
        return haystack.includes(term);
      });
    });
  }, [submitted]);

  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const paginatedResults = results.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);

  function changePage(page: number) {
    setCurrentPage(page);
    requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setCurrentPage(1);
    setSubmitted(query);
    requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function quickSearch(value: string) {
    setQuery(value);
    setCurrentPage(1);
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
          <span className="status"><i /> {godRollData.count.toLocaleString()} WEAPONS</span>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>LIVE ARMORY QUERY INTERFACE</span><i /></div>
        <h1>WHAT WEAPON ARE YOU<br />SEARCHING FOR TODAY,<br /><em>GUARDIAN?</em></h1>
        <p className="hero-copy">Search {godRollData.count.toLocaleString()} Destiny 2 weapons and {godRollData.countWithGodRolls.toLocaleString()} indexed god rolls across PVE and PVP.</p>

        <form className="search-shell" onSubmit={search}>
          <label htmlFor="weapon-search">Weapon search</label>
          <span className="prompt">›</span>
          <input id="weapon-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Weapon, perk, archetype, element, source..." autoComplete="off" />
          <button type="submit" aria-label="Search armory"><span>SEARCH</span><b>↗</b></button>
        </form>
        <div className="quick-searches" aria-label="Quick searches">
          <span>QUICK QUERY</span>
          {["Hand Cannon PVP", "Solar PVE", "Rocket Launcher", "Exotic Quest"].map((item) => <button key={item} onClick={() => quickSearch(item)}>{item}</button>)}
        </div>
      </section>

      {submitted && (
        <section className="results-section" id="results" aria-live="polite">
          <div className="section-heading">
            <div><span>QUERY RESULT</span><h2>{results.length ? `${results.length} WEAPONS FOUND` : "NO EXACT MATCH"}</h2></div>
            <p>SEARCH: “{submitted}”</p>
          </div>
          {results.length ? <>
            <div className="results-grid">{paginatedResults.map((weapon) => <WeaponCard key={weapon.id} weapon={weapon} />)}</div>
            {totalPages > 1 && (
              <nav className="pagination" aria-label="Search result pages">
                <button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1}>← PREVIOUS</button>
                <span>PAGE <b>{currentPage}</b> / {totalPages}</span>
                <button type="button" onClick={() => changePage(currentPage + 1)} disabled={currentPage === totalPages}>NEXT →</button>
              </nav>
            )}
          </> : (
            <div className="no-results"><span>NO SIGNAL</span><h3>The archive couldn’t resolve that query.</h3><p>Try a weapon name, perk, element, weapon type, activity, or acquisition source.</p></div>
          )}
        </section>
      )}

      <section className="featured-section" id="featured">
        <div className="section-heading"><div><span>TOP-TIER INTEL</span><h2>FEATURED GOD ROLLS</h2></div><p>{godRollData.countWithGodRolls} ROLLS INDEXED</p></div>
        <div className="featured-grid">{featured.map((weapon) => <WeaponCard key={weapon.id} weapon={weapon} featuredCard />)}</div>
      </section>

      <section className="how-section" id="how">
        <span className="section-number">02</span>
        <div><span className="label">HOW IT WORKS</span><h2>LESS GRIND.<br />BETTER ROLLS.</h2></div>
        <div className="steps">
          <p><b>01</b><span>Search by weapon, archetype, activity, element, perk, or source.</span></p>
          <p><b>02</b><span>Compare structured perk recommendations for PVE and PVP.</span></p>
          <p><b>03</b><span>Lock your target roll and return to the fight.</span></p>
        </div>
      </section>

      <footer><span>ARSENAL//ORACLE</span><p>DATA: <a href={godRollData.source.inventoryUrl} target="_blank" rel="noreferrer">BLUEBERRIES.GG ↗</a></p><p>UPDATED {new Date(godRollData.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</p></footer>
    </main>
  );
}
