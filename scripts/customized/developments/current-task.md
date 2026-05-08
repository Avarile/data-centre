I scanned apps/nextjs-app/src, plugins/src, plus shared frontend-facing packages/sdk/src and packages/openapi/src. I found no Stripe, checkout, invoice,
payment-method, or customer-portal frontend code. The current payment surface is plan/subscription UI plus client-side feature gates. plugins/src had no
payment/billing hits.

Core Billing

- apps/nextjs-app/src/features/app/components/billing/UpgradeWrapper.tsx:51: main reusable gate. Compares Free/Pro/Business/Enterprise, handles AppSumo,
  owner checks, upgrade modal, external pricing link.
- apps/nextjs-app/src/features/app/components/billing/UsageLimitModal.tsx:16: global over-limit/user-limit modal. Upgrade routes to /space/[spaceId]/
  setting/plan.
- packages/sdk/src/components/billing/store/usage-limit-modal.ts:3: Zustand store with upgrade, user, credit_insufficient.
- packages/sdk/src/context/app/queryClient.tsx:78: global HTTP handling: 402 opens upgrade modal, 460 opens user-limit modal.
- apps/nextjs-app/src/features/app/components/billing/Level.tsx, apps/nextjs-app/src/features/app/components/billing/Status.tsx, apps/nextjs-app/src/
  features/app/components/billing/LevelWithUpgrade.tsx:29: plan/status badges and upgrade button.
- apps/nextjs-app/src/features/app/blocks/billing/SpaceSubscriptionModal.tsx:25, useSpaceSubscriptionMonitor.ts, useSpaceSubscriptionStore.ts:
  subscription-level URL flow and space selector.
- apps/nextjs-app/src/features/system/pages/PaymentRequired.tsx, apps/nextjs-app/src/features/system/pages/HttpErrorPage.tsx, apps/nextjs-app/src/
  pages/402.tsx, apps/nextjs-app/src/lib/withAuthSSR.ts:57: SSR/payment-required rendering.
- packages/openapi/src/billing/subscription/get-subscription-summary.ts:12: billing levels/status contracts.
- packages/openapi/src/usage/get-space-usage.ts:25: usage-limit contract. Frontend directly consumes buttonFieldEnable, fieldAIEnable, chatAIEnable,
  maxNumDatabaseConnections, plus level.

Gated Components

- Authority Matrix: apps/nextjs-app/src/features/app/blocks/base/base-side-bar/BasePageRouter.tsx:94 gates route at Business; apps/nextjs-app/src/
  features/app/blocks/AuthorityMatrix.tsx shows upgrade fallback.
- Generic sidebar routes: apps/nextjs-app/src/features/app/components/sidebar/SidebarContent.tsx wraps routes in UpgradeWrapper.
- Automation/App fallbacks: apps/nextjs-app/src/features/app/automation/Pages.tsx, apps/nextjs-app/src/features/app/blocks/App.tsx.
- Workflow/App creation: apps/nextjs-app/src/features/app/blocks/base/base-side-bar/BaseNodeTree.tsx:153 hides workflow/app creation in Community and
  when AI chat is disabled.
- Field AI: apps/nextjs-app/src/features/app/components/field-setting/field-ai-config/FieldAiConfig.tsx:64 uses fieldAIEnable; gated header targets Pro.
- Grid AI generation: apps/nextjs-app/src/features/app/blocks/view/grid/GridViewBaseInner.tsx:245 only renders AI generation when field AI is enabled.
- AI auto-fill limit display: apps/nextjs-app/src/features/app/components/field-setting/dialog/AiAutoFillDialog.tsx:69 uses task.maxTaskRows for limit
  warnings.
- Button field: apps/nextjs-app/src/features/app/components/field-setting/SelectFieldType.tsx:142 disables Button field by plan; apps/nextjs-app/src/
  features/app/components/field-setting/options/ButtonOptions.tsx:176 gates custom automation.
- AI Chat: apps/nextjs-app/src/features/app/blocks/view/grid/components/RecordMenu.tsx:300 hides “Add to Chat” unless chatAIEnable.
- Database connection: apps/nextjs-app/src/features/app/blocks/db-connection/Panel.tsx:20, apps/nextjs-app/src/features/app/blocks/db-connection/hooks/
  useDbConnection.ts: Cloud requires Enterprise.
- Space deletion: apps/nextjs-app/src/features/app/components/space/DeleteSpaceConfirm.tsx:28 blocks Cloud deletion unless level is Free or Enterprise.
- Branding: apps/nextjs-app/src/features/app/blocks/admin/setting/SettingPage.tsx:53, apps/nextjs-app/src/features/app/blocks/admin/setting/components/
  Branding.tsx, apps/nextjs-app/src/lib/get-brand.ts: EE Enterprise only.
- License expiry: apps/nextjs-app/src/features/app/components/LicenseExpiryBanner.tsx:18: EE admin license warning.
- Upload/payment-limit reactions: packages/sdk/src/components/editor/attachment/upload-attachment/hooks/useLocalAttachmentUpload.ts, apps/nextjs-app/
  src/features/app/components/upload-progress-panel/TaskItem.tsx open upgrade modal on upload 402.

Subscription/Plan Display

- apps/nextjs-app/src/features/app/blocks/space/SpacePage.tsx, apps/nextjs-app/src/features/app/blocks/space/SpaceInnerPage.tsx:64, apps/nextjs-app/src/
  features/app/blocks/space/SpaceCard.tsx, apps/nextjs-app/src/features/app/blocks/space/space-side-bar/SpaceSwitcher.tsx:96: subscription summary
  fetches and plan badges.
- apps/nextjs-app/src/features/app/components/user/UserNav.tsx: Cloud-only license menu item.
- apps/nextjs-app/src/features/app/blocks/space-setting/SpaceInnerSettingModal.tsx, apps/nextjs-app/src/features/app/components/setting/
  UnifiedSettingDialogContent.tsx:157: Plan tab is an extension point. CE only includes General/Collaborator unless extraSpaceTabs supplies plan
  content. There is no apps/nextjs-app/src/pages/space/[spaceId]/setting/plan page.

AI Pricing/Credit UI

- apps/nextjs-app/src/features/app/blocks/admin/setting/components/ai-config/AiFormWizard.tsx:32: showPricing defaults to Cloud.
- apps/nextjs-app/src/features/app/blocks/admin/setting/components/ai-config/LLMApiConfigStep.tsx:150: handles gateway need_credit_card and
  insufficient_quota.
- apps/nextjs-app/src/features/app/blocks/admin/setting/components/ai-config/LlmProviderForm.tsx:839: Cloud-only model rate config.
- apps/nextjs-app/src/features/app/blocks/admin/setting/components/ai-config/AiModelSelect.tsx:269, apps/nextjs-app/src/features/app/blocks/admin/
  setting/components/ai-config/GatewayModelPickerDialog.tsx, apps/nextjs-app/src/features/app/blocks/admin/setting/components/ai-config/
  GatewayModelsStep.tsx, and gateway-models-step/\*: Cloud model pricing/credit display.
