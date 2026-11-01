// A branch is a row of the Cinemas table. The API returns names made of
// spaces only as null, so the UI can show them as missing.
export interface BranchListItem {
  id: number
  name: string | null
  companyId: number
  companyName: string | null
}

export interface BranchListResult {
  items: BranchListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type BranchPageSize = 10 | 20 | 50

export interface BranchListQuery {
  search?: string
  companyId?: number
  page: number
  pageSize: BranchPageSize
}

export interface CompanyOption {
  id: number
  name: string | null
}

/** Body of POST /cinemas. */
export interface BranchRequest {
  name: string
  companyId: number
}

export type BranchStatus = 'ACTIVE' | 'INACTIVE'

export interface BranchDetail extends BranchListItem {
  status: BranchStatus
}
