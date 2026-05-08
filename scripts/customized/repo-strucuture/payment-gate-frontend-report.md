# Payment Gate Frontend Report

Reviewed on 2026-05-07. Scope is the current repository state, with emphasis on frontend behavior. The backend in this tree does not implement a payment processor, checkout flow, billing controller, or usage controller; it only exposes some generic HTTP error codes and unrelated legacy row-credit checks. The frontend nevertheless already assumes billing and usage APIs exist through `@teable/openapi`.

## Executive Summary

The current "payment gate" is a frontend plan/usage gate, not a payment gateway integration. There is no Stripe, checkout, invoice, or customer portal flow in the current application source.

The design is built around:

- edition detection from `EnvContext` (`CLOUD`, `EE`, or Community);
- subscription and usage contracts from `packages/openapi`;
- React Query fetches for subscription summaries and usage limits;
- a shared `UpgradeWrapper` that compares the current billing level against a target level and intercepts clicks;
- a global Zustand modal store that opens an upgrade/user-limit modal when the frontend receives HTTP `402` or `460`;
- feature-specific gates that hide, disable, or replace premium features with upgrade prompts.

The gate is not a security boundary. It only changes client behavior. If backend billing enforcement is not implemented, users could still reach APIs directly or hit incomplete routes depending on which UI path is used.

## Billing And Usage Contracts

The frontend imports all billing concepts from `@teable/openapi`.

Primary subscription contract:

- `packages/openapi/src/billing/subscription/get-subscription-summary.ts`
- `GET /space/{spaceId}/billing/subscription/summary`
- returns `{ spaceId, status, level, appSumoTier? }`
- levels: `free`, `pro`, `business`, `enterprise`
- statuses: `active`, `canceled`, `incomplete`, `incomplete_expired`, `trialing`, `past_due`, `unpaid`, `paused`, `seat_limit_exceeded`

Subscription list contract:

- `packages/openapi/src/billing/subscription/get-subscription-summary-list.ts`
- `GET /billing/subscription/summary`
- used to show billing badges across spaces.

Usage contracts:

- `packages/openapi/src/usage/get-space-usage.ts`
- `packages/openapi/src/usage/get-base-usage.ts`
- `packages/openapi/src/usage/get-instance-usage.ts`
- endpoints:
  - `GET /space/{spaceId}/usage`
  - `GET /base/{baseId}/usage`
  - `GET /instance/usage`

The usage response includes a `level`, optional `appSumoTier`, and a `limit` object. The frontend currently knows these limits:

- numeric limits: rows, attachment size, automation runs, database connections, revision history days, automation history days, API rate limit, automation send email count;
- boolean feature flags: automation, audit log, admin panel, row coloring, button field, field AI, user group, advanced extensions, advanced permissions, password-restricted shares, authentication, domain verification, organization, chat AI, app, custom domain.

## Current Backend Status

In the current NestJS backend tree, there is no feature module or controller implementing the billing or usage endpoints above. A search under `apps/nestjs-backend/src` found no billing, subscription, or usage route implementation for:

- `/space/{spaceId}/billing/subscription/summary`
- `/billing/subscription/summary`
- `/space/{spaceId}/usage`
- `/base/{baseId}/usage`
- `/instance/usage`

The shared error layer does define billing-like status codes:

- `packages/core/src/errors/http/http-response.types.ts` defines `PAYMENT_REQUIRED`, `CREDIT_LIMIT_EXCEEDED`, and `USER_LIMIT_EXCEEDED`.
- `packages/core/src/errors/http/constant.ts` maps `PAYMENT_REQUIRED` and `CREDIT_LIMIT_EXCEEDED` to HTTP `402`, and `USER_LIMIT_EXCEEDED` to HTTP `460`.
- `apps/nestjs-backend/src/custom.exception.ts` maps `HttpStatus.PAYMENT_REQUIRED` back to `payment_required`.

There is one legacy row-credit check in `apps/nestjs-backend/src/features/record/record.service.ts`, but it throws a validation error when row count exceeds `maxFreeRowLimit`; it is not part of the frontend subscription gate design.

The Prisma schema in `packages/db-main-prisma/prisma/postgres/schema.prisma` does not include current subscription/customer/license tables. It only has `space.credit` and unrelated `comment_subscription`; subscription-like tables appear in `scripts/customized/backup/teable_backup.sql`, not in the active source schema.

## Edition Detection

The frontend decides which billing behavior applies through:

- `apps/nextjs-app/src/features/app/hooks/useIsCloud.ts`
- `apps/nextjs-app/src/features/app/hooks/useIsEE.ts`
- `apps/nextjs-app/src/features/app/hooks/useIsCommunity.ts`
- `apps/nextjs-app/src/features/app/hooks/useEnv.ts`
- `apps/nextjs-app/src/lib/server-env.ts`

Expected behavior:

- Cloud: use space subscriptions and upgrade flows.
- EE: use instance/base usage and enterprise license status.
- Community: hide or suppress premium flows, except preview mode.
- Read-only template/share preview: bypass upgrade prompts so previews can display feature surfaces.

Important implementation gap: `IServerEnv` contains `edition`, and the hooks read `env.edition`, but `apps/nextjs-app/src/lib/withEnv.ts` currently does not populate `edition` from `NEXT_BUILD_ENV_EDITION`. SSR code directly checks `process.env.NEXT_BUILD_ENV_EDITION` in some pages, but client hooks depend on `EnvContext`. Unless another runtime injection exists outside this tree, client-side `useIsCloud()` and `useIsEE()` will evaluate false.

## Current Billing Level Resolution

The shared hook is:

- `apps/nextjs-app/src/features/app/hooks/useBillingLevel.ts`

It resolves the current level in this priority order:

1. `subscriptionSummary?.level` from `GET /space/{spaceId}/billing/subscription/summary` when Cloud.
2. `baseUsage?.level` from `GET /base/{baseId}/usage`.
3. `instanceUsage?.level` from `GET /instance/usage` when EE.

Base usage is fetched by:

- `apps/nextjs-app/src/features/app/hooks/useBaseUsage.ts`

`useBaseUsage` is enabled only when Cloud or EE and not in read-only preview. It fetches `GET /base/{baseId}/usage`.

Subscription summaries are prefetched server-side only in Cloud:

- `apps/nextjs-app/src/pages/space/[spaceId].tsx`
- `apps/nextjs-app/src/pages/space/index.tsx`

The SSR API wrapper provides methods for subscription summaries and instance usage in:

- `apps/nextjs-app/src/backend/api/rest/ssr-api.ts`

## Core Gate: UpgradeWrapper

The main reusable gate is:

- `apps/nextjs-app/src/features/app/components/billing/UpgradeWrapper.tsx`

It assigns billing-level weights:

- Free = 1
- Pro = 2
- Business = 3
- Enterprise = 4

`needsUpgrade` is true only when:

- not read-only preview;
- a current level exists;
- current level is lower than target level;
- target level exists;
- not Community.

When a user clicks a gated child, `UpgradeWrapper` intercepts the click during capture phase, prevents the original action, and runs the upgrade handler.

Upgrade handler behavior:

- If `onUpgradeClick` is provided, call it.
- If the space has an AppSumo tier, open `https://appsumo.com/account/products/`.
- In Cloud:
  - require a `spaceId`;
  - require the user to be a space owner;
  - open the global usage-limit modal as `UsageLimitModalType.Upgrade`.
- Outside Cloud, open `https://teable.ai/pricing`.

EE-specific behavior:

- Target `Pro` is upgraded to `Business` because EE starts from Business-level semantics.

AppSumo behavior:

- AppSumo tier display replaces plan display.
- Target Business maps to Tier 3.
- Target Pro maps to Tier 1.

Implementation details to note:

- The `baseId` prop exists in the interface, but the component currently derives `baseId` only from `useBase()` and does not destructure the passed `baseId`.
- Non-render-prop children are hidden entirely in Community mode.
- Render-prop children are still rendered in Community mode unless the caller uses the provided `isCommunity` flag.

## Global Modal And Error Handling

The shared modal state is in:

- `packages/sdk/src/components/billing/store/usage-limit-modal.ts`

Modal types:

- `upgrade`
- `user`
- `credit_insufficient`

The only rendered modal is:

- `apps/nextjs-app/src/features/app/components/billing/UsageLimitModal.tsx`

It is mounted only by:

- `apps/nextjs-app/src/features/app/layouts/BaseLayout.tsx`

Behavior:

- `upgrade` shows the over-limit copy and routes to `/space/[spaceId]/setting/plan`.
- `user` shows the user-limit copy and routes to `/admin/user`.
- `credit_insufficient` exists in the store but currently renders like the non-upgrade/user path because `UsageLimitModal` only distinguishes `Upgrade` from everything else.

HTTP error integration:

- `packages/sdk/src/context/app/queryClient.tsx`
- HTTP `402` opens the upgrade modal.
- HTTP `460` opens the user-limit modal.
- Query and mutation errors use this shared handler unless `preventGlobalError` is set.

Attachment-specific handling:

