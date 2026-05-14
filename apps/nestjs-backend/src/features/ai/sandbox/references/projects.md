# projects — tbluBET7kwcH7WDUxVf

Projects group tasks toward a goal and are led by a contact.

## Fields

| Display Name | Field ID            | Type                     | Writable | Notes                        |
| ------------ | ------------------- | ------------------------ | -------- | ---------------------------- |
| Label        | fldFRlJHm1dEuamLKpX | Single line text         | Yes      | PRIMARY                      |
| record_id    | fldSP8NZQYOQUKSmyxA | Auto-incrementing number | No       | READ-ONLY                    |
| title        | fldNasw0UVWhXYR70X7 | Single line text         | Yes      |                              |
| context      | fldxgBiH8wcviuQSpTS | Long text / Rich text    | Yes      | project description/brief    |
| created_at   | fldcPkA8MFtfkOygNb4 | Date/Time                | Yes      | manual entry; ISO 8601       |
| update_at    | fldtdyVv25Rg8cg4Om7 | Date/Time                | Yes      | manual entry; ISO 8601       |
| tasks        | fldyGfTOcDPSX46pcBr | Multi-link → tasks       | Yes      | array `[{ "id": "recXXX" }]` |
| started_at   | fldPymPvgdRey8asClV | Date/Time                | Yes      | ISO 8601                     |
| completed_at | fldIqpgggkK234XeNBA | Date/Time                | Yes      | ISO 8601                     |
| lead_by      | fldIaCVQ2ErzGwHEwgg | Multi-link → contacts    | Yes      |                              |
| goal         | fld7a95yKf4hgCyIV2x | Multi-link → goals       | Yes      |                              |

## Common Filter Examples

Active projects (no completed_at date):

```json
{ "conjunction": "and", "filterSet": [{ "fieldId": "fldIqpgggkK234XeNBA", "operator": "isEmpty" }] }
```

Projects started after a date:

```json
{
  "conjunction": "and",
  "filterSet": [
    { "fieldId": "fldPymPvgdRey8asClV", "operator": "isAfter", "value": "2024-01-01T00:00:00Z" }
  ]
}
```

## Example Payloads

### Create a project

```json
{
  "tableId": "tbluBET7kwcH7WDUxVf",
  "records": [
    {
      "fields": {
        "title": "Data Platform Migration",
        "context": "Migrate legacy data pipeline to modern cloud infrastructure",
        "started_at": "2024-01-15T00:00:00Z",
        "lead_by": [{ "id": "recContactId" }],
        "goal": [{ "id": "recGoalId" }]
      }
    }
  ]
}
```

### Mark a project complete

```json
{
  "tableId": "tbluBET7kwcH7WDUxVf",
  "recordId": "recXXXXXXX",
  "fields": { "completed_at": "2024-06-30T17:00:00Z" }
}
```
