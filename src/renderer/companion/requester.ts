import type {
  CompanionRequester,
  CompanionSessionOptions,
} from '../../contracts/companion';
import { createCompanionSession } from './session';

/** One requester per immutable attempt. The mounted owner supplies the resolver. */
export function createCompanionRequester(
  options: Omit<CompanionSessionOptions, 'resolveTarget'>,
): CompanionRequester {
  let resolver: CompanionSessionOptions['resolveTarget'] | null = null;
  let registration = 0;
  const session = createCompanionSession({
    ...options,
    resolveTarget: (request, signal) =>
      resolver
        ? resolver(request, signal)
        : Promise.resolve({
            status: 'unavailable',
            message:
              'The activity context is unavailable. Reopen the activity and ask again.',
          }),
  });
  return {
    session,
    registerResolver(resolve) {
      const token = ++registration;
      if (resolver) session.stop('target-unavailable');
      resolver = resolve;
      return () => {
        if (registration !== token) return;
        registration += 1;
        resolver = null;
        session.stop('target-unavailable');
      };
    },
    dispose() {
      registration += 1;
      resolver = null;
      session.dispose();
    },
  };
}
