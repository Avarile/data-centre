# goals — tblJBmCNhL3D3nqgWl5

Strategic objectives and milestones. Projects link to goals to show what they work toward.

## Fields

| Display Name | Field ID            | Type             | Writable | Notes                      |
| ------------ | ------------------- | ---------------- | -------- | -------------------------- |
| Label        | fldm0XMjAcfl0Cqz7Zm | Single line text | Yes      | PRIMARY                    |
| record_id    | fldO6Gp0pBSN4seXQ3E | Auto number      | No       | READ-ONLY                  |
| created_at   | fldLvz23skKfDvr2JF8 | Created time     | No       | READ-ONLY                  |
| title        | fldCdjep0Hx2obNr0Fn | Single line text | Yes      | short goal name            |
| context      | fldf6COuluQxLXeIXXx | Long text        | Yes      | full description           |
| goal_type    | fldEaHXR6bqsh68Y9BT | Single select    | Yes      | `milestone` or `objective` |
| deadline     | fldrCJ0X3rn6M1peu0A | Date/Time        | Yes      | ISO 8601                   |
| update_at    | fld9zk2SnWxyggmRKXt | Date/Time        | Yes      | manual last-updated date   |

## goal_type Options

- `objective` — high-level strategic goal (e.g. "Improve system reliability")
- `milestone` — specific, time-bound achievement (e.g. "Launch v2.0 by Q3")

## Common Filter Examples

All objectives:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldEaHXR6bqsh68Y9BT", "operator": "is", "value": "objective" }]
}
```

Goals with deadline before a date:

```json
{
  "conjunction": "and",
  "filterSet": [
    { "fieldId": "fldrCJ0X3rn6M1peu0A", "operator": "isBefore", "value": "2024-12-31T23:59:59Z" }
  ]
}
```

## Example Payloads

### Create a goal

```json
{
  "tableId": "tblJBmCNhL3D3nqgWl5",
  "records": [
    {
      "fields": {
        "title": "Achieve SOC 2 Type II certification",
        "context": "Complete all controls and pass third-party audit by end of year",
        "goal_type": "milestone",
        "deadline": "2024-12-31T00:00:00Z"
      }
    }
  ]
}
```
