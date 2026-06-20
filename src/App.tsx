import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MapPin,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
};

type Match = {
  id: string;
  court: number;
  teamA: string[];
  teamB: string[];
  scoreA?: number;
  scoreB?: number;
};

type Round = {
  id: string;
  number: number;
  matches: Match[];
  resting: string[];
};

type LeaderboardRow = {
  id: string;
  name: string;
  points: number;
  played: number;
  wins: number;
  diff: number;
  average: number;
};

type VenueId = "bangkok-paddle" | "sterling-sporting-center";

type PersistedState = {
  players: Player[];
  venueId: VenueId;
  pointsPerGame: number;
  courtCount: number;
  roundCount: number;
  activeRound: number;
  schedule: Round[];
  leaderboardVisible: boolean;
  scheduleSeed: number;
};

const STORAGE_KEY = "rally-americano-state-v1";

const venues: Record<
  VenueId,
  {
    name: string;
    courts: string[];
  }
> = {
  "bangkok-paddle": {
    name: "Bangkok Paddle",
    courts: ["Obanji", "Pecunia"],
  },
  "sterling-sporting-center": {
    name: "Sterling Sporting Center",
    courts: ["Court 1", "Court 2"],
  },
};

const starterPlayers: Player[] = [
  "Alex",
  "Maya",
  "Noah",
  "Priya",
  "Leo",
  "Sofia",
  "Ken",
  "Ari",
].map((name, index) => ({
  id: createId(index),
  name,
}));

function createId(seed = Date.now()) {
  return `p_${seed}_${Math.random().toString(36).slice(2, 8)}`;
}

function pairsOf(ids: string[]) {
  const pairs: string[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs.push(pairKey(ids[i], ids[j]));
    }
  }
  return pairs;
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function hashText(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function recommendedCourts(playerCount: number) {
  return Math.max(1, Math.floor(playerCount / 4));
}

function recommendedRounds(playerCount: number, courtCount: number) {
  if (playerCount < 4) return 0;
  const pairTotal = (playerCount * (playerCount - 1)) / 2;
  return clamp(Math.ceil(pairTotal / Math.max(1, courtCount * 2)), 1, 72);
}

function getPlayerName(players: Player[], id: string) {
  return players.find((player) => player.id === id)?.name ?? "Removed player";
}

function getCourtName(venueId: VenueId, court: number) {
  return venues[venueId].courts[court - 1] ?? `Court ${court}`;
}

function generateSchedule(
  players: Player[],
  courtCount: number,
  roundCount: number,
  seed: number
): Round[] {
  const ids = players.map((player) => player.id);
  const courts = clamp(courtCount, 1, recommendedCourts(ids.length));
  const rounds = Math.max(0, roundCount);
  if (ids.length < 4 || rounds === 0) return [];

  const baseCycleLength = recommendedRounds(ids.length, courts);
  const baseCycle = generateCycle(players, courts, baseCycleLength, seed);

  return Array.from({ length: rounds }, (_, index) => {
    const template = baseCycle[index % baseCycle.length];
    const cycleNumber = Math.floor(index / baseCycle.length) + 1;

    return {
      id: `round_${index + 1}_cycle_${cycleNumber}_${seed}`,
      number: index + 1,
      matches: template.matches.map((match) => ({
        ...match,
        id: `r${index + 1}_c${match.court}_${seed}`,
        scoreA: undefined,
        scoreB: undefined,
      })),
      resting: [...template.resting],
    };
  });
}

function generateCycle(
  players: Player[],
  courtCount: number,
  roundCount: number,
  seed: number
): Round[] {
  const ids = players.map((player) => player.id);
  const courts = clamp(courtCount, 1, recommendedCourts(ids.length));
  const playCounts = new Map<string, number>();
  const restCounts = new Map<string, number>();
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const totalPartnerPairs = pairsOf(ids).length;
  let previousResting = new Set<string>();

  ids.forEach((id) => {
    playCounts.set(id, 0);
    restCounts.set(id, 0);
  });

  const schedule: Round[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const used = new Set<string>();
    const matches: Match[] = [];

    for (let court = 1; court <= courts; court += 1) {
      const candidate = bestCandidate({
        ids,
        used,
        playCounts,
        restCounts,
        partnerCounts,
        opponentCounts,
        previousResting,
        freshPartnersNeeded: countCoveredPartnerPairs(partnerCounts) < totalPartnerPairs,
        seed,
        roundIndex,
        court,
      });

      if (!candidate) break;

      [...candidate.teamA, ...candidate.teamB].forEach((id) => {
        used.add(id);
        playCounts.set(id, (playCounts.get(id) ?? 0) + 1);
      });

      const partners = [
        pairKey(candidate.teamA[0], candidate.teamA[1]),
        pairKey(candidate.teamB[0], candidate.teamB[1]),
      ];
      const opponents = candidate.teamA.flatMap((a) =>
        candidate.teamB.map((b) => pairKey(a, b))
      );

      partners.forEach((key) => partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1));
      opponents.forEach((key) => opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1));

      matches.push({
        id: `r${roundIndex + 1}_c${court}_${seed}`,
        court,
        teamA: candidate.teamA,
        teamB: candidate.teamB,
      });
    }

    const resting = ids.filter((id) => !used.has(id));
    resting.forEach((id) => restCounts.set(id, (restCounts.get(id) ?? 0) + 1));
    previousResting = new Set(resting);

    schedule.push({
      id: `round_${roundIndex + 1}_${seed}`,
      number: roundIndex + 1,
      matches,
      resting,
    });
  }

  return schedule;
}

