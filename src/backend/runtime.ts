import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import type { Server } from 'node:http';
import type { AuthService } from './auth.js';
import { Authentication, makeAuthLayer } from './auth.js';
import { makePostgresAccounting } from './accounting.js';
import type { BackendConfig } from './config.js';
import { Database, makeDatabaseLayer } from './database.js';
import type { DatabaseService } from './database.js';
import { makePostgresGenerationEvalBudget } from './generation-eval.js';
import { createHttpHandler } from './http.js';
import type { HttpDependencies } from './http.js';
import { makeLearningService } from './learning.js';
import type { LearningService } from './learning.js';
import { makeSourcedLearningApi } from './learning-api.js';
import type { SourcedLearningApi } from './learning-api.js';
import {
  makeAccountScopedAdmittedSourceLookup,
  type AccountScopedAdmittedSourceLookup,
} from './companion/index.js';
import {
  adaptGenerationEvalLedger,
  makeExplanationPlannerProvider,
  makeExplanationPlannerService,
  makePostgresApprovedRecipeReader,
  makePostgresPlannerAccounting,
  type ExplanationPlannerService,
} from './explanations/index.js';
import {
  createArtifactStore,
  createHttpsWorkerTransport,
  createRemoteRenderEngine,
  createRenderDeliveryService,
  createUnconfiguredRenderDelivery,
  readRenderHostConfig,
  type RenderDeliveryService,
} from './render-delivery/index.js';
import {
  makeOnboardingService,
  makePostgresOnboardingStore,
  type OnboardingService,
} from './onboarding/index.js';
import { BACKEND_MIGRATIONS } from './migrate.js';
import { makeOpenRouterProvider } from './provider.js';
import type { Diagnostics } from './diagnostics.js';
import { consoleDiagnostics } from './diagnostics.js';
import { createGuardedHttpsClient } from './sourcing/acquisition/guarded-http.js';
import { SourceAcquisitionAdapter } from './sourcing/acquisition/acquire.js';
import {
  makePostgresEmbeddingBudget,
  makePostgresOpenAlexBudget,
} from './sourcing/budgets.js';
import { makeSourcingService } from './sourcing/composition.js';
import {
  EmbeddingFailure,
  makeOpenRouterEmbeddingClient,
} from './sourcing/embedding.js';
import { makeLearningEvidenceSelector } from './sourcing/learning-evidence.js';
import { makeOpenAlexDiscoveryAdapter } from './sourcing/openalex/adapter.js';
import { OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD } from './sourcing/openalex/budget.js';
import { makePostgresSourceOperations } from './sourcing/operations.js';
import { makePostgresSourcePersistence } from './sourcing/persistence.js';
import type { SourcingService } from './sourcing/service.js';
import { bindUniversityLane } from './sourcing/university-join.js';
import { createProductionUniversityLane } from './sourcing/university-runtime.js';
import { createGuardedUniversityTransport } from './university-acquisition/index.js';

interface BackendServicesValue {
  readonly auth: AuthService;
  readonly learning: LearningService;
  readonly sourcing: SourcingService;
  readonly sourcedLearning: SourcedLearningApi;
  readonly onboarding: OnboardingService;
  readonly explanationPlanner: ExplanationPlannerService;
  readonly lookupAdmittedSource: AccountScopedAdmittedSourceLookup;
  readonly renderDelivery: RenderDeliveryService;
  readonly ready: () => Promise<boolean>;
}

class BackendServices extends Context.Tag('applied-research/BackendServices')<
  BackendServices,
  BackendServicesValue
>() {}

export interface BackendHandle {
  readonly port: number;
  readonly stop: () => Promise<void>;
}

export interface StartBackendOptions {
  readonly host?: string;
  readonly request?: typeof fetch;
  readonly diagnostics?: Diagnostics;
  readonly electronAuthCallbackScript?: Buffer;
}

