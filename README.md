# VayuShield AI

VayuShield AI is an urban air quality assistant that helps households plan outdoor activities, manage indoor air, and compare lower-emission commute options.

## Features

- **Current air quality.** Search for a city or use your location to view Open-Meteo pollutant readings and India’s CPCB National Air Quality Index (NAQI). An optional OpenAQ integration adds nearby monitoring station details.
- **24-hour forecast.** Compare the lowest and highest two-hour average PM2.5 levels in the upcoming forecast for your city.
- **Choice-Impact Simulator.** Estimate changes in PM2.5 exposure and CO₂ emissions from habits such as indoor filtration and commute swaps.
- **Routine planner.** Generate a daily plan using local air quality, household preferences, and the simulator’s estimates. Built-in planning works without provider credentials.
- **Indoor air playbook.** Search practical tips by keyword, with optional in-browser semantic search.

Forecasts and simulator results are estimates for general information. For health advice, consult a qualified professional.

## Run locally

Use Node.js 22.12 or later in the 22.x series.

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. In this mode, the app can fetch Open-Meteo data directly and use its built-in routine planner. To test both serverless endpoints locally, use the [Vercel developer server](https://vercel.com/docs/cli/dev).

## Deploy

Deploy the repository to Vercel with the [Vite framework preset](https://vercel.com/docs/frameworks/frontend/vite). Vercel serves the frontend alongside the functions in `api/`.

See [`.env.example`](.env.example) for optional provider credentials and configuration. Set credentials in Vercel’s server environment, where the functions can read them. Keep secret values out of Git and unprefixed by `VITE_`.

## Validate changes

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

See the [architecture reference](docs/ARCHITECTURE.md) for the forecasting logic, simulator assumptions, and API contracts.
