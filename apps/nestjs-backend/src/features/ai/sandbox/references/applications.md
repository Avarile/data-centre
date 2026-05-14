# applications — tbl46utYSpisOZ94FXE

SaaS applications the company subscribes to. Linked to licences (which link to contacts).

## Fields

| Display Name | Field ID            | Type                  | Writable | Notes                         |
| ------------ | ------------------- | --------------------- | -------- | ----------------------------- |
| Label        | fldvVqLa4A5ShgedTJj | Single line text      | Yes      | PRIMARY                       |
| record_id    | fldBTXwFUZjMQ2IGRMD | Auto number           | No       | READ-ONLY                     |
| created_at   | fldvqEi6g70nDbe48DK | Created time          | No       | READ-ONLY                     |
| update_at    | fld5SorVSpz5I3eYFED | Last modified time    | No       | READ-ONLY                     |
| title        | fldv7oVj2DluAB0xbqY | Single line text      | Yes      | application name (e.g. Slack) |
| context      | fldGuuqnywxMGHajcpC | Long text             | Yes      | description / use-case        |
| licences     | fldx7LpNO4Jx65zYZFw | Multi-link → licences | Yes      | all licences for this app     |

## Common Filter Examples

Find application by name:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldv7oVj2DluAB0xbqY", "operator": "is", "value": "Slack" }]
}
```

## Example Payloads

### Register a new SaaS application

```json
{
  "tableId": "tbl46utYSpisOZ94FXE",
  "records": [
    {
      "fields": { "title": "Figma", "context": "Design and prototyping tool for the product team" }
    }
  ]
}
```
