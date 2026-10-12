export default async function globalTeardown(): Promise<void> {
  await globalThis.__TEST_DB__?.stop();
}
