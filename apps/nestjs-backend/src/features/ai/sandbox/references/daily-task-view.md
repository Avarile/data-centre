# daily-task-view — tblfVf2gSF1axjKxXAP

Daily planning records. Each entry represents one day and links to tasks scheduled for that day.
`task_delivered` and `task_total` are computed rollup fields — read-only.

## Fields

| Display Name   | Field ID            | Type               | Writable | Notes                                  |
| -------------- | ------------------- | ------------------ | -------- | -------------------------------------- |
| Label          | fldG6PfABHNZvyZ1o7h | Single line text   | Yes      | PRIMARY — typically the date           |
| created_at     | fldeNYTlnzJhF2F2JkZ | Created time       | No       | READ-ONLY                              |
| daily_tasks    | fldnox69ipS2mXWUoip | Multi-link → tasks | Yes      | tasks planned for this day             |
| daily_log      | fldabCEp5KLuwjJnsmq | Long text          | Yes      | end-of-day notes                       |
| task_delivered | fldcvFnF0z6Nj6Pp6ru | Rollup (count)     | No       | READ-ONLY — computed from linked tasks |
| task_total     | fldyInR5xZXZPxEvMOj | Rollup (count)     | No       | READ-ONLY — computed from linked tasks |

## Common Filter Examples

Find entry for a specific date label:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldG6PfABHNZvyZ1o7h", "operator": "is", "value": "2024-02-15" }]
}
```

## Example Payloads

### Create a daily plan entry

```json
{
  "tableId": "tblfVf2gSF1axjKxXAP",
  "records": [
    {
      "fields": {
        "Label": "2024-02-15",
        "daily_tasks": [{ "id": "recTask1" }, { "id": "recTask2" }],
        "daily_log": ""
      }
    }
  ]
}
```

### Add end-of-day log

```json
{
  "tableId": "tblfVf2gSF1axjKxXAP",
  "recordId": "recXXXXXXX",
  "fields": { "daily_log": "Completed login page. Blocked on API spec for registration." }
}
```
