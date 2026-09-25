# EV Monitoring

Set the EV monitoring environment variables on the backend host. The Rivian and Geotab profile directories must be outside this repository and must be writable only by the backend service account.

`EV_MONITORING_ENABLED` controls only the 06:00 scheduled check and its retry window; authenticated EV Monitoring UI routes remain available when it is disabled. `EV_MONITORING_TIMEZONE` controls scheduler and Slack timestamps (default: `Europe/Berlin`). Geotab reuses the current browser-session Authorization header in memory for the active check only; it is never logged or persisted.

```text
EV_MONITORING_ENABLED=true
EV_MONITORING_SOC_THRESHOLD=90
EV_MONITORING_STALE_MINUTES=360
EV_MONITORING_TIMEZONE=Europe/Berlin
EV_MONITORING_SLACK_ENABLED=true
EV_MONITORING_SLACK_WEBHOOK_URL=<configured-secret>
EV_MONITORING_SLACK_CHANNEL_ID=C0C4G14HXSM
EV_MONITORING_RIVIAN_URL=https://business.rivian.com/vehicles/tracker
EV_MONITORING_RIVIAN_API_URL=https://business.rivian.com/api
EV_MONITORING_RIVIAN_ASSET_GROUP=a1a26006-3a1d-41dc-8c16-19b40978ee0d
EV_MONITORING_RIVIAN_PROFILE_DIR=/var/lib/lightcore/ev-monitoring/rivian-profile
EV_MONITORING_GEOTAB_URL=https://my.geotab.com/amazon_de_alui/
EV_MONITORING_GEOTAB_API_URL=https://my.geotab.com/apiv1
EV_MONITORING_GEOTAB_DATABASE=amazon_de_alui
EV_MONITORING_GEOTAB_PROFILE_DIR=/var/lib/lightcore/ev-monitoring/geotab-profile
```

Before deployment can query either provider, perform a one-time interactive login on the same machine that owns each profile:

```text
node scripts/ev-monitoring-login.js rivian
node scripts/ev-monitoring-login.js geotab
```

The script opens a headed browser and does not accept, store, or log passwords. Close its browser after reaching the authenticated provider page. Provider cookies, browser profiles, OAuth values, and the Slack webhook must never be committed.
