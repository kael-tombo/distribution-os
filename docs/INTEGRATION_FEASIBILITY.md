# Integration portfolio and qualification workflow

Research date: 2026-09-07. Companion to [Platform Vision and Workflow](PLATFORM_VISION_AND_WORKFLOW.md).

These **31 named tools** form a proposed portfolio. Documentation access does not prove our app's entitlement, a customer's plan, approval of our use case, or a working integration. Current code implements only the narrow Resend execution and Stripe intake boundaries described in [Current State](CURRENT_STATE.md). No provider was connected, purchased or invoked for production during this planning work.

## How to read the portfolio

**MCP documented** means official provider documentation describes an MCP surface; tool coverage still needs account testing. **API documented** means a supported API entry point was found; Distribution OS can implement a scoped adapter and expose its allowed operations to agents. **Validation pending** means endpoint capabilities or access were not sufficiently established in this review. No row asserts that all provider features are available through MCP.

Qualification is per account, capability and route. A single scheduler can cover several channel destinations; it is one integrated tool, not several independently implemented native adapters. Report tool integrations, social destinations and tested capabilities separately. Campaigns use a subset; customers do not need accounts with all 31 providers.

## 31-tool target portfolio

The job column is the desired product use. The evidence/access column distinguishes documented availability from proposed scope.

