# Render Deploy

This file explains how to deploy the main `wine-advisor` app to Render.

## Render blueprint path

Use this path in Render:

```text
wine-advisor/render.yaml
```

## What this deploys

It creates one Node web service for the main Next.js app:

- service name: `wine-advisor-app`
- root directory: `wine-advisor`
- build command: `npm install && npm run build`
- start command: `npm run start`

## Required environment variable

- `OPENAI_API_KEY`

If you do not set `OPENAI_API_KEY`, the app may fall back to mock behavior in some flows, which is not suitable for real production use.

## Recommended Render steps

1. Open Render.
2. Create a new `Blueprint`.
3. Select the GitHub repo `xuchenLI/Aibot`.
4. Set:

```text
Branch: master
Blueprint Path: wine-advisor/render.yaml
Blueprint Name: wine-advisor-app
```

5. In environment variables, set:

```text
OPENAI_API_KEY=your_real_openai_key
```

6. Deploy.

## After deploy

When Render finishes, open the app URL it gives you.

That URL is the value you will later put into the WeChat standalone service as:

```text
WINE_ADVISOR_UPSTREAM_URL=https://your-main-app-url.onrender.com
```
