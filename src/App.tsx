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

type PartnerPair = [string, string];

type MatchPlan = {
  teamA: PartnerPair;
  teamB: PartnerPair;
};

type RoundPlan = {
  partnerPairs: PartnerPair[];
  matches: MatchPlan[];
  score: number;
};

type LeaderboardRow = {
  id: string;
  name: string;
  points: number;
  played: number;
  wins: number;
  diff: number;
  rests: number;
  average: number;
};

type VenueId = "bangkok-paddle" | "sterling-sporting-center";
type AppScreen = "setup" | "tracking";

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
const REST_BONUS_POINTS = 10;
const LOGO_SRC = "/rally-logo-cropped.png";

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

function completeCycleRoundCount(players: Player[], courtCount: number, seed: number) {
  if (players.length < 4) return 0;

  const courts = clamp(courtCount, 1, recommendedCourts(players.length));
  const minimumRounds = recommendedRounds(players.length, courts);

  for (let roundCount = minimumRounds; roundCount <= 72; roundCount += 1) {
    const cycle = generateCycle(players, courts, roundCount, seed);
    const coverage = scheduleCoverage(players, cycle);
    if (coverage.missingPairs === 0 && coverage.restSpread <= 1) {
      return roundCount;
    }
  }

  return minimumRounds;
}

function scheduleCoverage(players: Player[], schedule: Round[]) {
  const ids = players.map((player) => player.id);
  const expectedPairs = new Set(pairsOf(ids));
  const partnerPairs = new Set<string>();
  const restCounts = new Map(ids.map((id) => [id, 0]));

  schedule.forEach((round) => {
    round.resting.forEach((id) => restCounts.set(id, (restCounts.get(id) ?? 0) + 1));
    round.matches.forEach((match) => {
      partnerPairs.add(pairKey(match.teamA[0], match.teamA[1]));
      partnerPairs.add(pairKey(match.teamB[0], match.teamB[1]));
    });
  });

  const rests = Array.from(restCounts.values());

  return {
    missingPairs: Array.from(expectedPairs).filter((pair) => !partnerPairs.has(pair)).length,
    restSpread: rests.length ? Math.max(...rests) - Math.min(...rests) : 0,
  };
}

function getPlayerName(players: Player[], id: string) {
  return players.find((player) => player.id === id)?.name ?? "Removed player";
}

function getCourtName(venueId: VenueId, court: number) {
  return venues[venueId].courts[court - 1] ?? `Court ${court}`;
}

function isRoundComplete(round: Round | undefined, pointsPerGame: number) {
  return (
    !!round &&
    round.matches.length > 0 &&
    round.matches.every(
      (match) =>
        typeof match.scoreA === "number" &&
        typeof match.scoreB === "number" &&
        match.scoreA + match.scoreB === pointsPerGame
    )
  );
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

  const baseCycleLength = completeCycleRoundCount(players, courts, seed);
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
  const oneByeCycle = generateOneByeRoundRobinCycle(players, courts, seed);
  if (oneByeCycle.length > 0) {
    return Array.from({ length: roundCount }, (_, index) => {
      const template = oneByeCycle[index % oneByeCycle.length];
      const cycleNumber = Math.floor(index / oneByeCycle.length) + 1;
      return {
        ...template,
        id: `round_${index + 1}_cycle_${cycleNumber}_${seed}`,
        number: index + 1,
        matches: template.matches.map((match) => ({
          ...match,
          id: `r${index + 1}_c${match.court}_${seed}`,
        })),
        resting: [...template.resting],
      };
    });
  }

  const pairSlots = courts * 2;
  const playCounts = new Map<string, number>();
  const restCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const uncoveredPairs = new Set(pairsOf(ids));
  let previousResting = new Set<string>();

  ids.forEach((id) => {
    playCounts.set(id, 0);
    restCounts.set(id, 0);
  });

  const schedule: Round[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const roundPlan = bestRoundPlan({
      ids,
      pairSlots,
      playCounts,
      restCounts,
      opponentCounts,
      uncoveredPairs,
      previousResting,
      seed,
      roundIndex,
    });
    const used = new Set(roundPlan.partnerPairs.flat());
    const resting = ids.filter((id) => !used.has(id));

    roundPlan.partnerPairs.forEach(([a, b]) => uncoveredPairs.delete(pairKey(a, b)));
    roundPlan.matches.forEach((match) => {
      match.teamA.forEach((a) => {
        match.teamB.forEach((b) => {
          const key = pairKey(a, b);
          opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
        });
      });
    });
    roundPlan.partnerPairs.flat().forEach((id) => {
      playCounts.set(id, (playCounts.get(id) ?? 0) + 1);
    });
    resting.forEach((id) => restCounts.set(id, (restCounts.get(id) ?? 0) + 1));
    previousResting = new Set(resting);

    schedule.push({
      id: `round_${roundIndex + 1}_${seed}`,
      number: roundIndex + 1,
      matches: roundPlan.matches.map((match, index) => ({
        id: `r${roundIndex + 1}_c${index + 1}_${seed}`,
        court: index + 1,
        teamA: match.teamA,
        teamB: match.teamB,
      })),
      resting,
    });
  }

  return schedule;
}

