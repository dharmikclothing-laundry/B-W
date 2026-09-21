# Observability

Recommended production stack:
- Error monitoring: Sentry
- Metrics: OpenTelemetry + Prometheus
- Dashboards: Grafana
- Structured logs: JSON to centralized log storage

Do not log OTPs, payment signatures, access tokens, raw card/payment details, or precise customer data unless strictly required.