const ELECTRON_AUTH_CALLBACK_SCRIPT = new URL(
  '../public/electron-auth-callback.js',
  import.meta.url,
);

async function composeRenderDelivery(
  database: DatabaseService,
): Promise<RenderDeliveryService> {
  const host = readRenderHostConfig();
  if (!host) return createUnconfiguredRenderDelivery();
  try {
    const transport = await createHttpsWorkerTransport({
      origin: host.origin,
      certificates: host.certificates,
    });
    return createRenderDeliveryService({
      engine: createRemoteRenderEngine({
        transport,
        stagingDirectory: host.stagingDirectory,
      }),
      store: createArtifactStore(host.artifactDirectory),
      resolveApprovedRecipe: makePostgresApprovedRecipeReader(database),
    });
  } catch {
    return createUnconfiguredRenderDelivery();
  }
}

function makeBackendLayer(
  config: BackendConfig,
  request: typeof fetch,
  diagnostics: Diagnostics,
): Layer.Layer<BackendServices> {
  const databaseLayer = makeDatabaseLayer(config.databaseUrl);
  const authenticationLayer = makeAuthLayer(config).pipe(
    Layer.provide(databaseLayer),
  );
  const dependencies = Layer.merge(databaseLayer, authenticationLayer);
  return Layer.effect(
    BackendServices,
    Effect.gen(function* () {
      const database = yield* Database;
      const auth = yield* Authentication;
      const accounting = makePostgresAccounting(database);
      const generationEval = makePostgresGenerationEvalBudget(database);
      const learning = yield* makeLearningService({
        accounting,
        provider: makeOpenRouterProvider(config.openRouterApiKey, request),
        config,
        now: () => new Date(),
        diagnostics,
        generationEval,
      });
      const runEffect = <A, E>(
        effect: Effect.Effect<A, E>,
        signal?: AbortSignal,
      ): Promise<A> =>
        Effect.runPromise(effect, signal ? { signal } : undefined);
      const persistence = makePostgresSourcePersistence(database);
      const operations = makePostgresSourceOperations(database);
      const sourceHttp = createGuardedHttpsClient();
      const universityLane = createProductionUniversityLane({
        transport: createGuardedUniversityTransport(sourceHttp),
      });
      bindUniversityLane(universityLane);
      const acquisition = new SourceAcquisitionAdapter({
        http: sourceHttp,
        clock: { now: () => new Date() },
      });
      const openAlex =
        config.openAlexApiKey && config.openAlexMonthlyLimitMicrousd
          ? makeOpenAlexDiscoveryAdapter({
              apiKey: config.openAlexApiKey,
              maximumSearchCostMicrousd:
                OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD,
              budget: makePostgresOpenAlexBudget(
                database,
                config.openAlexMonthlyLimitMicrousd,
              ),
              runEffect,
              request,
            })
          : undefined;
      const embedding = config.sourceIndexLive
        ? makeOpenRouterEmbeddingClient({
            apiKey: config.openRouterApiKey,
            request,
          })
        : undefined;
      const embeddingBudget = config.sourceIndexLive
        ? makePostgresEmbeddingBudget(
            database,
            config.embeddingEvalLimitMicrousd,
          )
        : undefined;
      const liveIndex =
        embedding &&
        embeddingBudget &&
        config.turbopufferApiKey &&
        config.turbopufferRegion
          ? {
              request,
              apiKey: config.turbopufferApiKey,
              region: config.turbopufferRegion,
              embedQuery: async () => {
                throw new EmbeddingFailure({ reason: 'unavailable' });
              },
            }
          : undefined;
      const sourcing = makeSourcingService({
        persistence,
        operations,
        acquisition,
        openAlex,
        liveIndex,
        embedding,
        embeddingBudget,
        catalogSources: universityLane.catalog,
        universityAcquisition: universityLane.api,
        universityTransport: universityLane.transport,
        diagnostics,
        runEffect,
      });
      const evidenceSelector = makeLearningEvidenceSelector(
        persistence,
        sourcing,
        runEffect,
      );
      const sourcedLearning = makeSourcedLearningApi({
        learning,
        diagnostics,
        operations,
        clock: () => new Date(),
        selectEvidence: evidenceSelector,
      });
      const onboarding = makeOnboardingService({
        learning,
        operations,
        proposals: makePostgresOnboardingStore(database),
        selectEvidence: evidenceSelector,
        sourcing,
        runEffect,
        diagnostics,
      });
      const explanationPlanner = yield* makeExplanationPlannerService({
        accounting: makePostgresPlannerAccounting(database),
        generation: adaptGenerationEvalLedger(generationEval),
        provider: makeExplanationPlannerProvider({
          apiKey: config.openRouterApiKey,
          request,
        }),
        config,
        now: () => new Date(),
        diagnostics,
      });
      const lookupAdmittedSource = makeAccountScopedAdmittedSourceLookup(
        persistence,
        runEffect,
      );
      const renderDelivery = yield* Effect.promise(() =>
        composeRenderDelivery(database),
      );
      return {
        auth,
        learning,
        sourcing,
        sourcedLearning,
        onboarding,
        explanationPlanner,
        lookupAdmittedSource,
        renderDelivery,
        ready: async () => {
          try {
            const migration = await database.pool.query(
              'SELECT name FROM backend_migration WHERE name = ANY($1::text[])',
              [BACKEND_MIGRATIONS],
            );
            return migration.rowCount === BACKEND_MIGRATIONS.length;
          } catch (cause) {
            diagnostics.report('database.readiness-failed', cause);
            return false;
          }
        },
      };
    }),
  ).pipe(Layer.provide(dependencies));
}