function generateOneByeRoundRobinCycle(players: Player[], courtCount: number, seed: number): Round[] {
  const ids = players.map((player) => player.id);
  const playingCapacity = courtCount * 4;
  if (ids.length !== playingCapacity + 1) return [];

  const bye = "__REST__";
  let rotation = [bye, ...ids];
  const roundCount = rotation.length - 1;
  const rounds: Round[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const pairings: PartnerPair[] = [];
    const resting: string[] = [];

    for (let index = 0; index < rotation.length / 2; index += 1) {
      const a = rotation[index];
      const b = rotation[rotation.length - 1 - index];
      if (a === bye || b === bye) {
        resting.push(a === bye ? b : a);
      } else {
        pairings.push([a, b]);
      }
    }

    rounds.push({
      id: `round_${roundIndex + 1}_${seed}`,
      number: roundIndex + 1,
      matches: pairings.reduce<Match[]>((matches, pair, index) => {
        if (index % 2 === 0) {
          const opponentPair = pairings[index + 1];
          if (opponentPair) {
            matches.push({
              id: `r${roundIndex + 1}_c${matches.length + 1}_${seed}`,
              court: matches.length + 1,
              teamA: pair,
              teamB: opponentPair,
            });
          }
        }
        return matches;
      }, []),
      resting,
    });

    rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1)];
  }

  return rounds;
}

function bestRoundPlan(args: {
  ids: string[];
  pairSlots: number;
  playCounts: Map<string, number>;
  restCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  uncoveredPairs: Set<string>;
  previousResting: Set<string>;
  seed: number;
  roundIndex: number;
}): RoundPlan {
  if (args.ids.length <= 12) {
    return exhaustiveRoundPlan(args);
  }

  const used = new Set<string>();
  const partnerCounts = new Map<string, number>();
  const matches: MatchPlan[] = [];
  const partnerPairs: PartnerPair[] = [];
  const courts = Math.floor(args.pairSlots / 2);

  pairsOf(args.ids).forEach((pair) => {
    partnerCounts.set(pair, args.uncoveredPairs.has(pair) ? 0 : 1);
  });

  for (let court = 0; court < courts; court += 1) {
    const candidate = bestCandidate({
      ids: args.ids,
      used,
      playCounts: args.playCounts,
      restCounts: args.restCounts,
      partnerCounts,
      opponentCounts: args.opponentCounts,
      previousResting: args.previousResting,
      freshPartnersNeeded: args.uncoveredPairs.size > 0,
      seed: args.seed,
      roundIndex: args.roundIndex,
      court,
    });

    if (!candidate) break;

    const teamA = [candidate.teamA[0], candidate.teamA[1]] as PartnerPair;
    const teamB = [candidate.teamB[0], candidate.teamB[1]] as PartnerPair;
    matches.push({ teamA, teamB });
    partnerPairs.push(teamA, teamB);
    [...teamA, ...teamB].forEach((id) => used.add(id));
    [teamA, teamB].forEach((pair) => {
      const key = pairKey(pair[0], pair[1]);
      partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1);
    });
  }

  return { partnerPairs, matches, score: roundPlanScore({ ...args, partnerPairs, matches }) };
}

