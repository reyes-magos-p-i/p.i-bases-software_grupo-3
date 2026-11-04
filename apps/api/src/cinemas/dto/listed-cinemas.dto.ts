// Names made of spaces only are returned as null: the UI shows them as missing.
export interface ListedCinemaDto {
  id: number;
  name: string | null;
  companyId: number;
  companyName: string | null;
}

export interface ListedCinemasDto {
  items: ListedCinemaDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CompanyOptionDto {
  id: number;
  name: string | null;
}
