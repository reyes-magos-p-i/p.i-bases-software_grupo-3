interface CatalogOption {
  id: number;
  label: string;
}

export class UserCreationOptionsDto {
  readonly provinces: CatalogOption[];
  readonly cantons: (CatalogOption & { provinceId: number })[];
  readonly districts: (CatalogOption & { cantonId: number })[];
  readonly branches: CatalogOption[];

  constructor(options: UserCreationOptionsDto) {
    this.provinces = options.provinces;
    this.cantons = options.cantons;
    this.districts = options.districts;
    this.branches = options.branches;
  }
}
