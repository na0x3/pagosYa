/**
 * The suites that talk to a real database. Serial on purpose: they CREATE and
 * DROP databases, and running them beside the main pool starves the
 * Next.js-compiling suites of CPU.
 *
 * `pnpm test` runs this after the main pool, so there is one entry point and
 * these cannot be forgotten.
 */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.integration\\.spec\\.ts$",
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  maxWorkers: 1,
};
