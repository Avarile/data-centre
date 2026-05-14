# roles — tblZJc88eoY1SPWmtdg

Job roles that contacts hold within the organisation.

## Fields

| Display Name | Field ID            | Type                  | Writable | Notes                               |
| ------------ | ------------------- | --------------------- | -------- | ----------------------------------- |
| Label        | fld25zMEwmPljt7ZIhp | Single line text      | Yes      | PRIMARY                             |
| record_id    | fldPrkYa01kNBNO0Cr3 | Auto number           | No       | READ-ONLY                           |
| created_at   | fldJnM7hSMee9wdxGAU | Created time          | No       | READ-ONLY                           |
| update_at    | fldBPfa38nYkDr0HKFX | Last modified time    | No       | READ-ONLY                           |
| title        | fldOiLraMG0GDx7YCKp | Single line text      | Yes      | role name                           |
| context      | fldBsWeGEOUgOQOjBNl | Long text             | Yes      | role description / responsibilities |
| contacts     | fldluJKyKVAncY86goO | Multi-link → contacts | Yes      |                                     |

## Common Filter Examples

Find role by title:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldOiLraMG0GDx7YCKp", "operator": "is", "value": "Backend Engineer" }]
}
```

## Example Payloads

### Create a role

```json
{
  "tableId": "tblZJc88eoY1SPWmtdg",
  "records": [
    {
      "fields": {
        "title": "Backend Engineer",
        "context": "Designs and implements server-side systems and APIs"
      }
    }
  ]
}
```
