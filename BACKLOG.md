# Deferred work

The active priority is proving the [V1 journey](PRODUCT.md). An entry here is not
implementation authorization. Reconsider after the pilot or recurring user demand.

| Idea / existing direction | Reason deferred | Reconsider when |
| --- | --- | --- |
| Voice briefing and specialist production tools | Adds interfaces before text-to-publication works | Repeated user need after V1 validation |
| TikTok, Instagram, YouTube, Reddit, Quora, Threads and other channels | X is the sole V1 channel | X journey validated and multiple users request another channel |
| 20+ connectors, agent marketplace | Integration count does not establish user value | A validated task requires a specific connector |
| Video and other media generation | Text posts suffice for the first result | Repeated demand and a separate approved story |
| CRM, broad audience/contact operations, complex organizations | Outside solo-founder distribution | Proven recurring blocker |
| Predictions, advanced attribution and analytics | Requires reliable publications and observations first | Sufficient real usage and trustworthy data |
| Background orchestration, Redis, Celery/Dramatiq | No demonstrated queue requirement for the first bounded fetch | Measured latency/reliability requires durable asynchronous work |
| FastAPI/PostgreSQL rewrite and directory migration | Replaces working persistence/auth/deployment before proving demand | Approved ADR with concrete hosting or product need |
| S3 storage | Bounded text can use existing persistence | A validated asset requirement |
| Paid checkout | Qualified waitlist satisfies V1 | Confirmed willingness to pay and approved billing story |

Bot farms, purchased/automated accounts and fully autonomous publishing are
excluded, not queued for later implementation.