function countCoveredPartnerPairs(partnerCounts: Map<string, number>) {
  return Array.from(partnerCounts.values()).filter((count) => count > 0).length;
}

function bestCandidate(args: {
  ids: string[];
  used: Set<string>;
  playCounts: Map<string, number>;
  restCounts: Map<string, number>;
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  previousResting: Set<string>;
  freshPartnersNeeded: boolean;
  seed: number;
  roundIndex: number;
  court: number;
}) {
  const available = args.ids.filter((id) => !args.used.has(id));
  if (available.length < 4) return null;

  let best:
    | {
        teamA: string[];
        teamB: string[];
        score: number;
      }
    | null = null;

  for (let a = 0; a < available.length - 3; a += 1) {
    for (let b = a + 1; b < available.length - 2; b += 1) {
      for (let c = b + 1; c < available.length - 1; c += 1) {
        for (let d = c + 1; d < available.length; d += 1) {
          const group = [available[a], available[b], available[c], available[d]];
          const splits = [
            { teamA: [group[0], group[1]], teamB: [group[2], group[3]] },
            { teamA: [group[0], group[2]], teamB: [group[1], group[3]] },
            { teamA: [group[0], group[3]], teamB: [group[1], group[2]] },
          ];

          for (const split of splits) {
            const score = candidateScore(split, args);
            if (!best || score > best.score) {
              best = { ...split, score };
            }
          }
        }
      }
    }
  }

  return best;
}

