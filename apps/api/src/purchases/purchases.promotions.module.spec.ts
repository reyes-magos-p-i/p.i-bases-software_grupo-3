import 'reflect-metadata';
import { PurchasesModule } from './purchases.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { PromotionsService } from '../promotions/promotions.service';

describe('PurchasesModule: promotions dependency', () => {
  it('imports PromotionsModule without redeclaring its service as a local provider', () => {
    const imports = Reflect.getMetadata('imports', PurchasesModule) as unknown[];
    const providers = Reflect.getMetadata('providers', PurchasesModule) as unknown[];
    expect(imports).toContain(PromotionsModule);
    expect(providers).not.toContain(PromotionsService);
  });
  it('requires the real promotions module to export PromotionsService for injection', () => {
    const exports = Reflect.getMetadata('exports', PromotionsModule) as unknown[] | undefined;
    expect(exports).toContain(PromotionsService);
  });
});
