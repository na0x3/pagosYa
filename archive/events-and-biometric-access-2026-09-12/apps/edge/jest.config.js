module.exports = { preset: "ts-jest", testEnvironment: "node", roots: ["<rootDir>/src"], testMatch: ["**/*.spec.ts"], globals: { "ts-jest": { tsconfig: { types: ["node", "jest"] } } } };
