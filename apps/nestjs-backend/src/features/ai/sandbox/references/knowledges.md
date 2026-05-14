# knowledges — tblFH854k0qcvWMaXUx

Knowledge base articles, guides, and documents. Can be public or internal.

## Fields

| Display Name   | Field ID            | Type                        | Writable | Notes                               |
| -------------- | ------------------- | --------------------------- | -------- | ----------------------------------- |
| Label          | fldNAitxen8e6dr7QF5 | Single line text            | Yes      | PRIMARY                             |
| record_id      | fld6Y4S5AT4uPFaldzF | Auto number                 | No       | READ-ONLY                           |
| created_at     | fld4yq3K8ZE5Bqpf5L1 | Created time                | No       | READ-ONLY                           |
| update_at      | fldHWmp3M3ccOeY6k5x | Last modified time          | No       | READ-ONLY                           |
| title          | fldJ8ggtnSlnxztQ3L1 | Single line text            | Yes      |                                     |
| context        | fldtiIZg6Q01j3SkLB9 | Long text / Rich text       | Yes      | full article content                |
| attachment     | fld0fIA9tuU3GXdCKrC | File attachments            | Yes      | PDFs, images, etc.                  |
| is_public      | fldGvy3nrLY0DtCcbCB | Checkbox                    | Yes      | `true` = public, `false` = internal |
| knowledge_type | fld6AGvzdXknJXirdJy | Multi-link → knowledge-type | Yes      | array `[{ "id": "recXXX" }]`        |
| tasks          | fldcGWoaSJk7BfHKCYR | Multi-link → tasks          | Yes      |                                     |

## Common Filter Examples

Public articles only:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldGvy3nrLY0DtCcbCB", "operator": "is", "value": true }]
}
```

Search by title keyword (use search param, not filter):

```
search=onboarding
```

## Example Payloads

### Create a knowledge article

```json
{
  "tableId": "tblFH854k0qcvWMaXUx",
  "records": [
    {
      "fields": {
        "title": "VPN Setup Guide",
        "context": "Step-by-step instructions for connecting to the corporate VPN...",
        "is_public": false,
        "knowledge_type": [{ "id": "recKnowledgeTypeId" }]
      }
    }
  ]
}
```
