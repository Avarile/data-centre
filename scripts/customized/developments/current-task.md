  TL;DR — The "AI doc" is a deterministic template, not LLM-generated

  Despite the "AI Context" / "MagicAi" branding, no AI model is involved anywhere. The document is assembled entirely client-side by a pure string-template function (generateAIContext) at
  APIDialogContent.tsx:110-269. It's "AI" in purpose (designed to be pasted into ChatGPT/Claude), not in mechanism.

  ---
  How it actually works

  1. Entry point & lazy loading (APIDialog.tsx)

  - APIDialog renders a shadcn Dialog. The heavy content is code-split via next/dynamic (ssr: false, skeleton fallback) — APIDialog.tsx:68-74.
  - Content only mounts when open ({isOpen && <APIDialogContent />}, line 111), so fetches don't fire until the dialog is opened.

  2. Data acquisition (APIDialogContent.tsx:481-549)

  The component resolves baseId/tableId/viewId from useBaseResource(), then runs two React Query fetches:
  - Table info — getTableById(baseId, tableId) → tableInfo.name, tableInfo.description (lines 494-498)
  - Fields — getFields(tableId) → array mapped into IFieldInfo[] capturing id, name, type, description, options, isPrimary, isComputed (lines 501-549)

  currentUrl is captured from window.location.origin in an effect (lines 489-491) to build absolute curl examples.

  3. Optional token generation (lines 507-536)

  - Clicking "Generate Token" opens an AlertDialog confirmation, then createTokenMutation calls createAccessToken(...).
  - Scopes are hardcoded: table|read, field|read, record|read/create/update/delete, scoped to baseIds:[baseId], expiry +1 year (lines 510-526).
  - On success the real token replaces the <YOUR_API_TOKEN> placeholder in the doc.

  4. Document assembly — generateAIContext() (lines 110-269)

  This is the core. A pure function returning one big template literal. Its logic:

  - getFieldTypeDescription() (lines 56-106) maps each FieldType enum to a human-readable string; for SingleSelect/MultipleSelect it inlines the choice names from options.
  - Field list (lines 119-127): each field → - "Name" [id: fldXXX] (TypeDesc) [PRIMARY] [READ-ONLY] - description. The [id: ...] is deliberately exposed because filter/orderBy require field
  IDs.
  - editableFields (lines 129-132): non-computed field names, injected as a comment hint in the POST example.
  - Then it interpolates everything into static Markdown sections: Read/Pagination/Filter/Sort/Projection/Search, Create/Update/Delete curl blocks, an API Configuration block,
  Authentication, the Fields list, and a "Notes for AI" section with guidance (e.g., "filter/orderBy MUST use field IDs", ISO-8601 dates, link fields take record-ID arrays).

  The token parameter defaults to TOKEN_PLACEHOLDER = '<YOUR_API_TOKEN>' (line 108) so the doc is fully usable before any token exists.

  5. Reactivity & rendering (lines 551-621)

  - aiContext is a useMemo over [tableInfo, fields, currentUrl, tableId, generatedToken] — it re-renders the moment any input changes (e.g., token generated) (lines 551-561).
  - Displayed via <MarkdownPreview> (from @teable/sdk, packages/sdk/src/components/markdown-editor/MarkDownPreview.tsx) inside a ScrollArea.
  - "Copy AI Doc" writes the raw markdown string to clipboard via navigator.clipboard.writeText (lines 563-567).

  6. The "Advanced" tab (AdvancedQueryPanel, lines 341-475)

  Separate from the doc — an interactive query builder (ViewBuilder, SearchBuilder, FilterBuilder, OrderByBuilder, format toggles) wrapped in StandaloneViewProvider, with live PreviewScript
  + PreviewTable. It does not feed into generateAIContext; it's a parallel, live-preview path.

  ---
  Data flow summary

  useBaseResource → baseId/tableId/viewId
          │
          ├── getTableById ─► tableInfo (name, description)
          ├── getFields ────► IFieldInfo[]
          ├── window.origin ► currentUrl
          └── createAccessToken (optional) ► generatedToken.token
                                    │
                                    ▼
          generateAIContext(...)  ── pure template, no network/AI
                                    │
                                    ▼
          useMemo(aiContext) ─► <MarkdownPreview> + Copy-to-clipboard

  Observations worth noting

  - Strengths: zero backend/LLM cost, deterministic, instantly reactive, security-conscious (placeholder token, 1-year scoped token, explicit field-ID warnings repeated 3×).
  - Constraints: the template is hardcoded English-prose (the curl bodies and "Notes for AI" are not run through i18n — only the surrounding UI chrome is), so the document itself isn't
  localized. Field-type coverage depends on the getFieldTypeDescription switch staying in sync with FieldType.
  - The recent commit 352148d "updated the modal that is too small for the ai doc" corresponds to the h-[90vh] max-w-7xl sizing in APIDialog.tsx:103.

  ---
  This was a read-only analysis — I haven't proposed or made any code changes. If you'd like, I can take this further (e.g., a plan to localize the doc body, move generation server-side,
  add field-type coverage, or actually run an LLM to summarize the table). Let me know which direction and I'll plan it out.