function candidateScore(
  split: { teamA: string[]; teamB: string[] },
  args: {
    playCounts: Map<string, number>;
    restCounts: Map<string, number>;
    partnerCounts: Map<string, number>;
    opponentCounts: Map<string, number>;
    previousResting: Set<string>;
    freshPartnersNeeded: boolean;
    seed: number;
    roundIndex: number;
    court: number;
  }
) {
  const group = [...split.teamA, ...split.teamB];
  const minPlayed = Math.min(...Array.from(args.playCounts.values()));
  const maxRested = Math.max(...Array.from(args.restCounts.values()));
  const teammatePairs = [pairKey(split.teamA[0], split.teamA[1]), pairKey(split.teamB[0], split.teamB[1])];
  const opponentPairs = split.teamA.flatMap((a) => split.teamB.map((b) => pairKey(a, b)));

  const playBalance = group.reduce(
    (sum, id) => sum + (minPlayed + 1 - (args.playCounts.get(id) ?? 0)) * 18,
    0
  );
  const restBalance = group.reduce(
    (sum, id) => sum + ((args.restCounts.get(id) ?? 0) - maxRested) * 4,
    0
  );
  const restReturn = group.reduce((sum, id) => sum + (args.previousResting.has(id) ? 16 : 0), 0);
  const partnerNovelty = teammatePairs.reduce((sum, key) => {
    const previousPairings = args.partnerCounts.get(key) ?? 0;
    if (!args.freshPartnersNeeded) return sum + 40 / (1 + previousPairings);
    return sum + (previousPairings === 0 ? 1600 : -1600);
  }, 0);
  const opponentNovelty = opponentPairs.reduce(
    (sum, key) => sum + 10 / (1 + (args.opponentCounts.get(key) ?? 0)),
    0
  );
  const stableNoise =
    (hashText(`${group.join("")}_${args.seed}_${args.roundIndex}_${args.court}`) % 1000) / 1000;

  return playBalance + restBalance + restReturn + partnerNovelty + opponentNovelty + stableNoise;
}

function calculateLeaderboard(players: Player[], schedule: Round[], pointsPerGame: number): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();
  players.forEach((player) => {
    rows.set(player.id, {
      id: player.id,
      name: player.name,
      points: 0,
      played: 0,
      wins: 0,
      diff: 0,
      average: 0,
    });
  });

  schedule.forEach((round) => {
    round.matches.forEach((match) => {
      const scoreA = match.scoreA;
      const scoreB = match.scoreB;
      if (
        typeof scoreA !== "number" ||
        typeof scoreB !== "number" ||
        scoreA + scoreB !== pointsPerGame
      ) {
        return;
      }

      match.teamA.forEach((id) => {
        const row = rows.get(id);
        if (!row) return;
        row.points += scoreA;
        row.played += 1;
        row.diff += scoreA - scoreB;
        row.wins += scoreA > scoreB ? 1 : 0;
      });

      match.teamB.forEach((id) => {
        const row = rows.get(id);
        if (!row) return;
        row.points += scoreB;
        row.played += 1;
        row.diff += scoreB - scoreA;
        row.wins += scoreB > scoreA ? 1 : 0;
      });
    });
  });

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      average: row.played ? row.points / row.played : 0,
    }))
    .sort((a, b) => b.points - a.points || b.diff - a.diff || b.average - a.average || a.name.localeCompare(b.name));
}

