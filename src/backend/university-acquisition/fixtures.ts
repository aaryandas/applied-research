export const FIXTURE_URLS = {
  mitAbstraction: new URL(
    './fixtures/mit-abstraction.jl.fixture',
    import.meta.url,
  ),
  mitLicense: new URL('./fixtures/mit-license.md.fixture', import.meta.url),
  delftIntroduction: new URL(
    './fixtures/delft-introduction.md.fixture',
    import.meta.url,
  ),
  delftCredits: new URL('./fixtures/delft-credits.md.fixture', import.meta.url),
  delftConfig: new URL('./fixtures/delft-config.yml.fixture', import.meta.url),
} as const;
