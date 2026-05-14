# Entity Relationships

## Full Dependency Graph

```
goals (tblJBmCNhL3D3nqgWl5)
  └─ projects.goal → goals
       └─ tasks.project_name → projects
            ├─ contacts.assigned_to → contacts
            │     ├─ contact-type   (required on contact create)
            │     ├─ contact-profession
            │     ├─ departments
            │     └─ roles
            └─ knowledges.knowledge_involved → knowledges
                  └─ knowledge-type.knowledge_type → knowledge-type

licences (tbl9fT4iH6G4GXzdA9B)  — joins contacts ↔ applications
  ├─ licences.user → contacts
  └─ licences.application → applications

daily-task-view (tblfVf2gSF1axjKxXAP)
  └─ daily-task-view.daily_tasks → tasks

it-support-ticket (tbl8Ule7YoA9LrViroC)
  ├─ requester_name → contacts
  └─ assigned_to → contacts
```

---

## Link Resolution Order

When creating or updating a record that contains link fields, resolve links in this order to avoid circular dependency:

### Creating a contact (most complex)

```
1. GET contact-type records         → pick one → contactTypeId
2. (optional) GET contact-profession → pick one → professionId
3. (optional) GET departments        → pick one → departmentId
4. (optional) GET roles              → pick one → roleId
5. POST contacts with:
     internal_contact_type: { "id": contactTypeId }   ← required
     internal_contact_profession: [{ "id": professionId }]
     department: [{ "id": departmentId }]
     role: [{ "id": roleId }]
```

### Creating a task

```
1. (optional) GET contacts  → pick assignee → contactId
2. (optional) GET projects  → pick project  → projectId
3. (optional) GET knowledges → pick knowledge → knowledgeId
4. POST tasks with:
     assigned_to: [{ "id": contactId }]
     project_name: [{ "id": projectId }]
     knowledge_involved: [{ "id": knowledgeId }]
```

### Creating a project

```
1. (optional) GET goals    → pick goal   → goalId
2. (optional) GET contacts → pick lead   → leadId
3. POST projects with:
     goal:    [{ "id": goalId }]
     lead_by: [{ "id": leadId }]
```

### Assigning a licence (contacts ↔ applications)

```
1. GET contacts      → find user    → contactId
2. GET applications  → find app     → applicationId
3. POST licences with:
     user:         [{ "id": contactId }]
     application:  [{ "id": applicationId }]
     access_level: "user" | "power_user" | "admin" | "super_admin" | "disabled"
```

### Creating a knowledge entry

```
1. GET knowledge-type → pick type → knowledgeTypeId
2. POST knowledges with:
     knowledge_type: [{ "id": knowledgeTypeId }]
     is_public: true | false
```

---

## Reverse Links (bidirectional)

Many link fields are bidirectional. Updating one side automatically updates the other:

| When you set …                        | The reverse field also updates           |
| ------------------------------------- | ---------------------------------------- |
| contacts.department → departments     | departments.contacts                     |
| contacts.role → roles                 | roles.contacts                           |
| contacts.internal_contact_type        | contact-type.contacts-internal           |
| contacts.internal_contact_profession  | contact-profession.contacts-internal     |
| tasks.assigned_to → contacts          | contacts.tasks                           |
| tasks.project_name → projects         | projects.tasks                           |
| tasks.knowledge_involved → knowledges | knowledges.tasks                         |
| projects.goal → goals                 | (goals has no reverse link field)        |
| projects.lead_by → contacts           | contacts.projects                        |
| licences.user → contacts              | (contacts has no licences reverse field) |
| licences.application → applications   | applications.licences                    |
| knowledge.knowledge_type              | knowledge-type.knowledges                |
| daily-task-view.daily_tasks → tasks   | (tasks has no reverse field)             |

You do not need to set both sides; Teable handles the reverse automatically.