export async function startHttpServer(
  dependencies: HttpDependencies,
  port: number,
  host = '127.0.0.1',
): Promise<BackendHandle> {
  const handler = createHttpHandler(dependencies);
  const diagnostics = dependencies.diagnostics ?? consoleDiagnostics;
  const server = createServer((request, response) => {
    void handler(request, response).catch((cause) => {
      diagnostics.report('http.handler-failed', cause);
      if (!response.headersSent) {
        response.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
      }
      if (!response.writableEnded) {
        response.end('{"status":"unavailable"}');
      }
    });
  });
  await listen(server, port, host);
  const address = server.address();
  if (!address || typeof address === 'string') {
    await close(server);
    throw new Error('Backend did not bind a TCP port.');
  }
  let stopped = false;
  return {
    port: address.port,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await close(server);
    },
  };
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function startBackend(
  config: BackendConfig,
  options: StartBackendOptions = {},
): Promise<BackendHandle> {
  const electronAuthCallbackScript =
    options.electronAuthCallbackScript ??
    (await readFile(ELECTRON_AUTH_CALLBACK_SCRIPT));
  const runtime = ManagedRuntime.make(
    makeBackendLayer(
      config,
      options.request ?? fetch,
      options.diagnostics ?? consoleDiagnostics,
    ),
  );
  try {
    const services = await runtime.runPromise(BackendServices);
    const server = await startHttpServer(
      {
        auth: services.auth,
        electronAuthCallbackScript,
        learning: services.learning,
        sourcing: services.sourcing,
        sourcedLearning: services.sourcedLearning,
        onboarding: services.onboarding,
        explanationPlanner: services.explanationPlanner,
        lookupAdmittedSource: services.lookupAdmittedSource,
        renderDelivery: services.renderDelivery,
        ready: services.ready,
        diagnostics: options.diagnostics ?? consoleDiagnostics,
        runEffect: (effect, signal) =>
          runtime.runPromise(effect, signal ? { signal } : undefined),
      },
      config.port,
      options.host ?? '0.0.0.0',
    );
    return {
      port: server.port,
      stop: async () => {
        await services.renderDelivery.close();
        await server.stop();
        await runtime.dispose();
      },
    };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