- `packages/sdk/src/components/editor/attachment/upload-attachment/hooks/useLocalAttachmentUpload.ts`
- `apps/nextjs-app/src/features/app/components/upload-progress-panel/TaskItem.tsx`
- upload errors with code `402` also open the upgrade modal.

SSR behavior:

- `apps/nextjs-app/src/lib/withAuthSSR.ts` catches HTTP `402` and `403`, sets the response status, and passes `httpError`.
- `apps/nextjs-app/src/pages/_app.tsx` renders `HttpErrorPage` for SSR `402` and `403`.

Important route gap: `/space/[spaceId]/setting/plan` is referenced by `UsageLimitModal`, `LevelWithUpgrade`, and `SpaceSubscriptionModal`, but there is no matching Next.js page in `apps/nextjs-app/src/pages/space/[spaceId]/setting`. The CE tree has a `SpaceSettingTab.Plan` enum value and a setting-modal extension point, but no Plan tab content unless an override/EE layer supplies `extraSpaceTabs`.

## Space Subscription UI

Plan/status badges:

- `apps/nextjs-app/src/features/app/components/billing/Level.tsx`
- `apps/nextjs-app/src/features/app/components/billing/Status.tsx`
- `apps/nextjs-app/src/features/app/components/billing/LevelWithUpgrade.tsx`

Where shown:

- `apps/nextjs-app/src/features/app/blocks/space/SpaceInnerPage.tsx`
- `apps/nextjs-app/src/features/app/blocks/space/SpacePage.tsx`
- `apps/nextjs-app/src/features/app/blocks/space/SpaceCard.tsx`

`LevelWithUpgrade` shows:

- plan or AppSumo tier badge;
- non-active subscription status badge;
- organization name when active;
- an upgrade button for Cloud owners when not Enterprise and not AppSumo.

Space-level upgrade selection:

- `apps/nextjs-app/src/features/app/blocks/billing/useSpaceSubscriptionStore.ts`
- `apps/nextjs-app/src/features/app/blocks/billing/useSpaceSubscriptionMonitor.ts`
- `apps/nextjs-app/src/features/app/blocks/billing/SpaceSubscriptionModal.tsx`

This flow is used when a user lands with `subscribeLevel` in the URL. It lets the user pick a space where they have update/owner-like permission, then routes to the plan setting path.

## Feature Gate Inventory

### Authority Matrix

Navigation gate:

- `apps/nextjs-app/src/features/app/blocks/base/base-side-bar/BasePageRouter.tsx`
- target level: Business.
- route is wrapped by `UpgradeWrapper`.
- fallback page: `apps/nextjs-app/src/features/app/blocks/AuthorityMatrix.tsx` shows an Enterprise feature alert and pricing link.

### App Page

Fallback page:

- `apps/nextjs-app/src/features/app/blocks/App.tsx`
- shows an Enterprise feature alert and pricing link.

### Automation

Fallback page:

- `apps/nextjs-app/src/features/app/automation/Pages.tsx`
- shows an Enterprise feature alert and pricing link.
- read-only preview skips the upgrade prompt and shows a neutral automation placeholder.

Creation in the base tree:

- `apps/nextjs-app/src/features/app/blocks/base/base-side-bar/BaseNodeTree.tsx`
- workflows can be created only when not Community and the user has `automation|create`.
- apps can be created only when not Community, AI chat is enabled, and the user has `app|create`.

The usage contract has `automationEnable`, `appEnable`, `chatAIEnable`, and automation numeric limits, but the current creation gate mostly uses edition, permissions, and AI-disable state rather than directly checking all usage flags.

### Field AI

Configuration gate:

- `apps/nextjs-app/src/features/app/components/field-setting/field-ai-config/FieldAiConfig.tsx`
- uses `usage.limit.fieldAIEnable` and `useDisableAIAction().aiField`.
- when unsupported by plan, the header is wrapped in `UpgradeWrapper` targeting Pro.

Grid behavior:

- `apps/nextjs-app/src/features/app/blocks/view/grid/GridViewBaseInner.tsx`
- passes `aiEnable` into header menus only when `fieldAIEnable` is true.
- renders `AiGenerateButton` only when `fieldAIEnable` is true.

### AI Chat

Record menu:

- `apps/nextjs-app/src/features/app/blocks/view/grid/components/RecordMenu.tsx`
- "Add to Chat" is hidden unless AI is configured and `usage.limit.chatAIEnable` is true.

AI disable actions:

- `apps/nextjs-app/src/features/app/hooks/useDisableAIAction.ts`
- backend-provided disabled actions can turn off AI field or AI chat UI independently of billing.

### Button Field

Field type selection:

