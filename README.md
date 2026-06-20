# Rally Americano

Rally Americano is a small browser app for running Americano-style padel events.
It creates rotating doubles rounds from the current player list, tracks fixed-point
game scores, and shows or hides a live leaderboard.

## Scoring Model

- Each match is played to a fixed total selected before the event. The default
  is 20 points.
- The two team scores always add up to the selected match total.
- Every player receives the points earned by their team in that match.
- The leaderboard ranks players by total points, then wins, then average points
  per played match.
- Resting players automatically receive 10 points for the round.
- The generator favors fresh partners, fresh opponents, balanced play counts, and
  rotating rest players when the player count is not divisible by four.
- After a full partner cycle is generated, extra rounds repeat from the first
  round's matchups.
- Venue selection controls court labels. Bangkok Paddle uses Obanji and Pecunia;
  Sterling Sporting Center uses Court 1 and Court 2.
- Player names can be edited during an event without changing match history.
  Emergency add/remove actions preserve completed rounds and rebuild the active
  and upcoming schedule for the new roster.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Simulation Check

```bash
npm run test:sim
```

The simulation fills a full event with deterministic random scores, then checks
that all partner pairs appear and rest counts stay balanced.

Vercel can deploy this as a Vite app with the default build command and output
directory.
