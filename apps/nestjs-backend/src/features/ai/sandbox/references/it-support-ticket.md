# it-support-ticket — tbl8Ule7YoA9LrViroC

IT support requests raised by staff. Tracks type, priority, status, requester, and assignee.

## Fields

| Display Name   | Field ID            | Type                     | Writable | Notes                            |
| -------------- | ------------------- | ------------------------ | -------- | -------------------------------- |
| Label          | fldQx8eP9mcsy8II7Q4 | Single line text         | Yes      | PRIMARY                          |
| record_id      | fldcnKfs7yii84dQnps | Auto-incrementing number | No       | READ-ONLY                        |
| created_at     | fldPAIZq8fvNsLbvTrk | Created time             | No       | READ-ONLY                        |
| update_at      | fldxBoXPawCiylP7Zg6 | Last modified time       | No       | READ-ONLY                        |
| title          | fldEEeYOZb6IxpC4OLd | Single line text         | Yes      | short summary of the issue       |
| context        | fldUh5Q5kd8DGe9SHSR | Long text / Rich text    | Yes      | full description of the issue    |
| type           | fld2L563WzZ9lIbFkNl | Single select            | Yes      | see options below                |
| priority       | fldJRDkWVoUYCtxw9Gs | Single select            | Yes      | see options below                |
| status         | fld4NzF52VlXTYtlA9v | Single select            | Yes      | see options below                |
| requester_name | flduXjEXWtCxpIlgoUW | Multi-link → contacts    | Yes      | array `[{ "id": "recXXX" }]`     |
| assigned_to    | fld17eWiUPc7HihzO8R | Multi-link → contacts    | Yes      | IT staff assigned to this ticket |
| attachments    | fldFBINAOgDOTrq3GfC | File attachments         | Yes      | screenshots, logs                |

## Select Options

**type**: `Hardware` · `Software` · `Network` · `Onboard` · `Offboard` · `Access issues` · `Credential updates` · `Other`

**priority**: `Critical` · `High` · `Medium` · `Low`

**status**: `Open` · `In Progress` · `On Hold` · `Resolved` · `Closed`

## Common Filter Examples

All open tickets:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fld4NzF52VlXTYtlA9v", "operator": "is", "value": "Open" }]
}
```

Open tickets sorted by priority (use orderBy):

```json
filter: { "conjunction": "and", "filterSet": [{ "fieldId": "fld4NzF52VlXTYtlA9v", "operator": "is", "value": "Open" }] }
orderBy: [{ "fieldId": "fldJRDkWVoUYCtxw9Gs", "order": "asc" }]
```

Critical or High priority tickets not yet resolved:

```json
{
  "conjunction": "and",
  "filterSet": [
    {
      "conjunction": "or",
      "filterSet": [
        { "fieldId": "fldJRDkWVoUYCtxw9Gs", "operator": "is", "value": "Critical" },
        { "fieldId": "fldJRDkWVoUYCtxw9Gs", "operator": "is", "value": "High" }
      ]
    },
    {
      "conjunction": "or",
      "filterSet": [
        { "fieldId": "fld4NzF52VlXTYtlA9v", "operator": "is", "value": "Open" },
        { "fieldId": "fld4NzF52VlXTYtlA9v", "operator": "is", "value": "In Progress" }
      ]
    }
  ]
}
```

## Example Payloads

### Raise a new IT ticket

```json
{
  "tableId": "tbl8Ule7YoA9LrViroC",
  "records": [
    {
      "fields": {
        "title": "Cannot access VPN",
        "context": "Getting authentication error when connecting to corporate VPN since this morning",
        "type": "Network",
        "priority": "High",
        "status": "Open",
        "requester_name": [{ "id": "recContactId" }]
      }
    }
  ]
}
```

### Assign and progress a ticket

```json
{
  "tableId": "tbl8Ule7YoA9LrViroC",
  "recordId": "recXXXXXXX",
  "fields": {
    "status": "In Progress",
    "assigned_to": [{ "id": "recITStaffContactId" }]
  }
}
```

### Resolve a ticket

```json
{
  "tableId": "tbl8Ule7YoA9LrViroC",
  "recordId": "recXXXXXXX",
  "fields": { "status": "Resolved" }
}
```
