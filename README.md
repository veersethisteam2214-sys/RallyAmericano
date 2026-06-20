# Rally Americano

Rally Americano is a small browser app for running Americano-style padel events.
It creates rotating doubles rounds from the current player list, tracks fixed-point
game scores, and shows or hides a live leaderboard.

## Scoring Model

- Each match is played to a fixed total selected before the event, such as 16,
  24, or 32 points.
- The two team scores always add up to the selected match total.
- Every player receives the points earned by their team in that match.
- The leaderboard ranks players by total points, then point difference, then
  average points per match.
- The generator favors fresh partners, fresh opponents, balanced play counts, and
  rotating rest players when the player count is not divisible by four.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Vercel can deploy this as a Vite app with the default build command and output
directory.
