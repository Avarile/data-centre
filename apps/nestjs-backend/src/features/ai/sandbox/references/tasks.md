# tasks — tblEtuOcO68wvO2nCoM

Work items that can be assigned to contacts, linked to projects, and dated.

## Fields

| Display Name       | Field ID            | Type                     | Writable | Notes                         |
| ------------------ | ------------------- | ------------------------ | -------- | ----------------------------- |
| Label              | fldPe1ctffKlzdVjJyp | Single line text         | Yes      | PRIMARY                       |
| record_id          | fldvU0u82oyisYRO7pc | Auto-incrementing number | No       | READ-ONLY                     |
| created_at         | fldb0U1aAbtmiqthHOs | Created time             | No       | READ-ONLY                     |
| update_at          | fldKc5mRnkZNHjnW2bp | Last modified time       | No       | READ-ONLY                     |
| title              | fldoweZTV8DtKWgwATS | Single line text         | Yes      |                               |
| context            | fldfbkOtkfi4Gk0zGso | Long text / Rich text    | Yes      | detailed description          |
| assigned_at        | fldXBUDtnnRGPUOdQPY | Date/Time                | Yes      | ISO 8601                      |
| start_at           | fldlncDUmhAzV6awVEY | Date/Time                | Yes      | ISO 8601                      |
| finished_at        | fldWkQbqRW5mbCtnJUb | Date/Time                | Yes      | ISO 8601                      |
| task_status        | fldsf3yMmXHyvxE3L6w | Single select            | Yes      | see options below             |
| assigned_to        | fldvUeNsKu56NoQ8lHM | Multi-link → contacts    | Yes      | array `[{ "id": "recXXX" }]`  |
| project_name       | fldhS1tK8YWkT921lFQ | Multi-link → projects    | Yes      |                               |
| knowledge_involved | fld3gARpWaNluRUwTwZ | Multi-link → knowledges  | Yes      |                               |
| daily_task_date    | fldJ5VPn59FDXvTYj5m | Date/Time                | Yes      | ISO 8601; links task to a day |

## task_status Options

`backlog` · `preparing` · `in-progress` · `finished` · `reviewing` · `approved` · `delivered` · `failed` · `cancelled` · `onhold`

## Common Filter Examples

All in-progress tasks:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldsf3yMmXHyvxE3L6w", "operator": "is", "value": "in-progress" }]
}
```

Tasks not yet started (backlog or preparing):

```json
{
  "conjunction": "or",
  "filterSet": [
    { "fieldId": "fldsf3yMmXHyvxE3L6w", "operator": "is", "value": "backlog" },
    { "fieldId": "fldsf3yMmXHyvxE3L6w", "operator": "is", "value": "preparing" }
  ]
}
```

Overdue tasks (finished_at is empty and start_at is before today):

```json
{
  "conjunction": "and",
  "filterSet": [
    { "fieldId": "fldWkQbqRW5mbCtnJUb", "operator": "isEmpty" },
    { "fieldId": "fldlncDUmhAzV6awVEY", "operator": "isBefore", "value": "2024-01-01T00:00:00Z" }
  ]
}
```

## Example Payloads

### Create a task

```json
{
  "tableId": "tblEtuOcO68wvO2nCoM",
  "records": [
    {
      "fields": {
        "title": "Implement login page",
        "context": "Create the React login page with email/password form",
        "task_status": "backlog",
        "start_at": "2024-02-01T09:00:00Z",
        "assigned_to": [{ "id": "recContactId" }],
        "project_name": [{ "id": "recProjectId" }]
      }
    }
  ]
}
```

### Mark a task as finished

```json
{
  "tableId": "tblEtuOcO68wvO2nCoM",
  "recordId": "recXXXXXXX",
  "fields": {
    "task_status": "finished",
    "finished_at": "2024-02-15T17:00:00Z"
  }
}
```

### Re-assign a task

```json
{
  "tableId": "tblEtuOcO68wvO2nCoM",
  "recordId": "recXXXXXXX",
  "fields": {
    "assigned_to": [{ "id": "recNewContactId" }]
  }
}
```
