import { Search, Plus, Filter, Group } from "lucide-react"

const rows = [
  {
    name: "Q4 Product Roadmap",
    status: "Done",
    statusColor: "green",
    priority: "High",
    due: "Dec 31",
    assignee: "Sarah K.",
  },
  {
    name: "API v2 Architecture",
    status: "Active",
    statusColor: "blue",
    priority: "Critical",
    due: "Jan 15",
    assignee: "Alex M.",
  },
  {
    name: "User Research Sessions",
    status: "Todo",
    statusColor: "gray",
    priority: "Medium",
    due: "Jan 22",
    assignee: "Maria L.",
  },
  {
    name: "Launch Campaign",
    status: "Active",
    statusColor: "blue",
    priority: "High",
    due: "Feb 01",
    assignee: "James W.",
  },
  {
    name: "Security Audit",
    status: "Done",
    statusColor: "green",
    priority: "Critical",
    due: "Dec 15",
    assignee: "David R.",
  },
  {
    name: "Blog: AI in Data Mgmt",
    status: "Todo",
    statusColor: "gray",
    priority: "Low",
    due: "Feb 14",
    assignee: "Kim T.",
  },
]

const statusBadge: Record<string, string> = {
  green: "bg-gray-900 text-white",
  blue: "bg-gray-200 text-gray-700",
  gray: "bg-gray-100 text-gray-600",
}

const priorityColor: Record<string, string> = {
  Critical: "text-gray-900 font-medium",
  High: "text-gray-700 font-medium",
  Medium: "text-gray-500",
  Low: "text-gray-400",
}

export function TableMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-gray-100">
      <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-gray-300" />
        <div className="h-3 w-3 rounded-full bg-gray-400" />
        <div className="h-3 w-3 rounded-full bg-gray-600" />
        <span className="ml-3 text-xs font-medium text-gray-400">
          Projects · Cybernetics
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-4 py-2.5">
        <div className="flex flex-1 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400">
          <Search className="h-3 w-3" />
          Search records...
        </div>
        <button className="flex items-center gap-1 rounded-md bg-black px-2.5 py-1.5 text-xs font-medium text-white">
          <Plus className="h-3 w-3" /> Add
        </button>
        <button className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600">
          <Filter className="h-3 w-3" /> Filter
        </button>
        <button className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600">
          <Group className="h-3 w-3" /> Group
        </button>
      </div>

      <div className="grid grid-cols-5 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
        <div className="col-span-2">Name</div>
        <div>Status</div>
        <div>Priority</div>
        <div>Due Date</div>
      </div>

      <div className="divide-y divide-gray-50">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-5 items-center px-4 py-2.5 text-xs text-gray-700 transition-colors hover:bg-gray-50/60"
          >
            <div className="col-span-2 truncate pr-2 font-medium text-gray-800">
              {row.name}
            </div>
            <div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge[row.statusColor]}`}
              >
                {row.status}
              </span>
            </div>
            <div className={`text-[11px] ${priorityColor[row.priority]}`}>
              {row.priority}
            </div>
            <div className="text-gray-500">{row.due}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2 text-xs text-gray-400">
        6 records · Last updated just now
      </div>
    </div>
  )
}
