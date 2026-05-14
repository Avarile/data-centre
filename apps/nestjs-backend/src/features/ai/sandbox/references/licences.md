# licences — tbl9fT4iH6G4GXzdA9B

Join table linking a contact (user) to a SaaS application with a specific access level.
One licence record = one person's access to one application.

## Fields

| Display Name | Field ID            | Type                      | Writable | Notes                        |
| ------------ | ------------------- | ------------------------- | -------- | ---------------------------- |
| Label        | fldx5XCSERLvj8xmE4m | Single line text          | Yes      | PRIMARY — descriptive label  |
| record_id    | fldvj3uNduEgHsvshXg | Auto-incrementing number  | No       | READ-ONLY                    |
| created_at   | fldSmquI4xUczGula8G | Created time              | No       | READ-ONLY                    |
| update_at    | fldoFMlcPxUmHQzSCxA | Last modified time        | No       | READ-ONLY                    |
| title        | fldhJpeNdwLW34ulxCc | Single line text          | Yes      | e.g. "Jane Smith - Slack"    |
| context      | fldvk1KWo9wd4rQVdUn | Long text / Rich text     | Yes      | notes about this licence     |
| user         | fldiz8LvNpayZWDnRuM | Multi-link → contacts     | Yes      | array `[{ "id": "recXXX" }]` |
| access_level | fldw6ftC6qP18mI0dJF | Single select             | Yes      | see options below            |
| application  | fldA25l18psqCWCbmek | Multi-link → applications | Yes      | array `[{ "id": "recXXX" }]` |

## access_level Options

`user` · `power_user` · `admin` · `super_admin` · `disabled`

Use `disabled` to revoke access without deleting the record (preserves audit trail).

## Common Filter Examples

All licences for a specific contact (use the contact's record ID):

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldiz8LvNpayZWDnRuM", "operator": "is", "value": "recContactId" }]
}
```

All admin or super_admin licences:

```json
{
  "conjunction": "or",
  "filterSet": [
    { "fieldId": "fldw6ftC6qP18mI0dJF", "operator": "is", "value": "admin" },
    { "fieldId": "fldw6ftC6qP18mI0dJF", "operator": "is", "value": "super_admin" }
  ]
}
```

Disabled licences (for offboarding audit):

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldw6ftC6qP18mI0dJF", "operator": "is", "value": "disabled" }]
}
```

## Example Payloads

### Grant access to an application

```json
{
  "tableId": "tbl9fT4iH6G4GXzdA9B",
  "records": [
    {
      "fields": {
        "title": "Jane Smith - Slack",
        "user": [{ "id": "recContactId" }],
        "application": [{ "id": "recApplicationId" }],
        "access_level": "user"
      }
    }
  ]
}
```

### Revoke access (offboarding)

```json
{
  "tableId": "tbl9fT4iH6G4GXzdA9B",
  "recordId": "recXXXXXXX",
  "fields": { "access_level": "disabled" }
}
```

### Upgrade to admin

```json
{
  "tableId": "tbl9fT4iH6G4GXzdA9B",
  "recordId": "recXXXXXXX",
  "fields": { "access_level": "admin" }
}
```
