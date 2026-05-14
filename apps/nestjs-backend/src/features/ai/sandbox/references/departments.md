# departments — tblLalSqgqccQQ9eehi

Organisational units. Contacts are linked to departments.

## Fields

| Display Name | Field ID            | Type                  | Writable | Notes           |
| ------------ | ------------------- | --------------------- | -------- | --------------- |
| Label        | fldGv6a7UyZeoSKvsj9 | Single line text      | Yes      | PRIMARY         |
| record_id    | fldJ6HIM86AEzOmqpAO | Auto number           | No       | READ-ONLY       |
| created_at   | fldBoh1GxpHyBDN2ibn | Created time          | No       | READ-ONLY       |
| update_at    | fldLIPvNbg3MNjtiQvM | Last modified time    | No       | READ-ONLY       |
| title        | fldO2h5ypNE10Nuao0E | Single line text      | Yes      | department name |
| context      | fldr8c1mgisQwgBk9NI | Long text             | Yes      | description     |
| contacts     | fldXF2qhneT4SdnsZHz | Multi-link → contacts | Yes      |                 |

## Common Filter Examples

Find department by name:

```json
{
  "conjunction": "and",
  "filterSet": [{ "fieldId": "fldO2h5ypNE10Nuao0E", "operator": "is", "value": "Engineering" }]
}
```

## Example Payloads

### Create a department

```json
{
  "tableId": "tblLalSqgqccQQ9eehi",
  "records": [
    { "fields": { "title": "Engineering", "context": "Software development and infrastructure" } }
  ]
}
```
