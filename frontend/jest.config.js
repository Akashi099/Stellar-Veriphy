/** @type {import('jest').Config} */
const config = {
  projects: [
    // ── Unit tests (Node environment) ───────────────────────────────────────
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/utils/**/__tests__/**/*.test.ts",
        "<rootDir>/src/utils/**/__tests__/**/*.test.ts",
        "<rootDir>/src/services/**/__tests__/**/*.test.ts",
        "<rootDir>/services/**/__tests__/**/*.test.ts",
        "<rootDir>/lib/**/__tests__/**/*.test.ts",
      ],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^@stellarveriphy/shared/(.*)$": "<rootDir>/../packages/shared/$1",
      },
      globals: {
        "ts-jest": { tsconfig: "<rootDir>/tsconfig.test.json" },
      },
    },

    // ── Component / hook tests (jsdom environment) ──────────────────────────
    {
      displayName: "components",
      preset: "ts-jest",
      testEnvironment: "jest-environment-jsdom",
      testMatch: [
        "<rootDir>/src/components/**/__tests__/**/*.test.tsx",
        "<rootDir>/src/hooks/**/__tests__/**/*.test.ts",
        "<rootDir>/src/hooks/**/__tests__/**/*.test.tsx",
        "<rootDir>/components/**/__tests__/**/*.test.tsx",
      ],
      testPathIgnorePatterns: ["/node_modules/", "\\.bench\\.test\\.tsx?$"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^@stellarveriphy/shared/(.*)$": "<rootDir>/../packages/shared/$1",
        "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
        "\\.(png|jpg|jpeg|gif|svg|ico|webp)$": "<rootDir>/__mocks__/fileMock.js",
      },
      globals: {
        "ts-jest": { tsconfig: "<rootDir>/tsconfig.test.json" },
      },
      setupFilesAfterFramework: [],
    },

    // ── Render-path benchmarks (jsdom environment, opt-in) ──────────────────
    // Run explicitly with: jest --selectProjects benchmarks
    // Kept out of the default run via the components project's
    // testPathIgnorePatterns so day-to-day test runs stay fast.
    {
      displayName: "benchmarks",
      preset: "ts-jest",
      testEnvironment: "jest-environment-jsdom",
      testMatch: [
        "<rootDir>/src/**/__benchmarks__/**/*.bench.test.tsx",
        "<rootDir>/src/**/__benchmarks__/**/*.bench.test.ts",
        "<rootDir>/src/components/**/__tests__/**/*.bench.test.tsx",
      ],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^@stellarveriphy/shared/(.*)$": "<rootDir>/../packages/shared/$1",
        "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
        "\\.(png|jpg|jpeg|gif|svg|ico|webp)$": "<rootDir>/__mocks__/fileMock.js",
      },
      globals: {
        "ts-jest": { tsconfig: "<rootDir>/tsconfig.test.json" },
      },
      setupFilesAfterFramework: [],
    },
  ],

  // Coverage collected from all source files across both projects
  collectCoverageFrom: [
    "utils/**/*.ts",
    "services/**/*.ts",
    "src/utils/**/*.ts",
    "src/services/**/*.ts",
    "src/hooks/**/*.ts",
    "!**/__tests__/**",
    "!**/__benchmarks__/**",
    "!**/*.d.ts",
  ],

  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = config;