- `apps/nextjs-app/src/features/app/components/field-setting/SelectFieldType.tsx`
- button field is disabled when `usage.limit.buttonFieldEnable` is false.

Button workflow options:

- `apps/nextjs-app/src/features/app/components/field-setting/options/ButtonOptions.tsx`
- custom automation action is disabled and wrapped in a tooltip when `buttonFieldEnable` is false.

### Database Connection

Panel:

- `apps/nextjs-app/src/features/app/blocks/db-connection/Panel.tsx`
- `apps/nextjs-app/src/features/app/blocks/db-connection/hooks/useDbConnection.ts`

In Cloud, database connection is unavailable unless `usage.level === enterprise`. The query is disabled when unavailable. If connection data already exists, the panel still shows it with a warning. Community treats the max connection count as unlimited.

### Attachments And Upload Limits

Local attachment upload and global upload panel watch for code `402` and open the upgrade modal:

- `packages/sdk/src/components/editor/attachment/upload-attachment/hooks/useLocalAttachmentUpload.ts`
- `apps/nextjs-app/src/features/app/components/upload-progress-panel/TaskItem.tsx`

The frontend does not calculate attachment limits locally here; it reacts to backend/upload-manager error codes.

### Space Deletion

`apps/nextjs-app/src/features/app/components/space/DeleteSpaceConfirm.tsx` fetches `GET /space/{spaceId}/usage` in Cloud when the delete dialog opens. It blocks deletion when the level is neither Free nor Enterprise. That means Pro and Business Cloud spaces cannot be deleted through this dialog until their billing state changes.

### Enterprise License Status

`apps/nextjs-app/src/features/app/components/LicenseExpiryBanner.tsx` runs only in EE for admin users. It calls:

- `GET /admin/enterprise-license/status`

If `expiredTime` is present, it shows a persistent warning toast with a link to `/admin/license`.

## Upgrade Entry Points

Current upgrade routes and links:

- `UpgradeWrapper` in Cloud opens `UsageLimitModal`.
- `UsageLimitModal` routes to `/space/[spaceId]/setting/plan`.
- `LevelWithUpgrade` routes to `/space/[spaceId]/setting/plan` unless an override callback is provided.
- `SpaceInnerPage` overrides upgrade click to open `SpaceInnerSettingModal` with `defaultTab={SettingTab.Plan}`.
- CE fallback pages link to `https://app.teable.ai/setting/license-plan`.
- non-Cloud `UpgradeWrapper` opens `https://teable.ai/pricing`.
- AppSumo users are sent to `https://appsumo.com/account/products/`.

## Design Gaps And Risks

1. Backend enforcement is absent in this tree.
   The frontend assumes billing and usage APIs exist, but the current NestJS app does not implement them. Until backend enforcement exists, the frontend gate is advisory only.

2. Client edition detection may not work as intended.
   `useIsCloud()` and `useIsEE()` depend on `env.edition`, but `withEnv.ts` does not populate it. Several gates may fall back to Community behavior on the client.

3. The plan settings route is referenced but missing.
   `/space/[spaceId]/setting/plan` is pushed from multiple components, but no page exists in the CE tree. The setting modal has a `Plan` enum value but no Plan tab unless provided by an override.

4. `CreditInsufficient` is not wired to distinct UI.
   The modal store defines it, but `UsageLimitModal` only distinguishes Upgrade vs non-Upgrade.

5. `UpgradeWrapper` has inconsistent Community semantics.
   Non-render-prop children are hidden in Community; render-prop children still render unless the caller manually uses `isCommunity`.

6. Feature flags are not applied uniformly.
   Some features use `UpgradeWrapper` and level comparison; others directly check usage flags; others use permissions, edition, or fallback pages. This makes it harder to reason about what is gated by plan vs permission vs edition.

7. Some gates are visibility-only.
   Several controls are hidden or disabled, but direct route/API access still depends on backend implementation.

## Backend Design Implications

When backend billing is added, the frontend already expects these minimum surfaces:

- subscription summary per space and across spaces;
- usage by space, base, and instance;
- consistent `402` for plan/credit limits;
- consistent `460` for user/license seat limits;
- a plan/settings surface behind `/space/[spaceId]/setting/plan` or a replacement of those navigation targets;
- usage limit flags matching `UsageFeatureLimit` names exactly;
- AppSumo tier support if Cloud subscriptions need to keep current UI behavior;
- EE license status for admin warning banners.

The backend should treat all frontend gates as hints and enforce every premium operation server-side: field AI, button field automation, database connections, authority matrix, automation, apps, attachment limits, row/usage limits, user/seat limits, and paid-space deletion rules.
