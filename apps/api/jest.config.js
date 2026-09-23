module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  // The *.integration.spec.ts suites drive a real Postgres, each creating and
  // dropping a database of its own. Run in this pool they compete with the
  // Next.js-compiling suites for the same machine, which is how
  // source-commerce-responsive.spec.ts starts timing out at 23s something it
  // does in 176ms alone. They run after this pool instead — see the `test`
  // script and jest.integration.config.js.
  testPathIgnorePatterns: ["/node_modules/", "\\.integration\\.spec\\.ts$"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
};