function exhaustiveRoundPlan(args: {
  ids: string[];
  pairSlots: number;
  playCounts: Map<string, number>;
  restCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  uncoveredPairs: Set<string>;
  previousResting: Set<string>;
  seed: number;
  roundIndex: number;
}): RoundPlan {
  const combos = partnerPairCombos(args.ids, Math.min(args.pairSlots, Math.floor(args.ids.length / 2)));
  let best: RoundPlan | null = null;

  combos.forEach((partnerPairs) => {
    const matchPlans = matchPairings(partnerPairs);
    matchPlans.forEach((matches) => {
      const score = roundPlanScore({ ...args, partnerPairs, matches });
      if (!best || score > best.score) {
        best = { partnerPairs, matches, score };
      }
    });
  });

  return best ?? { partnerPairs: [], matches: [], score: 0 };
}

function partnerPairCombos(ids: string[], targetPairs: number): PartnerPair[][] {
  const allPairs: PartnerPair[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      allPairs.push([ids[i], ids[j]]);
    }
  }

  const combos: PartnerPair[][] = [];

  function walk(start: number, chosen: PartnerPair[], used: Set<string>) {
    if (chosen.length === targetPairs) {
      combos.push(chosen.map((pair) => [...pair] as PartnerPair));
      return;
    }

    for (let index = start; index < allPairs.length; index += 1) {
      const [a, b] = allPairs[index];
      if (used.has(a) || used.has(b)) continue;
      used.add(a);
      used.add(b);
      chosen.push([a, b]);
      walk(index + 1, chosen, used);
      chosen.pop();
      used.delete(a);
      used.delete(b);
    }
  }

  walk(0, [], new Set());
  return combos;
}

function matchPairings(partnerPairs: PartnerPair[]): MatchPlan[][] {
  if (partnerPairs.length < 2) return [];
  const plans: MatchPlan[][] = [];

  function walk(remaining: PartnerPair[], matches: MatchPlan[]) {
    if (remaining.length === 0) {
      plans.push(matches.map((match) => ({ teamA: [...match.teamA] as PartnerPair, teamB: [...match.teamB] as PartnerPair })));
      return;
    }

    const first = remaining[0];
    for (let index = 1; index < remaining.length; index += 1) {
      const next = remaining[index];
      const rest = remaining.filter((_, restIndex) => restIndex !== 0 && restIndex !== index);
      matches.push({ teamA: first, teamB: next });
      walk(rest, matches);
      matches.pop();
    }
  }

  walk(partnerPairs, []);
  return plans;
}

