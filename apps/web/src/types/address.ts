export interface ProvinceOption {
  id: number
  label: string
}

export interface CantonOption {
  id: number
  label: string
  provinceId: number
}

export interface DistrictOption {
  id: number
  label: string
  cantonId: number
}
