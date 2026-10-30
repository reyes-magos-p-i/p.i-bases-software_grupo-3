import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';
import { AppModule } from '../../app.module';
import { ALLOW_EXPIRED_PASSWORD_KEY } from './allow-expired-password.decorator';
import { PasswordStatusGuard } from './password-status.guard';

type Class = abstract new (...args: never[]) => unknown;

/** Every controller registered by AppModule, following nested and dynamic module imports. */
function collectControllers(root: unknown): Class[] {
  const controllers = new Set<Class>();
  const visited = new Set<unknown>();
  const visit = (entry: unknown) => {
    const module =
      entry && typeof entry === 'object' && 'module' in entry
        ? (entry as { module: unknown }).module
        : entry;
    if (typeof module !== 'function' || visited.has(module)) return;
    visited.add(module);
    for (const controller of (Reflect.getMetadata('controllers', module) ??
      []) as Class[])
      controllers.add(controller);
    for (const imported of (Reflect.getMetadata('imports', module) ??
      []) as unknown[])
      visit(imported);
  };
  visit(root);
  return [...controllers];
}

describe('expired password protection', () => {
  const jwtGuard = AuthGuard('jwt');
  const routes = collectControllers(AppModule).flatMap((controller) =>
    Object.getOwnPropertyNames(controller.prototype)
      .map((name) => ({
        name: `${controller.name}.${name}`,
        controller,
        handler: (controller.prototype as Record<string, unknown>)[name],
      }))
      .filter(
        ({ name, handler }) =>
          !name.endsWith('.constructor') &&
          typeof handler === 'function' &&
          Reflect.getMetadata(PATH_METADATA, handler) !== undefined,
      ),
  );

  it('finds the application routes', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('blocks every authenticated route for expired passwords unless it is explicitly allowed', () => {
    const unprotected = routes
      .filter(({ controller, handler }) => {
        const guards = [
          ...((Reflect.getMetadata(GUARDS_METADATA, controller) ??
            []) as unknown[]),
          ...((Reflect.getMetadata(GUARDS_METADATA, handler as object) ??
            []) as unknown[]),
        ];
        if (!guards.includes(jwtGuard)) return false;
        const allowed =
          Reflect.getMetadata(ALLOW_EXPIRED_PASSWORD_KEY, handler as object) ??
          Reflect.getMetadata(ALLOW_EXPIRED_PASSWORD_KEY, controller);
        return !allowed && !guards.includes(PasswordStatusGuard);
      })
      .map(({ name }) => name);

    expect(unprotected).toEqual([]);
  });
});