function roundPlanScore(args: {
  ids: string[];
  partnerPairs: PartnerPair[];
  matches: MatchPlan[];
  playCounts: Map<string, number>;
  restCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
  uncoveredPairs: Set<string>;
  previousResting: Set<string>;
  seed: number;
  roundIndex: number;
}) {
  const playing = args.partnerPairs.flat();
  const playingSet = new Set(playing);
  const resting = args.ids.filter((id) => !playingSet.has(id));
  const minPlayed = Math.min(...Array.from(args.playCounts.values()));
  const minRested = Math.min(...Array.from(args.restCounts.values()));

  const partnerCoverage = args.partnerPairs.reduce(
    (sum, pair) => sum + (args.uncoveredPairs.has(pairKey(pair[0], pair[1])) ? 10000 : -100),
    0
  );
  const playBalance = playing.reduce(
    (sum, id) => sum + (minPlayed + 1 - (args.playCounts.get(id) ?? 0)) * 16,
    0
  );
  const restBalance = resting.reduce((sum, id) => {
    const restCount = args.restCounts.get(id) ?? 0;
    return sum + (restCount === minRested ? 120 : -20) - (args.previousResting.has(id) ? 140 : 0);
  }, 0);
  const opponentNovelty = args.matches.reduce((sum, match) => {
    return (
      sum +
      match.teamA.reduce((teamSum, a) => {
        return (
          teamSum +
          match.teamB.reduce((pairSum, b) => pairSum + 20 / (1 + (args.opponentCounts.get(pairKey(a, b)) ?? 0)), 0)
        );
      }, 0)
    );
  }, 0);
  const stableNoise =
    (hashText(`${playing.join("")}_${resting.join("")}_${args.seed}_${args.roundIndex}`) % 1000) / 1000;

  return partnerCoverage + playBalance + restBalance + opponentNovelty + stableNoise;
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

function calculateLeaderboard(
  players: Player[],
  schedule: Round[],
  pointsPerGame: number,
  activeRound: number
): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();
  players.forEach((player) => {
    rows.set(player.id, {
      id: player.id,
      name: player.name,
      points: 0,
      played: 0,
      wins: 0,
      diff: 0,
      rests: 0,
      average: 0,
    });
  });

  schedule.forEach((round, roundIndex) => {
    if (roundIndex <= activeRound) {
      round.resting.forEach((id) => {
        const row = rows.get(id);
        if (!row) return;
        row.points += REST_BONUS_POINTS;
        row.rests += 1;
      });
    }

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
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.average - a.average || a.name.localeCompare(b.name));
}

function App() {
  const [screen, setScreen] = useState<AppScreen>("setup");
  const [players, setPlayers] = useState<Player[]>(starterPlayers);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [trackingNewPlayerName, setTrackingNewPlayerName] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [addingDuringEvent, setAddingDuringEvent] = useState(false);
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
    () => calculateLeaderboard(players, schedule, pointsPerGame, activeRound),
    [activeRound, players, pointsPerGame, schedule]
  );
  const active = schedule[activeRound];
  const selectedVenue = venues[venueId];
  const maxCourts = Math.min(recommendedCourts(players.length), selectedVenue.courts.length);
  const automaticRoundCount = useMemo(
    () => completeCycleRoundCount(players, courtCount, scheduleSeed),
    [courtCount, players, scheduleSeed]
  );
  const currentRoundComplete = isRoundComplete(active, pointsPerGame);

  function addPlayerByName(nameInput: string) {
    const name = nameInput.trim();
    if (!name) return;
    const nextPlayers = [...players, { id: createId(), name }];
    setPlayers(nextPlayers);
    rebuildScheduleForRosterChange(nextPlayers);
  }

  function addPlayer() {
    addPlayerByName(newPlayerName);
    setNewPlayerName("");
  }

  function addTrackingPlayer() {
    addPlayerByName(trackingNewPlayerName);
    setTrackingNewPlayerName("");
    setAddingDuringEvent(false);
  }

  function removePlayer(id: string) {
    const nextPlayers = players.filter((player) => player.id !== id);
    setPlayers(nextPlayers);
    if (selectedPlayerId === id) {
      setSelectedPlayerId(null);
    }
    rebuildScheduleForRosterChange(nextPlayers);
  }

  function updatePlayerName(id: string, name: string) {
    setPlayers((current) =>
      current.map((player) => (player.id === id ? { ...player, name } : player))
    );
  }

  function rebuildScheduleForRosterChange(nextPlayers: Player[]) {
    const nextMaxCourts = Math.min(recommendedCourts(nextPlayers.length), selectedVenue.courts.length);
    const nextCourtCount = clamp(courtCount, 1, nextMaxCourts);
    const recommendedRoundCount = completeCycleRoundCount(nextPlayers, nextCourtCount, scheduleSeed + 1);

    setCourtCount(nextCourtCount);

    if (!schedule.length || nextPlayers.length < 4) {
      setSchedule([]);
      setActiveRound(0);
      setRoundCount(recommendedRoundCount);
      return;
    }

    const nextSeed = scheduleSeed + 1;
    const preservedRounds = schedule.filter(
      (round, index) =>
        index < activeRound || (index === activeRound && isRoundComplete(round, pointsPerGame))
    );
    const targetRoundCount = Math.max(recommendedRoundCount, preservedRounds.length + 1);
    const replacementRounds = generateSchedule(nextPlayers, nextCourtCount, targetRoundCount, nextSeed);
    const futureRounds = replacementRounds.slice(0, targetRoundCount - preservedRounds.length);
    const rebuiltSchedule = [...preservedRounds, ...futureRounds].map((round, index) => ({
      ...round,
      id: `round_${index + 1}_roster_${nextSeed}`,
      number: index + 1,
      matches: round.matches.map((match) => ({
        ...match,
        id: `r${index + 1}_c${match.court}_${nextSeed}`,
      })),
    }));

    setSchedule(rebuiltSchedule);
    setActiveRound(Math.min(preservedRounds.length, rebuiltSchedule.length - 1));
    setRoundCount(targetRoundCount);
    setScheduleSeed(nextSeed);
  }

  function generateNewSchedule(nextSeed = scheduleSeed) {
    const nextRoundCount = completeCycleRoundCount(players, courtCount, nextSeed);
    const nextSchedule = generateSchedule(players, courtCount, nextRoundCount, nextSeed);
    setSchedule(nextSchedule);
    setActiveRound(0);
    setRoundCount(nextRoundCount);
    setScheduleSeed(nextSeed);
  }

  function startAmericano() {
    generateNewSchedule();
    setSelectedPlayerId(null);
    setAddingDuringEvent(false);
    setScreen("tracking");
  }

  function refreshSchedule() {
    const nextSeed = scheduleSeed + 1;
    generateNewSchedule(nextSeed);
  }

  function applyRecommended() {
    const nextCourts = Math.min(recommendedCourts(players.length), selectedVenue.courts.length);
    setCourtCount(nextCourts);
    setRoundCount(completeCycleRoundCount(players, nextCourts, scheduleSeed));
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
        <div className="brand-lockup">
          <img className="brand-logo" src={LOGO_SRC} alt="Rally" />
          <div>
          <p className="eyebrow">Padel event desk</p>
          <h1>Rally Americano</h1>
          </div>
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
          <span>{automaticRoundCount} rounds</span>
        </div>
      </header>

      {screen === "setup" ? (
        <main className="start-screen">
          <section className="setup-panel start-panel" aria-label="Event setup">
          <img className="start-logo" src={LOGO_SRC} alt="Rally" />
          <div className="section-title">
            <div>
              <p className="eyebrow">Roster first</p>
              <h2>Players</h2>
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
            <div className="auto-rounds-card">
              <span>Rounds</span>
              <strong>{automaticRoundCount}</strong>
            </div>
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

          <div className="roster-heading">
            <span>Participants</span>
            <strong>{players.length}</strong>
          </div>

          <div className="player-list">
            {players.map((player) => (
              <div className="player-row" key={player.id}>
                <input
                  className="player-name-input"
                  aria-label={`Player name for ${player.name || "unnamed player"}`}
                  value={player.name}
                  onChange={(event) => updatePlayerName(player.id, event.target.value)}
                />
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
            <button className="start-button" type="button" disabled={players.length < 4} onClick={startAmericano}>
              <Shuffle size={18} /> Start AMERICANO
            </button>
          </div>
        </section>
        </main>
      ) : (
      <main className="workspace tracking-workspace">
        <section className="participants-panel" aria-label="Participants">
          <div className="section-title">
            <div>
              <p className="eyebrow">Event roster</p>
              <h2>Participants</h2>
            </div>
            <button
              className="primary-icon"
              type="button"
              onClick={() => {
                setAddingDuringEvent((current) => !current);
                setSelectedPlayerId(null);
              }}
              title="Add player"
            >
              <Plus size={18} />
            </button>
          </div>

          {addingDuringEvent ? (
            <div className="inline-editor">
              <input
                type="text"
                value={trackingNewPlayerName}
                onChange={(event) => setTrackingNewPlayerName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addTrackingPlayer();
                }}
                placeholder="Player name"
              />
              <button className="primary-button" type="button" onClick={addTrackingPlayer}>
                Add
              </button>
            </div>
          ) : null}

          <div className="participant-chip-grid">
            {players.map((player) => (
              <button
                key={player.id}
                className={selectedPlayerId === player.id ? "participant-chip active" : "participant-chip"}
                type="button"
                onClick={() => {
                  setSelectedPlayerId((current) => (current === player.id ? null : player.id));
                  setAddingDuringEvent(false);
                }}
              >
                {player.name || "Unnamed"}
              </button>
            ))}
          </div>

          {selectedPlayerId ? (
            <div className="inline-editor">
              <input
                type="text"
                value={players.find((player) => player.id === selectedPlayerId)?.name ?? ""}
                onChange={(event) => updatePlayerName(selectedPlayerId, event.target.value)}
                aria-label="Edit selected player"
              />
              <button className="secondary-button danger-button" type="button" onClick={() => removePlayer(selectedPlayerId)}>
                <Trash2 size={16} /> Delete
              </button>
            </div>
          ) : null}

          <button className="secondary-button full-width-button" type="button" onClick={() => setScreen("setup")}>
            Edit event setup
          </button>
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
                    <div className="match-heading">
                      <span>{getCourtName(venueId, match.court)}</span>
                      <strong>{pointsPerGame} total</strong>
                    </div>
                    <div className="match-board">
                      <TeamStack
                        label="Same side"
                        players={match.teamA.map((id) => getPlayerName(players, id))}
                      />
                      <div className="score-column">
                        <span>Score</span>
                        <div className="scoreline">
                          <input
                            aria-label={`${getCourtName(venueId, match.court)} same side score`}
                            type="number"
                            min={0}
                            max={pointsPerGame}
                            value={match.scoreA ?? ""}
                            onChange={(event) => updateScore(active.id, match.id, "A", event.target.value)}
                            placeholder="0"
                          />
                          <strong>-</strong>
                          <input
                            aria-label={`${getCourtName(venueId, match.court)} other side score`}
                            type="number"
                            min={0}
                            max={pointsPerGame}
                            value={match.scoreB ?? ""}
                            onChange={(event) => updateScore(active.id, match.id, "B", event.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <TeamStack
                        label="Other side"
                        players={match.teamB.map((id) => getPlayerName(players, id))}
                      />
                    </div>
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
                {schedule.slice(0, activeRound + 1).map((round, index) => (
                  <button
                    key={round.id}
                    type="button"
                    className={index === activeRound ? "active" : ""}
                    onClick={() => setActiveRound(index)}
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
                    {row.played} played - {row.rests} rested
                  </span>
                </div>
                <div className="leaderboard-score">
                  <strong>{row.points}</strong>
                  <span>{row.wins} wins</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>
      )}
    </div>
  );
}

function TeamStack(props: {
  label: string;
  players: string[];
}) {
  return (
    <div className="team-stack">
      <span>{props.label}</span>
      {props.players.map((player) => (
        <strong key={player}>{player}</strong>
      ))}
    </div>
  );
}

export default App;
