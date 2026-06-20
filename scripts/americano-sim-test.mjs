const POINTS_PER_GAME = 20;
const REST_BONUS_POINTS = 10;

const baseNames = ["Vira", "Krish", "Arnav", "Arjun", "Kevin", "Leo", "Tiu", "Sam", "Maya", "Noah"];

function makePlayers(count) {
  return baseNames.slice(0, count).map((name, index) => ({
    id: `p${index + 1}`,
    name,
  }));
}

function pairKey(a, b) {
  return [a, b].sort().join("|");
}

function pairsOf(ids) {
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs.push(pairKey(ids[i], ids[j]));
    }
  }
  return pairs;
}

function hashText(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function recommendedCourts(playerCount) {
  return Math.max(1, Math.floor(playerCount / 4));
}

function recommendedRounds(playerCount, courtCount) {
  if (playerCount < 4) return 0;
  const pairTotal = (playerCount * (playerCount - 1)) / 2;
  return clamp(Math.ceil(pairTotal / Math.max(1, courtCount * 2)), 1, 72);
}

function generateCycle(roster, courtCount, roundCount, seed) {
  const ids = roster.map((player) => player.id);
  const courts = clamp(courtCount, 1, recommendedCourts(ids.length));
  const pairSlots = courts * 2;
  const playCounts = new Map();
  const restCounts = new Map();
  const opponentCounts = new Map();
  const uncoveredPairs = new Set(pairsOf(ids));
  let previousResting = new Set();
  const schedule = [];

  ids.forEach((id) => {
    playCounts.set(id, 0);
    restCounts.set(id, 0);
  });

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
      number: roundIndex + 1,
      matches: roundPlan.matches.map((match, index) => ({
        court: index + 1,
        teamA: match.teamA,
        teamB: match.teamB,
      })),
      resting,
    });
  }

  return schedule;
}

function bestRoundPlan(args) {
  const combos = partnerPairCombos(args.ids, Math.min(args.pairSlots, Math.floor(args.ids.length / 2)));
  let best = null;

  combos.forEach((partnerPairs) => {
    matchPairings(partnerPairs).forEach((matches) => {
      const score = roundPlanScore({ ...args, partnerPairs, matches });
      if (!best || score > best.score) best = { partnerPairs, matches, score };
    });
  });

  return best ?? { partnerPairs: [], matches: [] };
}

function partnerPairCombos(ids, targetPairs) {
  const allPairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      allPairs.push([ids[i], ids[j]]);
    }
  }

  const combos = [];

  function walk(start, chosen, used) {
    if (chosen.length === targetPairs) {
      combos.push(chosen.map((pair) => [...pair]));
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

function matchPairings(partnerPairs) {
  if (partnerPairs.length < 2) return [];
  const plans = [];

  function walk(remaining, matches) {
    if (remaining.length === 0) {
      plans.push(matches.map((match) => ({ teamA: [...match.teamA], teamB: [...match.teamB] })));
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

function roundPlanScore(args) {
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

function generateSchedule(roster, courtCount, roundCount, seed) {
  const ids = roster.map((player) => player.id);
  if (ids.length < 4 || roundCount === 0) return [];
  const courts = clamp(courtCount, 1, recommendedCourts(ids.length));
  const baseCycleLength = recommendedRounds(ids.length, courts);
  const baseCycle = generateCycle(roster, courts, baseCycleLength, seed);

  return Array.from({ length: roundCount }, (_, index) => ({
    ...baseCycle[index % baseCycle.length],
    number: index + 1,
  }));
}

function scoreRandomly(schedule) {
  return schedule.map((round, roundIndex) => ({
    ...round,
    matches: round.matches.map((match, matchIndex) => {
      const scoreA = (roundIndex * 7 + matchIndex * 5 + 13) % (POINTS_PER_GAME + 1);
      return {
        ...match,
        scoreA,
        scoreB: POINTS_PER_GAME - scoreA,
      };
    }),
  }));
}

function summarize(players, schedule) {
  const partnerPairs = new Set();
  const restCounts = new Map(players.map((player) => [player.id, 0]));
  const points = new Map(players.map((player) => [player.id, 0]));

  schedule.forEach((round) => {
    round.resting.forEach((id) => {
      restCounts.set(id, (restCounts.get(id) ?? 0) + 1);
      points.set(id, (points.get(id) ?? 0) + REST_BONUS_POINTS);
    });

    round.matches.forEach((match) => {
      partnerPairs.add(pairKey(match.teamA[0], match.teamA[1]));
      partnerPairs.add(pairKey(match.teamB[0], match.teamB[1]));
      match.teamA.forEach((id) => points.set(id, (points.get(id) ?? 0) + match.scoreA));
      match.teamB.forEach((id) => points.set(id, (points.get(id) ?? 0) + match.scoreB));
    });
  });

  const expectedPairs = pairsOf(players.map((player) => player.id));
  const missingPairs = expectedPairs.filter((pair) => !partnerPairs.has(pair));
  const rests = Array.from(restCounts.values());
  const restSpread = Math.max(...rests) - Math.min(...rests);

  return {
    rounds: schedule.length,
    matches: schedule.reduce((sum, round) => sum + round.matches.length, 0),
    partnerPairs: partnerPairs.size,
    expectedPartnerPairs: expectedPairs.length,
    missingPairs,
    restCounts: Object.fromEntries(players.map((player) => [player.name, restCounts.get(player.id)])),
    restSpread,
    points: Object.fromEntries(players.map((player) => [player.name, points.get(player.id)])),
  };
}

function runScenario(playerCount) {
  const players = makePlayers(playerCount);
  const courtCount = 2;
  const roundCount = recommendedRounds(players.length, courtCount);
  const scoredSchedule = scoreRandomly(generateSchedule(players, courtCount, roundCount, 21 + playerCount));
  const result = summarize(players, scoredSchedule);

  if (result.missingPairs.length > 0) {
    throw new Error(`${playerCount} players missing partner pairs: ${result.missingPairs.join(", ")}`);
  }

  if (result.restSpread > 1) {
    throw new Error(`${playerCount} players rest counts are not balanced: spread ${result.restSpread}`);
  }

  return result;
}

const results = {
  "8_players": runScenario(8),
  "9_players": runScenario(9),
  "10_players": runScenario(10),
};

console.log(JSON.stringify(results, null, 2));
