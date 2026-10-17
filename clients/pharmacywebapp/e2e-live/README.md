# e2e-live — guided walkthroughs

31 flows (`flows/00-…` to `flows/30-…`) that drive the real app the way a pharmacy does — sign-up, settings,
staff, stock, the counter, prescriptions, returns, purchasing, accounting, VAT, payroll, roles — with an English
caption on every step and a video per flow. A failed check is logged as a finding and the flow carries on.

Flow 00 signs up a brand-new pharmacy (`qa-flow-pharmacy-<date>`); every later flow works in it, so run them in
order. The pharmacy is kept afterwards.

## Run

```powershell
# local (web app on :3001 in front of the local API — use a production build: yarn build; yarn start -p 3001)
yarn test:live

# the live site — pick your own passwords: the defaults are in this public repo and the pharmacy is kept
$env:QA_OWNER_PASSWORD = "<owner password>"; $env:QA_STAFF_PASSWORD = "<staff password>"
$env:LIVE_BASE_URL = "https://pharmacare.codehop.codes"; yarn test:live

# part of the run (state is shared through .run/state.json, so start from 00 on a new run)
yarn test:live "flows/0[0-5]-"
yarn test:live "flows/(0[6-9]|10)-"
```

Flow 30 (platform admin) needs the operator sign-in, which is never stored in the repo:

```powershell
$env:ROOT_EMAIL = "admin@root.com"; $env:ROOT_PASSWORD = "<operator password>"; yarn test:live "flows/30-"
```

Without them flow 30 is skipped.

## Output

- `videos/<flow>.webm` — the guided video of each flow
- `.run/findings.json` + `.run/findings/F-xxx.png` — what failed, with the step, video time and a screenshot
- `.run/state.json` — the pharmacy and staff accounts this run created

`LIVE_SLOWMO` (ms, default 350) sets the pace of the videos.