| # | Tool | Job in Distribution OS | Evidence, route and qualification gate |
| --- | --- | --- | --- |
| 1 | TikTok | Distribute approved channel-specific video/photo material | API documented. Audit, creator scopes, consent UX, privacy and intended-use restrictions apply; qualify direct access or an authorized intermediary. [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines) |
| 2 | YouTube | Upload approved walkthroughs/videos and track publication | API documented. OAuth, quota and audit eligibility; uploads from applicable unverified projects are restricted to private viewing. Analytics is a separate capability. [Videos API](https://developers.google.com/youtube/v3/docs/videos/insert) |
| 3 | Instagram | Publish approved visual material and collect permitted account results | Meta's official collection documents professional-account publishing. Qualify chosen login flow, formats and permissions; personal-account and inbox capabilities must not be assumed. Meta's main docs were not fetchable in this review. [Meta-maintained API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) |
| 4 | LinkedIn | Professional distribution and company-page measurement | API documented. Community Management access and account roles matter; member and organization permissions are distinct. Qualify exact approved use cases. [Community Management](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-04) |
| 5 | X | Approved posts and permitted response/metric collection | API documented. Authenticate the posting account and budget for metered access; validate media and reads separately. No unbounded listening by default. [Post creation](https://docs.x.com/x-api/posts/create-post), [pricing model](https://docs.x.com/x-api/getting-started/pricing) |
| 6 | Reddit | Approved community research, human-led participation and permitted posting | Access-gated. Reddit requires explicit approval for API access and written approval for commercial use. Research and publishing each need eligibility review; no scraping substitute. [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) |
| 7 | Facebook Pages | Distribution to an owned business Page | Validation pending for exact Graph API scopes, review requirements and formats. Candidate intermediary route must be verified per Page; no personal-profile automation claim. [Developer entry point](https://developers.facebook.com/docs/pages-api/) |
| 8 | Threads | Approved conversational posts | Validation pending: official API page was rate-limited during research. Confirm account authorization, publishing, insights and intermediary support before implementation. [Official API entry point](https://developers.facebook.com/docs/threads/) |
| 9 | Pinterest | Visual discovery through approved Pins and owned destinations | API documentation entry found, detailed capability verification pending. Qualify app access, media operations and business-account requirements. [API documentation](https://developers.pinterest.com/docs/api/v5/introduction/) |
| 10 | Mastodon | Instance-aware publishing and permitted engagement data | API documented. Register/authenticate against the chosen instance; support its version, policies and limits. [Client API guide](https://docs.joinmastodon.org/client/intro/) |
| 11 | Buffer | Intermediary publishing route for a selected set of channels | API and agent integrations documented. Qualify account authorization, media formats, schedules, status, cancellation and returned channel IDs; avoid assuming native/API feature parity. [Developer documentation](https://developers.buffer.com/) |
| 12 | Metricool | Publishing coordination and channel-performance collection | MCP and API documented. API access currently requires Advanced/Custom; MCP access has a different plan model. Test exact tools and service-to-service suitability rather than assuming desktop-client setup is enough. [Access comparison](https://help.metricool.com/mcp-vs-api-access-what-is-the-difference-5y3ib), [plan gates](https://help.metricool.com/plans-add-ons-and-api-access-explained-xux1u) |
| 13 | Jasper | External production of posts, captions, scripts and marketing text | MCP and API documented. Native MCP exposes brand context and generation tools; API access is documented for Business customers. Confirm requested formats, outputs and contracted access. [MCP tools](https://developers.jasper.ai/docs/jasper-mcp-server), [API getting started](https://developers.jasper.ai/docs/getting-started-1) |
| 14 | Canva | External design/template work and export handoff | Connect API documented. Autofill has Enterprise eligibility requirements; do not make it a mandatory low-cost baseline. Design/export and automated templating must be qualified separately. [Connect API](https://www.canva.dev/docs/connect/), [Autofill requirements](https://www.canva.dev/docs/connect/api-reference/autofills/) |
| 15 | Adobe Firefly Services | External image generation and approved creative transformations | API documented. Server credentials and service entitlement needed. Treat this as Firefly Services integration, not a claim that every Adobe Express editor feature is remotely callable. [Authentication](https://developer.adobe.com/firefly-services/docs/firefly-api/getting-started/), [async jobs](https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/using-async-apis) |
| 16 | Runway | External image/video production from a structured brief | API documented. Qualify task submission/status, billing, output retention and permitted inputs; async rendering is managed by the provider. [API documentation](https://docs.dev.runwayml.com/) |
| 17 | HeyGen | External presenter/explainer video production | API documented. Qualify production operations, account credits, consent for likeness/voice, callbacks and export access for the selected workflow. [Developer documentation](https://developers.heygen.com/) |
| 18 | ElevenLabs | External narration/dubbing for campaign assets | API documented. Qualify the chosen audio operation, rights, language quality and cost. Campaign narration is separate from the OS's interactive voice interface. [Documentation](https://elevenlabs.io/docs/overview/intro) |
| 19 | WordPress | Publish specialist-produced articles to an owned site | REST API documented. Qualify site authentication, roles, plugins, draft/review/publish transitions and media behavior. [REST API handbook](https://developer.wordpress.org/rest-api/) |
| 20 | Webflow | Coordinate specialist-produced CMS content on an owned site | Developer API documented. Qualify CMS schema, scopes and publishing behavior; creating a CMS item is not proof of live publication. [Developer platform](https://developers.webflow.com/) |
| 21 | Google Analytics | Read configured website/campaign performance | Data API and official MCP documented. Start read-only; qualify property access, metric definitions and reporting limitations. Neither interface fixes missing instrumentation. [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1), [official MCP](https://developers.google.com/analytics/devguides/MCP) |
| 22 | Search Console | Read organic-search evidence for owned properties | API documented. Verified property access and report availability required; search performance informs longer campaign windows. [API overview](https://developers.google.com/webmaster-tools) |
| 23 | PostHog | Read product activation/conversion evidence | API documented. Qualify project permissions, event definitions, regional endpoint and data minimization. Never infer event quality from a connected status. [API overview](https://posthog.com/docs/api) |
| 24 | HubSpot | Connect qualified demand to CRM pipeline | Developer API documented. Start with required CRM reads and explicit identifier mapping; writes, associations and marketing capabilities get separate conformance tests. [Developer platform](https://developers.hubspot.com/) |
| 25 | Mailchimp | Delegate opted-in email campaign delivery | Marketing API documented. Qualify audience access, suppression handling, campaign preparation, approval and reporting. [Marketing API](https://mailchimp.com/developer/marketing/) |
| 26 | Brevo | Delegate lifecycle/email campaigns and collect results | API documented. Qualify selected campaign/contact operations, scopes, suppression, reporting and spending limits. [API overview](https://developers.brevo.com/docs/getting-started) |
| 27 | Resend | Existing governed email boundary and transactional delivery evidence | API documented; narrow sandbox adapter exists locally. This does not imply broad email-marketing capabilities are implemented. [API reference](https://resend.com/docs/api-reference/introduction) |
| 28 | Stripe | Existing payment evidence and future commercial-event linkage | Webhook API documented; selected signed event intake exists locally. Qualify account binding, live/test separation, customer linkage and refunds before broader revenue claims. [Webhooks](https://docs.stripe.com/webhooks) |
| 29 | Google Drive | Read authorized brand/source material and hand off assets | API documented. Use minimal file permissions and specific assets; inspect file provenance and export availability. [Drive API](https://developers.google.com/workspace/drive/api/guides/about-sdk) |
| 30 | Notion | Source business knowledge and optionally export campaign briefs | API documented. Explicit page/database access and reviewed writes; customer planning content remains scoped to its workspace. [Developer overview](https://developers.notion.com/guides/get-started/overview) |
| 31 | n8n | Optional bridge to an existing customer workflow | MCP documented. Expose only reviewed workflows with known side effects and bounded inputs. The bridge does not replace OS approval, audit or job ownership. [MCP access](https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server) |

Bluesky, Discord, Telegram, Slack, additional CRMs, ad platforms and more creative tools can enter the portfolio when a user workflow justifies them. CapCut, Descript or a familiar editor should be used as a human handoff until a suitable approved automation interface is actually verified. A consumer subscription does not establish API access. These unqualified candidates do not count toward the 31-tool portfolio above or the 20+ verified-integration release gate.

## Choose the first providers through a short qualification exercise

1. Select the pilot customer segment and two distribution channels from real account/audience evidence. Start applications for restricted channels early, independently of feature coding.
2. Compare Buffer and Metricool for those exact accounts and formats. Test one production-safe path for account lookup, draft/schedule, status, cancel and publication-result lookup. Select one writer route per account/capability. Validate whether the service permits the intended multi-tenant product integration and credential model.
3. Qualify Jasper or another contracted external text specialist. If access is unavailable, assign a human creative task or qualify another provider; do not quietly generate the final text inside Distribution OS.
4. Qualify one visual/video provider based on the pilot's deliverables, quality rubric and budget. A video-heavy pilot may need Runway or HeyGen; a templated-brand workflow may suit Canva if entitlement fits. This is a test decision, not a blanket purchase recommendation.
5. Connect one source repository and one meaningful measurement source; reuse Stripe only when payment is relevant to the objective. Do not make every customer configure every category to get started.

## Connector qualification lifecycle

`catalogued → docs_reviewed → access_requested → sandbox_verified → limited_pilot → production_verified`

Operational states are tracked separately per capability: `healthy`, `degraded`, `requires_reconnection`, `rate_limited`, `blocked`, `revoked`, `deprecated`. A prior production verification does not guarantee current health.

Before `production_verified`, demonstrate:

- Authorized installation bound to the correct tenant and exact provider account, plus disconnect/reconnect and credential rotation.
- Supported inputs and output schema, media formats, scheduling semantics and timezones; no unsupported features hidden behind a generic “publish” tool.
- Exact approval and spend checks through direct API and MCP paths alike.
- A real successful operation with receipt and the advertised evidence level; an idempotent/reconciled replay and a representative failure.
- Token expiry, missing scopes, throttling, partial completion, changed output URLs, duplicate/out-of-order callbacks and unknown submission outcomes.
- Account-safe quota/cost limits, retention behavior, support owner, monitoring and a kill switch.
- Clear limitations for inaccessible metrics, manual posting requirements, provider processing delays and weak publication evidence.

For read-only capabilities, the success proof is a correctly scoped source response with timestamps and data definitions. For production, it is a real returned creative artifact with provider provenance. For publishing, it is the stated publication receipt/identifier and verified status. For outcomes, it is the appropriately sourced metric or business event. These proofs must not be substituted for one another.

## Specific access risks to resolve before promising coverage

TikTok imposes posting UX and intended-use constraints in addition to audit status. YouTube's unverified-project restrictions affect public uploads. Reddit approval is a hard dependency for its proposed API use. LinkedIn distinguishes product access and account permissions. Instagram login routes and formats require specific qualification. X has metered usage that needs an explicit read/write budget. These are provider constraints, not problems solved by adding an MCP server.

Jasper API and Canva Autofill can require plans that materially change product economics. Metricool distinguishes API access from MCP access. Any intermediary may expose fewer features than its own UI or an underlying native platform. No exact subscription prices, rate limits or review timelines are guaranteed here; confirm these in the relevant account and contract when selecting the pilot route.

## Research limits

This review used official provider documentation and Meta's own indexed Postman collection. No live customer-account entitlement or integration contract was tested. Facebook Pages and Threads details remain pending because their official pages were not successfully inspected; Pinterest's documentation shell did not expose endpoint detail. Treat those rows as discovery work, not verified capabilities. Revalidate all selected provider docs, plans, security requirements and API versions before implementation and again before production rollout.