function App() {
  const [players, setPlayers] = useState<Player[]>(starterPlayers);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [venueId, setVenueId] = useState<VenueId>("bangkok-paddle");
  const [pointsPerGame, setPointsPerGame] = useState(20);
  const [courtCount, setCourtCount] = useState(2);
  const [roundCount, setRoundCount] = useState(7);
  const [activeRound, setActiveRound] = useState(0);
  const [schedule, setSchedule] = useState<Round[]>([]);
  const [leaderboardVisible, setLeaderboardVisible] = useState(true);
  const [scheduleSeed, setScheduleSeed] = useState(1);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as PersistedState;
      setPlayers(parsed.players?.length ? parsed.players : starterPlayers);
      setVenueId(parsed.venueId && venues[parsed.venueId] ? parsed.venueId : "bangkok-paddle");
      setPointsPerGame(parsed.pointsPerGame ?? 20);
      setCourtCount(parsed.courtCount ?? 2);
      setRoundCount(parsed.roundCount ?? 7);
      setActiveRound(parsed.activeRound ?? 0);
      setSchedule(parsed.schedule ?? []);
      setLeaderboardVisible(parsed.leaderboardVisible ?? true);
      setScheduleSeed(parsed.scheduleSeed ?? 1);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const next: PersistedState = {
      players,
      venueId,
      pointsPerGame,
      courtCount,
      roundCount,
      activeRound,
      schedule,
      leaderboardVisible,
      scheduleSeed,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [activeRound, courtCount, leaderboardVisible, players, pointsPerGame, roundCount, schedule, scheduleSeed, venueId]);

  useEffect(() => {
    const maxCourts = Math.min(recommendedCourts(players.length), venues[venueId].courts.length);
    setCourtCount((current) => clamp(current, 1, maxCourts));
  }, [players.length, venueId]);

  const leaderboard = useMemo(
    () => calculateLeaderboard(players, schedule, pointsPerGame),
    [players, pointsPerGame, schedule]
  );
  const active = schedule[activeRound];
  const selectedVenue = venues[venueId];
  const maxCourts = Math.min(recommendedCourts(players.length), selectedVenue.courts.length);
  const currentRoundComplete =
    !!active &&
    active.matches.length > 0 &&
    active.matches.every(
      (match) =>
        typeof match.scoreA === "number" &&
        typeof match.scoreB === "number" &&
        match.scoreA + match.scoreB === pointsPerGame
    );
  const coverage = useMemo(() => {
    const totalPairs = pairsOf(players.map((player) => player.id)).length;
    const partnerPairs = new Set<string>();
    schedule.forEach((round) => {
      round.matches.forEach((match) => {
        partnerPairs.add(pairKey(match.teamA[0], match.teamA[1]));
        partnerPairs.add(pairKey(match.teamB[0], match.teamB[1]));
      });
    });
    return {
      covered: partnerPairs.size,
      total: totalPairs,
      percent: totalPairs ? Math.round((partnerPairs.size / totalPairs) * 100) : 0,
    };
  }, [players, schedule]);

  function addPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    setPlayers((current) => [...current, { id: createId(), name }]);
    setNewPlayerName("");
    setSchedule([]);
    setActiveRound(0);
  }

  function removePlayer(id: string) {
    setPlayers((current) => current.filter((player) => player.id !== id));
    setSchedule([]);
    setActiveRound(0);
  }

  function generateNewSchedule(nextSeed = scheduleSeed) {
    const nextSchedule = generateSchedule(players, courtCount, roundCount, nextSeed);
    setSchedule(nextSchedule);
    setActiveRound(0);
    setScheduleSeed(nextSeed);
  }

  function refreshSchedule() {
    const nextSeed = scheduleSeed + 1;
    generateNewSchedule(nextSeed);
  }

  function applyRecommended() {
    const nextCourts = Math.min(recommendedCourts(players.length), selectedVenue.courts.length);
    setCourtCount(nextCourts);
    setRoundCount(recommendedRounds(players.length, nextCourts));
  }

  function changeVenue(nextVenueId: VenueId) {
    setVenueId(nextVenueId);
    setSchedule([]);
    setActiveRound(0);
  }

  function goToNextRound() {
    if (!schedule.length || !currentRoundComplete) return;
    if (activeRound >= schedule.length - 1) {
      const extendedSchedule = generateSchedule(players, courtCount, schedule.length + 1, scheduleSeed);
      setSchedule((current) => [...current, extendedSchedule[current.length]]);
      setActiveRound((current) => current + 1);
      setRoundCount((current) => current + 1);
      return;
    }

    setActiveRound((current) => current + 1);
  }

  function updateScore(roundId: string, matchId: string, side: "A" | "B", value: string) {
    const parsed = Number(value);
    if (value === "" || Number.isNaN(parsed)) {
      setSchedule((current) =>
        current.map((round) =>
          round.id === roundId
            ? {
                ...round,
                matches: round.matches.map((match) =>
                  match.id === matchId ? { ...match, scoreA: undefined, scoreB: undefined } : match
                ),
              }
            : round
        )
      );
      return;
    }

    const score = clamp(Math.round(parsed), 0, pointsPerGame);
    setSchedule((current) =>
      current.map((round) =>
        round.id === roundId
          ? {
              ...round,
              matches: round.matches.map((match) =>
                match.id === matchId
                  ? side === "A"
                    ? { ...match, scoreA: score, scoreB: pointsPerGame - score }
                    : { ...match, scoreA: pointsPerGame - score, scoreB: score }
                  : match
              ),
            }
          : round
      )
    );
  }

  const completedMatches = schedule.reduce(
    (sum, round) =>
      sum +
      round.matches.filter(
        (match) =>
          typeof match.scoreA === "number" &&
          typeof match.scoreB === "number" &&
          match.scoreA + match.scoreB === pointsPerGame
      ).length,
    0
  );
  const totalMatches = schedule.reduce((sum, round) => sum + round.matches.length, 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Padel event desk</p>
          <h1>Rally Americano</h1>
        </div>
        <div className="topbar-stats" aria-label="Event summary">
          <span>
            <Users size={16} /> {players.length} players
          </span>
          <span>
            <MapPin size={16} /> {selectedVenue.name}
          </span>
          <span>{courtCount} courts</span>
          <span>{pointsPerGame} points</span>
        </div>
      </header>

      <main className="workspace">
        <section className="setup-panel" aria-label="Event setup">
          <div className="section-title">
            <div>
              <p className="eyebrow">Setup</p>
              <h2>Event controls</h2>
            </div>
            <button className="icon-button" type="button" onClick={applyRecommended} title="Recommended setup">
              <RotateCcw size={18} />
            </button>
          </div>

          <div className="field-grid">
            <label className="venue-field">
              <span>Location</span>
              <select
                value={venueId}
                onChange={(event) => changeVenue(event.target.value as VenueId)}
              >
                {Object.entries(venues).map(([id, venue]) => (
                  <option key={id} value={id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Points</span>
              <input
                type="number"
                min={1}
                max={99}
                value={pointsPerGame}
                onChange={(event) => setPointsPerGame(clamp(Number(event.target.value), 1, 99))}
              />
            </label>
            <label>
              <span>Courts</span>
              <input
                type="number"
                min={1}
                max={maxCourts}
                value={courtCount}
                onChange={(event) => setCourtCount(clamp(Number(event.target.value), 1, maxCourts))}
              />
            </label>
            <label>
              <span>Rounds</span>
              <input
                type="number"
                min={players.length < 4 ? 0 : 1}
                max={72}
                value={roundCount}
                onChange={(event) => setRoundCount(clamp(Number(event.target.value), 0, 72))}
              />
            </label>
          </div>

          <div className="player-entry">
            <input
              type="text"
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addPlayer();
              }}
              placeholder="Player name"
            />
            <button className="primary-icon" type="button" onClick={addPlayer} title="Add player">
              <Plus size={18} />
            </button>
          </div>

          <div className="player-list">
            {players.map((player) => (
              <div className="player-row" key={player.id}>
                <span>{player.name}</span>
                <button
                  className="ghost-icon"
                  type="button"
                  onClick={() => removePlayer(player.id)}
                  title={`Remove ${player.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="action-row">
            <button className="primary-button" type="button" disabled={players.length < 4} onClick={() => generateNewSchedule()}>
              <Shuffle size={18} /> Generate
            </button>
            <button className="secondary-button" type="button" disabled={!schedule.length} onClick={refreshSchedule}>
              <RotateCcw size={18} /> Reshuffle
            </button>
          </div>

          <div className="coverage-meter">
            <div>
              <span>Partner coverage</span>
              <strong>
                {coverage.covered}/{coverage.total}
              </strong>
            </div>
            <div className="meter-track">
              <span style={{ width: `${coverage.percent}%` }} />
            </div>
          </div>
        </section>

        <section className="round-panel" aria-label="Round scoring">
          <div className="round-toolbar">
            <button
              className="icon-button"
              type="button"
              onClick={() => setActiveRound((current) => Math.max(0, current - 1))}
              disabled={activeRound === 0}
              title="Previous round"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <p className="eyebrow">{completedMatches}/{totalMatches} matches scored</p>
              <h2>{active ? `Round ${active.number} of ${schedule.length}` : "No schedule"}</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={goToNextRound}
              disabled={!currentRoundComplete}
              title="Next round"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {!active ? (
            <div className="empty-state">
              <div className="court-preview" aria-hidden="true">
                <span />
                <span />
              </div>
              <h2>Ready for the draw</h2>
              <p>{players.length < 4 ? "Add at least four players." : "Generate rounds when the player list is set."}</p>
            </div>
          ) : (
            <>
              <div className="matches-grid">
                {active.matches.map((match) => (
                  <article className="match-card" key={match.id}>
                    <div className="court-lines" aria-hidden="true" />
                    <div className="match-heading">
                      <span>{getCourtName(venueId, match.court)}</span>
                      <strong>{pointsPerGame} total</strong>
                    </div>
                    <ScoreTeam
                      label="Team A"
                      players={match.teamA.map((id) => getPlayerName(players, id))}
                      value={match.scoreA}
                      max={pointsPerGame}
                      onChange={(value) => updateScore(active.id, match.id, "A", value)}
                    />
                    <ScoreTeam
                      label="Team B"
                      players={match.teamB.map((id) => getPlayerName(players, id))}
                      value={match.scoreB}
                      max={pointsPerGame}
                      onChange={(value) => updateScore(active.id, match.id, "B", value)}
                    />
                  </article>
                ))}
              </div>

              <div className="rest-strip">
                <span>Resting</span>
                <div>
                  {active.resting.length ? (
                    active.resting.map((id) => <strong key={id}>{getPlayerName(players, id)}</strong>)
                  ) : (
                    <strong>None</strong>
                  )}
                </div>
              </div>

              <div className="schedule-strip" aria-label="All rounds">
                {schedule.map((round, index) => (
                  <button
                    key={round.id}
                    type="button"
                    className={index === activeRound ? "active" : ""}
                    onClick={() => setActiveRound(index)}
                    disabled={index > activeRound && !currentRoundComplete}
                  >
                    {round.number}
                  </button>
                ))}
              </div>

              <div className="round-action-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={goToNextRound}
                  disabled={!currentRoundComplete}
                >
                  <ChevronRight size={18} />
                  {activeRound >= schedule.length - 1 ? "Start Next Cycle" : "Next Round"}
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="leaderboard-panel" aria-label="Leaderboard">
          <div className="section-title">
            <div>
              <p className="eyebrow">Live table</p>
              <h2>Leaderboard</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setLeaderboardVisible((current) => !current)}
              title={leaderboardVisible ? "Hide leaderboard" : "Show leaderboard"}
            >
              {leaderboardVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className={leaderboardVisible ? "leaderboard-list" : "leaderboard-list hidden"}>
            {leaderboard.map((row, index) => (
              <div className="leaderboard-row" key={row.id}>
                <div className="rank">{index === 0 ? <Trophy size={18} /> : index + 1}</div>
                <div className="leaderboard-name">
                  <strong>{row.name}</strong>
                  <span>
                    {row.played} played - {row.wins} wins
                  </span>
                </div>
                <div className="leaderboard-score">
                  <strong>{row.points}</strong>
                  <span>{row.diff >= 0 ? "+" : ""}{row.diff}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function ScoreTeam(props: {
  label: string;
  players: string[];
  value?: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="score-team">
      <div>
        <span>{props.label}</span>
        <strong>{props.players.join(" / ")}</strong>
      </div>
      <input
        aria-label={`${props.label} score`}
        type="number"
        min={0}
        max={props.max}
        value={props.value ?? ""}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="0"
      />
    </div>
  );
}

export default App;
